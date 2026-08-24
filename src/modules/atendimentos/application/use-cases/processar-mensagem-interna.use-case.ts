import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { limparEHigienizar } from '../../../../shared/http/sanitize/sanitize-text.transform';
import { ELENA_INTERNA_SYSTEM } from '../../../agentes/application/personas';
import { LLM_CLIENT } from '../../../agentes/domain/ports/injection-tokens';
import type { ILlmClient } from '../../../agentes/domain/ports/llm-client.port';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { TRANSCRICAO_SERVICE } from '../../../transcricao/domain/ports/injection-tokens';
import {
  LIMITE_SEGUNDOS,
  type ITranscricao,
} from '../../../transcricao/domain/ports/transcricao.port';
import { BuscarVendedoraPorWhatsappUseCase } from '../../../vendedoras/application/use-cases/buscar-vendedora-por-whatsapp.use-case';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';
import { FerramentasVendedoraService } from '../ferramentas-vendedora.service';
import { MemoriaConversaService } from '../memoria-conversa.service';

/**
 * Audio que acompanhou a mensagem. Descrito aqui, na camada de aplicacao, para
 * o use case nao depender do tipo que o parser do WAHA exporta na infra.
 */
export interface AudioInterno {
  /** Arquivo ja descriptografado pelo provedor; `null` se ele nao entregou. */
  url: string | null;
  mimetype: string;
  segundos: number | null;
}

export interface MensagemInterna {
  /** Chat de origem, ja traduzido de LID para telefone na borda HTTP. */
  de: string;
  /** Vazio quando a vendedora mandou audio puro — ver `audio`. */
  texto: string;
  audio?: AudioInterno;
}

export interface RespostaInterna {
  /** Texto a devolver, ou null quando a mensagem deve ser ignorada em silencio. */
  resposta: string | null;
  /** Rotulo do que aconteceu, para o log. Nunca contem PII. */
  motivo:
    | 'ignorado_remetente_desconhecido'
    | 'ignorado_sem_conteudo'
    | 'relato_registrado'
    | 'conversa'
    | 'audio_nao_entendido'
    | 'falha_agente';
}

/**
 * Porta de entrada do canal INTERNO de WhatsApp (vendedoras).
 *
 * DEFAULT-DENY POR REMETENTE, e essa e a primeira coisa que acontece: telefone
 * que nao pertence a uma vendedora ativa nao recebe resposta e NAO chega ao
 * LLM. Nao e "numero secreto e torcer" — e verificacao no banco, pelo HMAC do
 * telefone, antes de qualquer processamento.
 *
 * Silencio, e nao uma mensagem de erro, e deliberado: responder "voce nao esta
 * cadastrado" confirmaria a quem sondasse que existe um canal aqui.
 *
 * ==========================================================================
 * O AGENTE VEM ANTES DO RELATO, e a ordem importa.
 *
 * Ate 20/08/2026 toda mensagem ia direto para o extrator de relato. Ao ganhar
 * ferramentas, manter essa ordem seria perigoso: uma pergunta como "como esta
 * minha agenda hoje?" chegando com cobranca aberta cairia num extrator que
 * procura {contatou, resultado} — e ele poderia devolver NAO_CONSEGUIU_FALAR,
 * gravando um relato falso e agendando retomada. Errado e silencioso.
 *
 * Entao quem decide o que a mensagem E e o agente, e registrar o relato virou
 * ferramenta dele. A EXTRACAO continua identica, no
 * ProcessarRelatoVendedoraUseCase: o agente roteia, o especialista extrai.
 *
 * ESCOPO: as ferramentas recebem o `vendedoraId` por CLOSURE, resolvido do
 * telefone. Nenhuma aceita "de quem" como parametro — nao e regra de prompt, e
 * ausencia de caminho.
 * ==========================================================================
 */
@Injectable()
export class ProcessarMensagemInternaUseCase {
  private readonly logger = new Logger(ProcessarMensagemInternaUseCase.name);

  constructor(
    private readonly identificarVendedora: BuscarVendedoraPorWhatsappUseCase,
    private readonly ferramentas: FerramentasVendedoraService,
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly atendimentos: IAtendimentoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    @Inject(TRANSCRICAO_SERVICE)
    private readonly transcricao: ITranscricao,
    private readonly memoria: MemoriaConversaService,
    private readonly config: ConfigService,
  ) {}

