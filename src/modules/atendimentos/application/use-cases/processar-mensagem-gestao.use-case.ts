import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { ANASTASIA_GESTAO_SYSTEM } from '../../../agentes/application/personas';
import { LLM_CLIENT } from '../../../agentes/domain/ports/injection-tokens';
import type { ILlmClient } from '../../../agentes/domain/ports/llm-client.port';
import { CombinadosService } from '../../../agentes/application/combinados.service';
import { PermissionsService } from '../../../auth/application/permissions.service';
import { EscopoVendasService } from '../../../vendas/application/escopo-vendas.service';
import { FerramentasGestaoService } from '../ferramentas-gestao.service';
import { MemoriaConversaService } from '../memoria-conversa.service';
import { modeloDeIa } from '../../../../shared/config/modelo-de-ia';

export interface MensagemGestao {
  /** Id do usuario. E a CHAVE da memoria de conversa — nunca o telefone. */
  usuarioId: string;
  /** Nome de quem esta falando, para a agente tratar pelo primeiro nome. */
  nome: string | null;
  /**
   * Papel de quem esta falando — 28/09/2026.
   *
   * QUEM ENTROU NAO VE MAIS TUDO IGUAL. Ate aqui, passar pela porta
   * (`PERMISSAO_GESTAO`) dava as 17 ferramentas com o mesmo alcance para toda a
   * administracao. Com o papel GERENTE_VENDAS isso deixou de valer: ele
   * gerencia as vendedoras e nao ve o faturamento da loja.
   *
   * O PAPEL, e nao a permissao ja resolvida, porque quem monta as ferramentas e
   * este use case. Deixar o roteador resolver espalharia a regra por dois
   * arquivos, e o segundo e o que ninguem lembra de atualizar.
   */
  role: string;
  texto: string;
}

export interface RespostaGestao {
  resposta: string;
  motivo: 'conversa' | 'falha_agente';
}

/**
 * O canal interno da GESTAO, no WhatsApp.
 *
 * ==========================================================================
 * A IMAGEM EM ESPELHO DO CANAL DA VENDEDORA, E A COMPARACAO E O PONTO.
 *
 * La (`ProcessarMensagemInternaUseCase`) o `vendedoraId` entra por CLOSURE,
 * vindo do telefone, e nenhuma ferramenta aceita "de quem" — o escopo e
 * ausencia de caminho, nao regra de prompt.
 *
 * Aqui e o contrario por desenho: quem fala e da administracao, entao "de
 * quem" e justamente o que ela informa. As ferramentas sao OUTRAS
 * (`gestaoAgenda` e nao `consultarAgenda`), e e por isso que a assimetria se
 * sustenta: se eu tivesse acrescentado um `vendedora?` opcional as ferramentas
 * da vendedora, bastaria o modelo preencher esse campo no canal dela para o
 * escopo cair inteiro.
 * ==========================================================================
 *
 * AS FERRAMENTAS VEM DO `FerramentasGestaoService` — o MESMO que o painel usa.
 * Aqui fica so o que e proprio do WhatsApp: quem esta falando, a memoria da
 * conversa e a ausencia de grafico.
 *
 * QUEM CHEGA AQUI JA FOI RECONHECIDO como usuario com permissao de gestao. A
 * verificacao mora no `BuscarAdminPorTelefoneUseCase`, antes desta chamada.
 */
@Injectable()
export class ProcessarMensagemGestaoUseCase {
  private readonly logger = new Logger(ProcessarMensagemGestaoUseCase.name);

  constructor(
    private readonly ferramentas: FerramentasGestaoService,
    private readonly memoria: MemoriaConversaService,
    private readonly permissoes: PermissionsService,
    private readonly escopo: EscopoVendasService,
    private readonly combinados: CombinadosService,
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    private readonly config: ConfigService,
  ) {}

