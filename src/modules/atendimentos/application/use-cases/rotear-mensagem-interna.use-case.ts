import { Inject, Injectable, Logger } from '@nestjs/common';
import { BuscarAdminPorTelefoneUseCase } from '../../../auth/application/use-cases/buscar-admin-por-telefone.use-case';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { TRANSCRICAO_SERVICE } from '../../../transcricao/domain/ports/injection-tokens';
import {
  LIMITE_SEGUNDOS,
  type ITranscricao,
} from '../../../transcricao/domain/ports/transcricao.port';
import { BuscarVendedoraPorWhatsappUseCase } from '../../../vendedoras/application/use-cases/buscar-vendedora-por-whatsapp.use-case';
import {
  ProcessarMensagemInternaUseCase,
  type AudioInterno,
} from './processar-mensagem-interna.use-case';
import { ProcessarMensagemGestaoUseCase } from './processar-mensagem-gestao.use-case';
import {
  PERMISSAO_CATALOGO,
  ProcessarFotoCatalogoUseCase,
  type ImagemInterna,
} from './processar-foto-catalogo.use-case';

export interface MensagemDoCanal {
  /** Chat de origem, ja traduzido de LID para telefone na borda HTTP. */
  de: string;
  texto: string;
  audio?: AudioInterno;
  /**
   * Presente so quando chegou foto. Quando ha imagem, o `texto` e a LEGENDA —
   * o WhatsApp manda as duas coisas no mesmo campo do payload.
   */
  imagem?: ImagemInterna;
}

export interface RespostaDoCanal {
  resposta: string | null;
  motivo: string;
}

/**
 * Quem esta falando comigo — e, a partir disso, qual agente responde.
 *
 * ==========================================================================
 * DOIS CANAIS, UM NUMERO SO DE ENTRADA.
 *
 *   telefone de vendedora ativa   -> Elena, que so enxerga o dela
 *   telefone de usuario de gestao -> Anastasia, que enxerga a equipe
 *   qualquer outro                -> silencio
 *
 * A ORDEM E DELIBERADA: vendedora primeiro. O papel VENDEDORA e uma opcao do
 * seletor de usuarios, entao vendedora com login no painel TEM linha em
 * `admin_users`. Procurando a gestao antes, bastaria ela cadastrar o proprio
 * celular ali para cair no canal amplo. Procurando vendedora antes, quem for as
 * duas coisas continua sendo tratada como vendedora — o lado restrito.
 *
 * (O `BuscarAdminPorTelefoneUseCase` ainda exige permissao de gestao, entao sao
 * duas barreiras independentes para o mesmo erro.)
 *
 * SILENCIO, e nao mensagem de erro, para numero desconhecido: responder
 * "voce nao esta cadastrado" confirmaria a quem sondasse que existe um canal
 * aqui.
 * ==========================================================================
 *
 * O AUDIO VIRA TEXTO AQUI, depois de reconhecer e antes de despachar.
 * Transcrever e chamada paga; atras do reconhecimento, audio de estranho sai
 * tao barato quanto texto de estranho — nao sai do lugar. Os dois canais
 * recebem texto e nenhum deles sabe que houve audio.
 */
@Injectable()
export class RotearMensagemInternaUseCase {
  private readonly logger = new Logger(RotearMensagemInternaUseCase.name);

  constructor(
    private readonly identificarVendedora: BuscarVendedoraPorWhatsappUseCase,
    private readonly identificarAdmin: BuscarAdminPorTelefoneUseCase,
    private readonly canalVendedora: ProcessarMensagemInternaUseCase,
    private readonly canalGestao: ProcessarMensagemGestaoUseCase,
    private readonly canalCatalogo: ProcessarFotoCatalogoUseCase,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    @Inject(TRANSCRICAO_SERVICE)
    private readonly transcricao: ITranscricao,
  ) {}

