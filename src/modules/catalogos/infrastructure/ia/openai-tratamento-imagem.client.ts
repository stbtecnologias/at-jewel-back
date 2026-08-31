import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ImagemDeEntrada,
  ImagemTratada,
  ITratamentoImagem,
  PedidoDeTratamento,
} from '../../domain/ports/tratamento-imagem.port';

const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const MODELO_PADRAO = 'gpt-image-1';

/**
 * Geracao de imagem e lenta — 10 a 30 segundos e normal. O timeout e generoso
 * de proposito: cortar em 30s desperdicaria uma chamada ja paga por causa de
 * um pico de fila do provedor.
 */
const TIMEOUT_MS = 120_000;

/** Quantas referencias vao junto. Mais que isso encarece sem melhorar. */
const MAX_REFERENCIAS = 3;

/**
 * A REGRA QUE NAO SE NEGOCIA.
 *
 * Vem primeiro no prompt e e repetida no fim, porque instrucao no meio de
 * texto longo e a que mais se perde. Um modelo de imagem "melhora" o que ve se
 * ninguem o proibir: acrescenta pedra, arredonda um formato, corrige uma
 * assimetria que era da peca. O resultado seria um catalogo mostrando joia que
 * a loja nao tem — e o cliente pedindo o que nao existe.
 */
const REGRA_PECA_INTOCADA =
  'REGRA ABSOLUTA: a joia da primeira imagem não pode ser alterada de forma ' +
  'alguma. Mantenha exatamente o mesmo número de pedras, o mesmo formato, o ' +
  'mesmo corte, a mesma cor de metal e as mesmas proporções entre as partes. ' +
  'Não adicione, não remova, não corrija, não embeleze nenhum detalhe da peça. ' +
  'Você está tratando apenas a APRESENTAÇÃO: fundo, iluminação, sombra, ' +
  'enquadramento e nitidez.';

/**
 * O PADRAO DA CASA, DITO COM TODAS AS LETRAS.
 *
 * A primeira versao pedia "mesmo tipo de fundo, mesma iluminacao" e confiava
 * no modelo para deduzir o resto das referencias. Nao funcionou, e o motivo e
 * instrutivo: AS REFERENCIAS SAO PAGINAS DE CATALOGO, e nao packshots. Elas
 * trazem a peca, o texto ao lado e o papel em volta — e o modelo copiou o tom
 * do papel, devolvendo a peca sobre fundo bege e vista de cima.
 *
 * Conferido nos catalogos reais em 31/08/2026: a peca aparece recortada sobre
 * BRANCO, de frente, na altura do olho. Sem cenario, sem superficie, sem mesa.
 *
 * Entao o packshot passa a ser descrito aqui, e as referencias servem ao que
 * elas de fato ensinam: proporcao da peca no quadro, temperatura da luz,
 * acabamento do metal. Nao o layout da pagina.
 */
const PADRAO_PACKSHOT =
  'Fundo BRANCO liso e uniforme. Sem cenário, sem mesa, sem superfície ' +
  'visível, sem gradiente, sem textura e sem cor de papel. Sombra mínima ou ' +
  'nenhuma. A peça deve aparecer DE FRENTE, na altura do olho, como produto ' +
  'fotografado em estúdio — nunca vista de cima nem em perspectiva inclinada. ' +
  'Centralizada, ocupando a maior parte do quadro.';

const INSTRUCAO_BASE =
  'A primeira imagem é a foto de uma joia, tirada com celular. As imagens ' +
  'seguintes são páginas de catálogos anteriores desta joalheria. ' +
  'ATENÇÃO: use as páginas apenas como referência de como a PEÇA é ' +
  'apresentada — proporção no quadro, temperatura da luz, acabamento do ' +
  'metal. NÃO copie o layout da página, NÃO copie a cor do papel e NÃO ' +
  'reproduza nenhum texto delas. Não escreva texto algum na imagem. ' +
  `Produza a foto da primeira imagem assim: ${PADRAO_PACKSHOT}`;