  async execute(msg: MensagemInterna): Promise<RespostaInterna> {
    const telefone = msg.de.replace(/@.*$/, '');
    const vendedora = await this.identificarVendedora.execute(telefone);

    if (!vendedora?.id) {
      // Nao logamos o numero: e PII, e o log e o lugar mais facil de vazar.
      this.logger.debug('Mensagem interna de remetente nao reconhecido — ignorada.');
      return { resposta: null, motivo: 'ignorado_remetente_desconhecido' };
    }

    const vendedoraId = vendedora.id;
    const primeiroNome = vendedora.nome.trim().split(/\s+/)[0];

    // AUDIO VIRA TEXTO AQUI, E SO AQUI — depois do default-deny, de proposito.
    //
    // Transcrever e chamada PAGA. Se acontecesse na borda HTTP, qualquer pessoa
    // que mandasse audio para o numero queimaria credito, inclusive quem nunca
    // sera atendido. Atras do reconhecimento da vendedora, audio de estranho
    // sai tao barato quanto texto de estranho: nao sai do lugar.
    //
    // Daqui para baixo nada sabe que houve audio. O texto segue exatamente o
    // caminho de uma mensagem digitada.
    const textoDaMensagem = await this.resolverTexto(msg);
    if (textoDaMensagem === null) {
      return {
        resposta:
          `${primeiroNome}, chegou seu áudio mas não consegui ouvir. ` +
          `Pode mandar por escrito?`,
        motivo: 'audio_nao_entendido',
      };
    }
    if (!textoDaMensagem) {
      // Nao deveria acontecer: o parser do webhook so entrega mensagem com
      // texto ou com audio. Se acontecer, silencio — e melhor que mandar
      // string vazia para o LLM e receber um 400.
      return { resposta: null, motivo: 'ignorado_sem_conteudo' };
    }

    // A carteira e por codigo do ERP, nao por id — e o mesmo campo que o
    // avisar_vendedora usa. Vendedora sem codigo simplesmente nao tem
    // carteira, e as ferramentas devolvem vazio.
    const codigoErp = vendedora.codigoErp;

    // O que o agente precisa saber antes de decidir. Pre-carregado como DADO,
    // do mesmo jeito que a Anastasia do painel recebe o contexto da aba.
    const pendencia = await this.montarContextoPendencia(vendedoraId);

    const system =
      `${ELENA_INTERNA_SYSTEM}\n\n` +
      `Você está falando com ${primeiroNome}. Agora são ${agoraLocal()} (fuso da loja) — ` +
      `use isto para entender "hoje", "amanhã" e horários relativos.\n\n${pendencia}`;

    let relatoRegistrado = false;

    // A conversa anterior dela, se houver. Sem isso "e amanha?" chegaria como
    // frase solta. A chave e o ID — nunca o telefone. Ver MemoriaConversaService.
    const chave = MemoriaConversaService.chaveVendedora(vendedoraId);
    const historico = this.memoria.carregar(chave);
    const pergunta = limparEHigienizar(textoDaMensagem);

    try {
      const { texto } = await this.llm.chatComFerramentas({
        model: this.config.get<string>('ANTHROPIC_MODEL_INTERNO') ?? 'claude-opus-4-8',
        system,
        maxTokens: 700,
        mensagens: [...historico, { role: 'user', content: pergunta }],
        // WhatsApp nao renderiza grafico. Oferecer a ferramenta so convida o
        // modelo a tentar e depois se desculpar.
        graficos: false,
        // AS FERRAMENTAS VEM DO SERVICO — o MESMO que a Elena do painel usa.
        // Aqui fica so o que e proprio do WhatsApp: quem esta falando (por
        // closure, do telefone resolvido), a memoria e a ausencia de grafico.
        ...this.ferramentas.montar({
          vendedoraId,
          codigoErp,
          // A frase ORIGINAL habilita o relato — ver ContextoVendedora.
          textoOriginal: textoDaMensagem,
          aoRegistrarRelato: () => {
            relatoRegistrado = true;
          },
        }),
      });

      // So guarda o que deu certo. Turno com falha na memoria faria a proxima
      // resposta se apoiar num erro.
      this.memoria.registrar(chave, pergunta, texto);

      return {
        resposta: texto,
        motivo: relatoRegistrado ? 'relato_registrado' : 'conversa',
      };
    } catch (err) {
      this.logger.error(
        `Falha do agente interno: ${err instanceof Error ? err.message : err}`,
      );
      return {
        resposta:
          'Tive um problema aqui do meu lado agora. Pode me mandar de novo daqui a pouco?',
        motivo: 'falha_agente',
      };
    }
  }