  async execute(msg: MensagemDoCanal): Promise<RespostaDoCanal> {
    const telefone = msg.de.replace(/@.*$/, '');

    // O texto ja resolvido, memorizado — `undefined` e "ainda nao resolvi".
    // O mesmo audio pode ser consultado no ramo do catalogo e de novo no dos
    // agentes, e transcrever duas vezes cobraria duas.
    let textoResolvido: string | null | undefined;

    // ---------------------------------------------------------------------
    // CATALOGO — a terceira ramificacao, decidida pela MENSAGEM e nao pelo
    // telefone.
    //
    // Amarrar o assunto ao numero tiraria a Anastasia de quem fotografa: a
    // mesma pessoa manda foto de peca e pergunta sobre a equipe. Entao quem
    // decide e o conteudo — imagem e assunto de catalogo, texto continua
    // sendo dos dois agentes de sempre.
    //
    // A permissao tambem e outra: catalogo:write, e nao a de gestao. Quem
    // fotografa e estoque e marketing, que nao enxergam (nem devem enxergar)
    // dado de venda.
    // ---------------------------------------------------------------------
    if (msg.imagem) {
      const quem = await this.identificarAdmin.execute(telefone, PERMISSAO_CATALOGO);
      if (!quem) {
        this.logger.debug('Foto de remetente sem permissao de catalogo — ignorada.');
        return { resposta: null, motivo: 'ignorado_foto_sem_permissao' };
      }
      return this.canalCatalogo.foto({
        de: msg.de,
        nomeRemetente: quem.nome ?? '',
        legenda: msg.texto ?? '',
        imagem: msg.imagem,
      });
    }

    // ---------------------------------------------------------------------
    // TEXTO COM ALGO PENDENTE NO CATALOGO. Sao dois casos, e os dois precedem
    // os agentes:
    //
    //   foto esperando catalogo  -> "0002" e a RESPOSTA de "de qual e?"
    //   foto guardada sem codigo -> "BR26252" completa o descritivo
    //   foto tratada esperando   -> "aprovo" / "ajusta mais claro"
    //   codigo na ponta da lingua nao -> "anel de esmeralda", e eu listo
    //
    // OS TRES SAO RESPOSTA A UMA PERGUNTA QUE O SISTEMA FEZ. Caindo na
    // Anastasia, ela responde "0002" como pergunta sobre vendas e "BR26252"
    // como codigo que nao diz nada — as duas coisas ja aconteceram.
    //
    // AS TRES CONDICOES SAO CONSULTAS EM MEMORIA, e e isso que preserva a
    // ordem vendedora-antes-de-gestao: sem elas, todo texto do canal faria um
    // lookup de admin antes do de vendedora.
    // ---------------------------------------------------------------------
    const esperandoCatalogo = this.canalCatalogo.temFotoEsperando(msg.de);
    const esperandoCodigo = this.canalCatalogo.temCodigoEsperando(msg.de);
    if (
      esperandoCatalogo ||
      esperandoCodigo ||
      this.canalCatalogo.temFotoEmAprovacao(msg.de)
    ) {
      const quem = await this.identificarAdmin.execute(
        telefone,
        PERMISSAO_CATALOGO,
      );
      if (quem) {
        textoResolvido = await this.resolverTexto(msg);
        if (textoResolvido) {
          const nome = quem.nome ?? '';
          if (esperandoCatalogo) {
            return this.canalCatalogo.resposta(msg.de, nome, textoResolvido);
          }

          // O CODIGO ANTES DA APROVACAO: "BR26252" nao e veredito, e sem esta
          // ordem ele passaria direto para os agentes.
          if (esperandoCodigo) {
            const anotado = await this.canalCatalogo.codigo(
              msg.de,
              textoResolvido,
            );
            if (anotado) return anotado;
          }

          const aprovacao = await this.canalCatalogo.aprovacao(
            msg.de,
            nome,
            textoResolvido,
          );
          // `null` = o texto nao era resposta de aprovacao. Uma pergunta sobre
          // vendas feita com foto pendurada segue para a Anastasia como
          // seguiria em qualquer outro momento.
          if (aprovacao) return aprovacao;

          // A BUSCA DA PECA E A ULTIMA A OLHAR, e a ordem e o que a torna
          // segura: aqui ja se sabe que o texto nao era codigo nem veredito.
          // Antes da aprovacao, um `aprovo` viraria termo de busca.
          //
          // Ela tambem so age com o texto dizendo QUE PECA E ("anel...",
          // "brinco...") ou respondendo a uma lista que acabou de sair — o
          // resto segue para os agentes, como sempre.
          if (esperandoCodigo) {
            const escolhida = await this.canalCatalogo.buscarPeca(
              msg.de,
              textoResolvido,
            );
            if (escolhida) return escolhida;
          }
        }
      }
    }

    const vendedora = await this.identificarVendedora.execute(telefone);
    const admin = vendedora ? null : await this.identificarAdmin.execute(telefone);

    if (!vendedora && !admin) {
      // Nao logamos o numero: e PII, e o log e o lugar mais facil de vazar.
      this.logger.debug('Mensagem interna de remetente nao reconhecido — ignorada.');
      return { resposta: null, motivo: 'ignorado_remetente_desconhecido' };
    }

    const texto =
      textoResolvido !== undefined
        ? textoResolvido
        : await this.resolverTexto(msg);
    if (texto === null) {
      const nome = (vendedora?.nome ?? admin?.nome ?? '').trim().split(/\s+/)[0];
      return {
        resposta:
          `${nome ? `${nome}, c` : 'C'}hegou seu áudio mas não consegui ouvir. ` +
          `Pode mandar por escrito?`,
        motivo: 'audio_nao_entendido',
      };
    }
    if (!texto) {
      return { resposta: null, motivo: 'ignorado_sem_conteudo' };
    }

    if (vendedora) {
      // O canal da vendedora identifica DE NOVO por dentro. Nao e desperdicio:
      // e o que mantem aquele use case seguro se um dia for chamado de outro
      // lugar. A consulta e um lookup por hash indexado.
      return this.canalVendedora.execute({ de: msg.de, texto });
    }

    // O ID vai junto: e a chave da memoria de conversa dele. Telefone nao
    // serve — numero muda de dono, e a conversa nao pode ir junto.
    return this.canalGestao.execute({
      usuarioId: admin!.id,
      nome: admin!.nome,
      texto,
    });
  }

  /** Igual ao do canal da vendedora: null = tinha audio e nao deu para ouvir. */
  private async resolverTexto(msg: MensagemDoCanal): Promise<string | null> {
    const digitado = msg.texto?.trim() ?? '';
    if (digitado) return digitado;
    if (!msg.audio) return '';

    const { url, mimetype, segundos } = msg.audio;

    if (segundos !== null && segundos > LIMITE_SEGUNDOS) {
      this.logger.warn(`Audio de ${segundos}s acima do teto — nao transcrito.`);
      return null;
    }
    if (!url) {
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
      mimetype: arquivo.mimetype.startsWith('audio') ? arquivo.mimetype : mimetype,
    });

    if (!texto) return null;
    // So o tamanho no log: o conteudo tem o mesmo sigilo da mensagem.
    this.logger.debug(`Audio transcrito (${texto.length} caracteres).`);
    return texto;
  }
}