  async execute(msg: MensagemGestao): Promise<RespostaGestao> {
    const primeiroNome = msg.nome?.trim().split(/\s+/)[0] ?? null;

    // OS COMBINADOS ENTRAM NO PROMPT — ANA-16, 28/09/2026. Vem do banco a cada
    // mensagem, e e isso que os faz sobreviver a restart e valer tambem no
    // painel. Vazio quando nao ha nenhum, e aí o prompt fica como era.
    const combinados = await this.combinados.paraPrompt('anastasia');

    const system =
      `${ANASTASIA_GESTAO_SYSTEM}\n\n` +
      (primeiroNome ? `Você está falando com ${primeiroNome}. ` : '') +
      `Agora são ${agoraLocal()} (fuso da loja) — use isto para entender "hoje", ` +
      `"amanhã" e horários relativos.` +
      (combinados ? `\n\n${combinados}` : '');

    // A conversa anterior, se houver. Sem isso, "e a Beatriz?" ou "pode
    // transferir" chegariam como frases soltas. Ver MemoriaConversaService.
    const chave = MemoriaConversaService.chaveGestao(msg.usuarioId);
    const historico = this.memoria.carregar(chave);
    const pergunta = limparEHigienizar(msg.texto);

    try {
      const { texto } = await this.llm.chatComFerramentas({
        model: modeloDeIa(this.config, 'ANTHROPIC_MODEL_GESTAO', 'claude-opus-4-8'),
        system,
        maxTokens: 700,
        mensagens: [...historico, { role: 'user', content: pergunta }],
        // Mesmo motivo do canal da vendedora: WhatsApp nao renderiza grafico.
        graficos: false,
        // O nome de quem fala vai junto: quando ele agenda, a vendedora recebe
        // um aviso dizendo de quem veio o compromisso.
        //
        // O `verLoja` decide se as ferramentas podem falar da LOJA ou so de
        // cada vendedora — ver `ContextoGestao`. A chave e `analytics:read`,
        // a mesma que guarda o modulo de Analytics no painel: uma so, para a
        // resposta nao depender da porta por onde a pergunta entrou.
        ...this.ferramentas.montar({
          solicitante: msg.nome,
          verLoja: await this.permissoes.possui(msg.role, 'analytics:read'),
          // A quantidade por peca e outra pergunta, com outra chave — a MESMA
          // que a API de produtos usa. Ver `ContextoGestao.verQuantidade`.
          verQuantidade: await this.permissoes.possui(
            msg.role,
            'estoque:quantidade',
          ),
          // AS VENDEDORAS QUE ELA ALCANCA — 28/09/2026. Vem do MESMO
          // `EscopoVendasService` que a tela de Vendas usa: uma regra, duas
          // portas. Sem isso, a gerente de um time veria o desempenho das
          // vendedoras dos outros pelo WhatsApp e nao pelo painel — a mesma
          // pergunta com resposta diferente conforme a porta.
          equipe: await this.escopo.equipeDoUsuario(msg.usuarioId),
        }),

        // OS COMBINADOS — ANA-16 e ANA-18. Ficam FORA do
        // `FerramentasGestaoService` de proposito: aquele e o que a agente
        // sabe sobre a LOJA, e isto e o que ela sabe sobre ela mesma. Misturar
        // os dois faria a lista de ferramentas de negocio crescer com uma que
        // nao consulta dado nenhum.
        ...this.combinados.handlers('anastasia', msg.usuarioId),
      });

      // So guarda o que deu certo. Turno com falha na memoria faria a proxima
      // resposta se apoiar num erro.
      this.memoria.registrar(chave, pergunta, texto);
      return { resposta: texto, motivo: 'conversa' };
    } catch (err) {
      this.logger.error(
        `Falha do agente de gestao: ${err instanceof Error ? err.message : err}`,
      );
      return {
        resposta: 'Não consegui consultar isso agora. Pode tentar de novo em instantes?',
        motivo: 'falha_agente',
      };
    }
  }
}

function agoraLocal(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'full',
    timeStyle: 'short',
  });
}