  /**
   * Devolve o texto da mensagem, transcrevendo o audio quando for o caso.
   *
   * @returns o texto; ou `null` quando havia audio e nao deu para transformar
   *          em texto — caso em que quem chama avisa a vendedora, em vez de
   *          ficar mudo.
   */
  private async resolverTexto(msg: MensagemInterna): Promise<string | null> {
    const digitado = msg.texto?.trim() ?? '';
    if (digitado) return digitado;
    if (!msg.audio) return '';

    const { url, mimetype, segundos } = msg.audio;

    // Recusa ANTES de baixar quando o proprio payload ja diz que e longo
    // demais. Barato, e evita pagar por uma transcricao que sairia ruim.
    if (segundos !== null && segundos > LIMITE_SEGUNDOS) {
      this.logger.warn(`Audio de ${segundos}s acima do teto — nao transcrito.`);
      return null;
    }
    if (!url) {
      // O WAHA reconheceu o audio mas nao entregou o arquivo. Quase sempre e
      // download de midia desligado no WAHA — configuracao dele, nao nossa.
      this.logger.warn('Audio sem URL de arquivo — o WAHA nao baixou a midia.');
      return null;
    }
    if (!this.transcricao.disponivel()) {
      this.logger.warn('Transcricao indisponivel (sem OPENAI_API_KEY).');
      return null;
    }

    const arquivo = await this.whatsapp.baixarMidia(url);
    if (!arquivo) return null;

    const texto = await this.transcricao.transcrever({
      conteudo: arquivo.conteudo,
      // O content-type do download e mais confiavel que o do payload, mas se
      // vier generico o do payload vale mais.
      mimetype: arquivo.mimetype.startsWith('audio') ? arquivo.mimetype : mimetype,
    });

    if (!texto) return null;
    // So o tamanho no log: o conteudo e do mesmo nivel de sigilo da mensagem.
    this.logger.debug(`Audio transcrito (${texto.length} caracteres).`);
    return texto;
  }

  /**
   * A cobranca aberta, se houver, entra no prompt como CONTEXTO — e o que
   * permite o agente reconhecer "falei com ela, pediu para retornar amanha"
   * como relato daquele cliente, em vez de conversa solta.
   *
   * Sem cobranca aberta, a frase diz isso — para ele nao chamar a ferramenta a
   * toa e acabar registrando relato de um contato que ninguem pediu.
   */
  private async montarContextoPendencia(vendedoraId: string): Promise<string> {
    const pendencia = await this.atendimentos.buscarCobrancaAguardando(vendedoraId);
    if (!pendencia) {
      return 'Não há retorno pendente dela no momento — ninguém está esperando relato de contato. Não use a ferramenta registrar_relato.';
    }

    const cliente = await this.clientes.buscarPorId(pendencia.atendimento.clienteId);
    const nome = cliente?.nome ?? 'um cliente';

    return (
      `Você perguntou a ela há pouco como foi o contato com ${nome}, e ainda espera a resposta. ` +
      'Se a mensagem dela for sobre esse contato — se falou, se não conseguiu falar, se remarcou —, ' +
      'use a ferramenta registrar_relato. Se for outro assunto, responda normalmente e não registre nada.'
    );
  }
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** "hoje às 15:00", "amanhã às 10:00", "sexta-feira às 09:30", "28/08 às 14:00". */
function formatarQuando(d: Date): string {
  const agora = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const soDia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = (soDia(d) - soDia(agora)) / 86_400_000;

  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias > 1 && dias < 7) {
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long' })} às ${hora}`;
  }
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

function agoraLocal(): string {
  const agora = new Date();
  const dia = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia}, ${hora}`;
}