/**
 * Tratamento da foto pela API de imagens da OpenAI.
 *
 * HTTP direto, sem SDK — mesmo caminho do `OpenaiTranscricaoClient`. Trazer o
 * pacote da OpenAI so para duas chamadas nao se paga, e o `fetch` do Node 22 da
 * conta.
 *
 * SEGUNDO ponto do backend que fala com provedor fora da Anthropic, e pelo
 * mesmo motivo do primeiro: a Anthropic nao gera imagem.
 *
 * O QUE SAI DAQUI: a foto da peca e as referencias do catalogo. Nao vai nome de
 * cliente, telefone, preco nem qualquer dado do ERP — o texto entra depois, e
 * por composicao nossa.
 */
@Injectable()
export class OpenaiTratamentoImagemClient implements ITratamentoImagem {
  private readonly logger = new Logger(OpenaiTratamentoImagemClient.name);

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY'));
  }

  async tratar(pedido: PedidoDeTratamento): Promise<ImagemTratada | null> {
    const chave = this.config.get<string>('OPENAI_API_KEY');
    if (!chave) {
      this.logger.warn('OPENAI_API_KEY ausente — foto nao tratada.');
      return null;
    }

    const form = new FormData();
    form.append(
      'model',
      this.config.get<string>('OPENAI_IMAGEM_MODEL') ?? MODELO_PADRAO,
    );
    form.append('prompt', this.montarPrompt(pedido));
    form.append('size', pedido.formato === '9:16' ? '1024x1536' : '1536x1024');
    form.append('n', '1');

    // A ORDEM IMPORTA: a primeira imagem e a peca, as demais sao referencia —
    // e o prompt diz isso com todas as letras. Inverter faria o modelo tratar
    // uma pagina de catalogo antigo como se fosse a joia nova.
    form.append('image[]', this.paraBlob(pedido.original), 'peca.png');
    for (const [i, ref] of pedido.referencias
      .slice(0, MAX_REFERENCIAS)
      .entries()) {
      form.append('image[]', this.paraBlob(ref), `referencia-${i + 1}.png`);
    }

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        // Corpo no log: aqui nao ha PII — a resposta de erro fala de modelo,
        // cota e formato, e sem ela nao da para distinguir chave invalida de
        // conteudo recusado.
        const corpo = await resp.text();
        this.logger.error(
          `OpenAI /images/edits ${resp.status}: ${corpo.slice(0, 300)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as { data?: { b64_json?: string }[] };
      const b64 = dados.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.error('OpenAI devolveu resposta sem imagem.');
        return null;
      }

      return { conteudo: Buffer.from(b64, 'base64'), mime: 'image/png' };
    } catch (err) {
      this.logger.error(`Falha ao tratar a foto: ${String(err)}`);
      return null;
    }
  }

  /**
   * O prompt e montado do CATALOGO, nao fixado aqui.
   *
   * O que muda entre coleções — fonte, composição, cor, iluminação — vive nas
   * referencias de texto, e quem edita e o marketing pelo painel. Fixar isso em
   * constante obrigaria deploy a cada coleção nova.
   *
   * A ordem e deliberada: regra dura, instrucao base, padrao do catalogo,
   * pedido pontual, regra dura de novo. O pedido da pessoa vem DEPOIS do padrao
   * para poder contraria-lo ("fundo rosa" numa coleção de fundo branco), e a
   * regra da peca fecha porque instrucao no fim pesa mais que no meio.
   */
  private montarPrompt(pedido: PedidoDeTratamento): string {
    const partes = [REGRA_PECA_INTOCADA, INSTRUCAO_BASE];

    if (pedido.padrao?.trim()) {
      partes.push(`Padrão desta coleção: ${pedido.padrao.trim()}`);
    }
    if (pedido.pedidoDaPessoa?.trim()) {
      partes.push(`Pedido para esta peça: ${pedido.pedidoDaPessoa.trim()}`);
    } else {
      partes.push('Fundo branco liso, se a coleção não indicar outro.');
    }

    partes.push(REGRA_PECA_INTOCADA);
    return partes.join('\n\n');
  }

  private paraBlob(imagem: ImagemDeEntrada): Blob {
    return new Blob([new Uint8Array(imagem.conteudo)], { type: imagem.mime });
  }
}
