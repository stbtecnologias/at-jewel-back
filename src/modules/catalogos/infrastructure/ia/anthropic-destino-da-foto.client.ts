import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IInterpretadorDeDestino,
  OpcoesDeDestino,
} from '../../domain/ports/destino-da-foto.port';
import { modeloDeIa } from '../../../../shared/config/modelo-de-ia';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

/**
 * O MODELO MAIS BARATO DA CASA, como na conferência da foto.
 *
 * A pergunta é "qual destes ela escolheu?" — classificação sobre uma lista
 * curta, sem raciocínio. Pagar o modelo grande por isso sairia caro numa etapa
 * que roda a cada resposta de destino.
 */
const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

/** Curto: esta chamada está no caminho da resposta ao WhatsApp. */
const TIMEOUT_MS = 10_000;

/** O modelo devolve um JSON de dois campos. */
const MAX_TOKENS = 150;

/**
 * INTERPRETA A RESPOSTA DE DESTINO — 20/10/2026.
 *
 * ==========================================================================
 * O QUE SE PERGUNTA, E O CUIDADO ESTÁ NO QUE NÃO SE PERGUNTA.
 *
 * Não se pergunta o que ela quer fazer, nem se a foto é boa, nem qual peça é.
 * A pergunta é uma só: **dos destinos que EXISTEM, qual é o dela?**
 *
 * O conjunto é fechado e vai na própria pergunta. Assim o modelo não tem como
 * inventar um catálogo nem um código — o máximo que ele pode errar é escolher
 * o destino errado DENTRE OS REAIS, e `NENHUM` é sempre uma saída.
 * ==========================================================================
 *
 * E NADA DE PII SOBE: só o texto dela, os números e nomes dos catálogos e o
 * código da peça. Nenhum nome de cliente, nenhum telefone.
 */
@Injectable()
export class AnthropicDestinoDaFotoClient implements IInterpretadorDeDestino {
  private readonly logger = new Logger(AnthropicDestinoDaFotoClient.name);

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  async interpretar(
    texto: string,
    opcoes: OpcoesDeDestino,
  ): Promise<unknown> {
    return this.perguntarAoModelo(this.pergunta(texto, opcoes), 'Destino da foto');
  }

  /** VER ou MANDAR — a mesma chamada, outra pergunta. Ver o port. */
  async interpretarPedido(
    texto: string,
    peca: { codigo: string; descricao: string | null },
  ): Promise<unknown> {
    return this.perguntarAoModelo(
      this.perguntaDoPedido(texto, peca),
      'Pedido sobre a peca',
    );
  }

  private async perguntarAoModelo(
    pergunta: string,
    rotulo: string,
  ): Promise<unknown> {
    const chave = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!chave) return null;

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': chave,
          'anthropic-version': VERSAO_API,
        },
        body: JSON.stringify({
          model: modeloDeIa(
            this.config,
            'ANTHROPIC_MODEL_DESTINO',
            MODELO_PADRAO,
          ),
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: pergunta }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        this.logger.warn(`${rotulo}: ${resp.status}`);
        return null;
      }

      const corpo = (await resp.json()) as {
        content?: { type: string; text?: string }[];
      };
      const texto0 = corpo.content?.find((c) => c.type === 'text')?.text ?? '';
      const json = texto0.match(/\{[\s\S]*\}/)?.[0];
      return json ? (JSON.parse(json) as unknown) : null;
    } catch (e) {
      // Indisponibilidade do provedor NAO pode fechar o canal: quem chama cai
      // no caminho deterministico.
      this.logger.warn(`${rotulo} nao interpretado: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * A PERGUNTA É DE DUAS SAÍDAS, e por isso ela é fácil de acertar.
   *
   * A peça já foi encontrada no ERP antes de chegar aqui — então o modelo não
   * decide QUAL peça, nem SE ela existe. Decide só a direção da frase: quem
   * pede para ver, ou quem avisa que vai mandar.
   */
  private perguntaDoPedido(
    texto: string,
    peca: { codigo: string; descricao: string | null },
  ): string {
    return (
      'Uma pessoa do estoque escreveu uma mensagem sobre a peça de código ' +
      `"${peca.codigo}"` +
      (peca.descricao ? `, que é "${peca.descricao}"` : '') +
      '.\n\n' +
      `Ela escreveu: "${texto}"\n\n` +
      'Responda SÓ com JSON, sem texto em volta:\n' +
      '{"intencao": "VER"|"ENVIAR"|"NENHUM"}\n\n' +
      'Critério:\n' +
      '- "VER" quando ela quer RECEBER as fotos que já existem dessa peça: ' +
      '"me manda as fotos que você tem", "quais fotos tem", "quero ver as ' +
      'imagens", "tem foto dessa referência?".\n' +
      '- "ENVIAR" quando ela avisa que VAI MANDAR fotos novas para essa peça: ' +
      '"vou mandar as fotos", "as próximas são dessa", "sobe essas aqui nela".\n' +
      '- "NENHUM" quando a mensagem não é sobre as fotos dessa peça — preço, ' +
      'estoque, outro assunto, ou algo que não dá para decidir.\n\n' +
      'NA DÚVIDA entre VER e ENVIAR, responda "VER": mandar as fotos de volta ' +
      'se desfaz sozinho, e abrir destino errado faz a próxima foto ser ' +
      'arquivada na peça errada, calada.'
    );
  }

  private pergunta(texto: string, opcoes: OpcoesDeDestino): string {
    const catalogos = opcoes.catalogos
      .map((c) => `  - catálogo número "${c.numero}", chamado "${c.nome}"`)
      .join('\n');
    const peca = opcoes.peca
      ? `  - a peça de código "${opcoes.peca.codigo}"` +
        (opcoes.peca.descricao ? `, que é "${opcoes.peca.descricao}"` : '') +
        ' — foi dela que a conversa estava falando agora'
      : '  (nenhuma peça em conversa)';

    return (
      'Uma pessoa do estoque mandou uma foto e eu perguntei para onde ela vai. ' +
      'Os destinos que existem são:\n\n' +
      `${catalogos}\n${peca}\n\n` +
      `Ela respondeu: "${texto}"\n\n` +
      'Responda SÓ com JSON, sem texto em volta:\n' +
      '{"destino": "CATALOGO"|"PECA"|"NENHUM", "numero": "<número do catálogo>"|null}\n\n' +
      'Critério:\n' +
      '- "PECA" quando ela se refere à peça: pelo código, pelo tipo ("o brinco", ' +
      '"aquele anel"), por "produto", "peça", "item", ou por qualquer jeito de ' +
      'dizer que é na própria joia e não numa coleção.\n' +
      '- "CATALOGO" quando ela se refere a um dos catálogos acima, pelo número ' +
      'ou por parte do nome, mesmo escrito diferente ("under 25", "o de 25 mil").\n' +
      '- "NENHUM" quando a resposta não é sobre destino nenhum — uma pergunta ' +
      'sobre outro assunto, um "oi", ou algo que não dá para decidir.\n\n' +
      'NA DÚVIDA entre os dois, responda "NENHUM": perguntar de novo é barato, ' +
      'e publicar no lugar errado não se desfaz sozinho.'
    );
  }
}
