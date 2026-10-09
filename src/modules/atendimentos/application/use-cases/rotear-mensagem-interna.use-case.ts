import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FotoDeProduto } from '../fotos-de-produto.service';
import { BuscarAdminPorTelefoneUseCase } from '../../../auth/application/use-cases/buscar-admin-por-telefone.use-case';
import type { AgenteDaCasa } from '../../../atendimento/domain/agente-da-casa';
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
import { LeitorDeArquivoService } from '../leitor-de-arquivo.service';
import { AnalisarArquivoService } from '../analisar-arquivo.service';

/**
 * A chave que separa os dois canais da casa — 07/10/2026.
 *
 * NAO E "SER GESTAO", e ver a LOJA. A mesma chave que guarda o modulo de
 * Analytics no painel e que decide, na Anastasia, se as ferramentas podem
 * falar do faturamento do grupo. Quem a tem pertence ao canal da Anastasia;
 * quem gerencia um time sem ve-la e atendido pela Helena.
 *
 * Uma chave so, e nao uma lista de papeis: mexer nas permissoes de um papel
 * passa a mudar o roteamento junto, sem ninguem precisar lembrar deste
 * arquivo.
 */
const PERMISSAO_LOJA = 'analytics:read';

/**
 * De quanto em quanto tempo o "digitando..." e renovado.
 *
 * DEZ SEGUNDOS porque o indicador do WhatsApp cai sozinho entre 10 e 25 —
 * renovar no piso da janela cobre a espera inteira sem depender de qual
 * ponta do intervalo o aparelho dela usa. Presenca nao conta no teto de
 * envio (ver `WahaGateway.presenca`), entao renovar nao custa mensagem.
 */
const INTERVALO_DIGITANDO_MS = 10_000;

import { MemoriaDeGrupoService } from '../memoria-de-grupo.service';
import { RecepcionarUseCase } from './recepcionar.use-case';
import {
  PERMISSAO_CATALOGO,
  ProcessarFotoCatalogoUseCase,
  type ImagemInterna,
} from './processar-foto-catalogo.use-case';

export interface MensagemDoCanal {
  /**
   * Chat de origem, ja traduzido de LID para telefone na borda HTTP.
   *
   * E PARA ONDE A RESPOSTA VAI. Em conversa direta ele e tambem QUEM FALOU;
   * num grupo, nao — ver `grupo`.
   */
  de: string;
  /**
   * Presente so quando a mensagem veio de um GRUPO — 30/09/2026.
   *
   * ========================================================================
   * SEM ISTO, O RECONHECIMENTO PROCURARIA UM ADMIN COM O TELEFONE DO GRUPO.
   *
   * Todo o canal foi construido sobre "o chat e a pessoa", e em grupo isso
   * deixa de valer. O `de` continua sendo o destino da resposta; quem falou
   * passa a viajar aqui.
   * ========================================================================
   */
  grupo?: {
    /** Quem escreveu, como `NNNNNNN@c.us`. E ele que e reconhecido. */
    autor: string;
    /** Como a pessoa se chama no WhatsApp. So para rotular a linha da sala. */
    autorNome?: string;
    /** O texto da mensagem CITADA, quando esta e uma resposta a outra. */
    citada?: string;
    /** Os `@lid` mencionados na mensagem. */
    mencionados: string[];
    /** Se a agente DESTE numero foi uma das mencionadas. */
    mencionada: boolean;
  };
  /**
   * POR QUAL NUMERO DA CASA a mensagem entrou — a segunda pergunta do
   * roteamento, desde 25/09/2026.
   *
   * Ate aqui so existia "quem escreve". Com dois chips existe tambem "para
   * quem escreveu", e as duas podem discordar: a vendedora que procura a
   * Anastasia quer, quase sempre, a Elena.
   *
   * ========================================================================
   * AUSENTE = UM NUMERO SO, E ELE ATENDE TODO MUNDO.
   *
   * Esta e a diferenca entre um deploy tranquilo e um canal quebrado. O
   * codigo dos dois numeros sobe antes de o segundo chip existir; enquanto
   * `WAHA_SESSION_ELENA` nao for configurado, a borda nao preenche este campo
   * e o roteador se comporta exatamente como antes — vendedora e gestao
   * atendidas no mesmo numero, sem desvio nenhum.
   *
   * Nao e `'ANASTASIA'` por padrao de proposito: com um valor ali, a primeira
   * vendedora a escrever depois do deploy ouviria "me chama no outro numero"
   * apontando para um chip que ninguem conectou.
   * ========================================================================
   */
  agente?: AgenteDaCasa;
  texto: string;
  audio?: AudioInterno;
  /**
   * Presente so quando chegou foto. Quando ha imagem, o `texto` e a LEGENDA —
   * o WhatsApp manda as duas coisas no mesmo campo do payload.
   */
  imagem?: ImagemInterna;
  /**
   * Presente so quando chegou DOCUMENTO — planilha, PDF, CSV. RF9, 08/10/2026.
   *
   * ========================================================================
   * SO A REFERENCIA CHEGA AQUI, e o download acontece DEPOIS DO
   * RECONHECIMENTO — mesma economia do audio: ler uma planilha e uma chamada
   * grande ao modelo, e nesta borda ainda nao se sabe quem mandou.
   *
   * E SO A GESTAO MANDA ARQUIVO. A vendedora que mandar ouve que nao consigo
   * ler — nunca silencio, que foi o defeito do audio em 21/08.
   * ========================================================================
   */
  documento?: DocumentoInterno;
  /**
   * Quando a mensagem foi ESCRITA (ms), pelo carimbo do WhatsApp. E o relogio
   * da aprovacao do catalogo — ver `ProcessarFotoCatalogoUseCase.aprovacao`.
   */
  em?: number;
}

/** O documento como ele viaja no canal: referencia, tipo e nome. */
export interface DocumentoInterno {
  url: string | null;
  mimetype: string;
  /** O nome do arquivo — a unica pista de tipo quando o mime e octet-stream. */
  nome: string | null;
}

export interface RespostaDoCanal {
  resposta: string | null;
  motivo: string;
  /**
   * As fotos das pecas, JA BAIXADAS, para irem depois do texto — 07/10/2026.
   *
   * Quem envia e o webhook, nao o use case: o envio e a unica coisa que
   * precisa do chat de destino, e o canal ja resolve isso para o texto.
   *
   * Vem vazio quase sempre, e isso e o esperado: das 546 pecas com saldo,
   * 196 tem foto; na joia, 55 de 320.
   */
  fotos?: FotoDeProduto[];
}

/**
 * Quem esta falando comigo — e, a partir disso, qual agente responde.
 *
 * ==========================================================================
 * DOIS CANAIS, E DESDE 25/09/2026 DOIS NUMEROS.
 *
 * A decisao do Lucas foi a SEPARACAO ESTRITA: cada numero atende o seu
 * publico, e so ele.
 *
 *   numero da ELENA      -> vendedora ativa, e o canal do catalogo
 *   numero da ANASTASIA  -> gestao
 *   publico errado, mas RECONHECIDO -> "me chama no outro numero"
 *   qualquer outro       -> silencio, nos dois
 *
 * O desvio existe porque a alternativa era pior dos dois lados: atender assim
 * mesmo faria os dois numeros virarem sinonimos e a separacao so existiria no
 * papel; calar faria a pessoa da casa achar que o sistema quebrou.
 *
 * A REGRA ANTIGA, para quando ha UM numero so (`WAHA_SESSION_ELENA` ausente):
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
    private readonly recepcionar: RecepcionarUseCase,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    @Inject(TRANSCRICAO_SERVICE)
    private readonly transcricao: ITranscricao,
    private readonly sala: MemoriaDeGrupoService,
    // RF9 — os dois andam juntos e sempre nesta ordem: o leitor abre o
    // arquivo, a analise o le ATRAS DE UMA PORTA SEM FERRAMENTA.
    private readonly leitor: LeitorDeArquivoService,
    private readonly analise: AnalisarArquivoService,
  ) {}

  async execute(msg: MensagemDoCanal): Promise<RespostaDoCanal> {
    // ---------------------------------------------------------------------
    // NO GRUPO, SO QUANDO CHAMADA — 30/09/2026, pedido do Lucas.
    //
    // Antes de qualquer outra coisa, e de proposito: sem mencao nao se
    // transcreve audio, nao se baixa foto, nao se chama o modelo. Um grupo
    // movimentado nao pode virar conta.
    //
    // NAO HA LISTA DE GRUPOS AUTORIZADOS, e essa foi a decisao. A trava nunca
    // foi "qual grupo" — e "quem mencionou", e isso o reconhecimento abaixo ja
    // faz, default-deny, desde sempre. Qualquer um pode criar um grupo com
    // ela; quem nao tem cadastro nao recebe resposta, ali como no privado.
    // ---------------------------------------------------------------------
    // ---------------------------------------------------------------------
    // ELA OUVE A SALA — 30/09/2026.
    //
    // Guardar vem ANTES de decidir se responde, e vale para a mensagem sem
    // mencao tambem: e justamente ela que vira contexto depois. Guardar e uma
    // escrita em memoria — o grupo parado continua custando zero.
    //
    // Ver `MemoriaDeGrupoService`: so RAM, com prazo, nada vai para o banco.
    // ---------------------------------------------------------------------
    if (msg.grupo) {
      this.sala.registrar(msg.de, msg.grupo.autorNome ?? null, msg.texto);
    }

    if (msg.grupo && !msg.grupo.mencionada) {
      return { resposta: null, motivo: 'ignorado_grupo_sem_mencao' };
    }

    // QUEM FALOU, e nao de onde veio: em grupo os dois sao diferentes. A
    // resposta ainda vai para `msg.de` — ver `RespostaDoCanal`.
    const telefone = (msg.grupo?.autor ?? msg.de).replace(/@.*$/, '');

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
      const quem = await this.identificarAdmin.execute(
        telefone,
        PERMISSAO_CATALOGO,
      );
      if (!quem) {
        this.logger.debug(
          'Foto de remetente sem permissao de catalogo — ignorada.',
        );
        return { resposta: null, motivo: 'ignorado_foto_sem_permissao' };
      }
      // O CATALOGO MORA NO NUMERO DA ELENA. A foto que chega no da Anastasia
      // nao e recusada em silencio: quem tem permissao ouve para onde levar.
      // Com um numero so, nao ha para onde desviar — e ele atende tudo.
      if (msg.agente === 'ANASTASIA') {
        return this.desviar('ELENA', quem.nome ?? '');
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
    // E DESDE 11/09/2026, A CONVERSA ABERTA. Decisao do Lucas: a pessoa manda
    // as coisas na ordem que quiser. Com a conversa do catalogo em curso, o
    // "Ok" que e recibo, o "#0003" e o codigo mandados ANTES da foto tambem
    // sao do catalogo — no print do Yerlon, o "Ok" caiu na Anastasia e voltou
    // "Oi, Yerlon! Como posso te ajudar?".
    //
    // AS CONDICOES SAO CONSULTAS EM MEMORIA, e e isso que preserva a ordem
    // vendedora-antes-de-gestao: sem elas, todo texto do canal faria um
    // lookup de admin antes do de vendedora.
    // ---------------------------------------------------------------------
    // Nada de catalogo acontece fora do numero da Elena — nem as conversas
    // que ficaram abertas. Os testes abaixo sao consultas em memoria, e sem
    // esta linha eles rodariam a toa no numero da gestao.
    const noCatalogo = msg.agente !== 'ANASTASIA';
    const esperandoCatalogo = noCatalogo && this.canalCatalogo.temFotoEsperando(msg.de);
    const esperandoCodigo = noCatalogo && this.canalCatalogo.temCodigoEsperando(msg.de);
    const esperandoConsulta = noCatalogo && this.canalCatalogo.esperandoConsulta(msg.de);
    const fotoComFalha = noCatalogo && this.canalCatalogo.temFotoComFalha(msg.de);
    if (
      esperandoCatalogo ||
      esperandoCodigo ||
      esperandoConsulta ||
      fotoComFalha ||
      (noCatalogo && this.canalCatalogo.temFotoEmAprovacao(msg.de)) ||
      (noCatalogo && this.canalCatalogo.conversaAberta(msg.de))
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

          // A CONSULTA VEM ANTES DO CODIGO, e a ordem e o ponto: acabei de
          // perguntar "qual peça?", e a resposta muitas vezes E um codigo.
          // Depois do `codigo`, esse "BR26252" entraria numa foto que estava
          // sendo montada em vez de responder o preco que a pessoa pediu.
          if (esperandoConsulta) {
            const ficha = await this.canalCatalogo.consulta(
              msg.de,
              textoResolvido,
            );
            if (ficha) return ficha;
          }

          // "TENTA DE NOVO" — a foto que a IA nao tratou. So o comando exato
          // age; qualquer outro texto segue o fluxo. Antes do codigo porque a
          // frase nunca e codigo, e antes da aprovacao porque ela e curta e
          // levaria a dica "nao entendi se e sobre a foto".
          if (fotoComFalha) {
            const refeita = await this.canalCatalogo.tentarDeNovo(
              msg.de,
              textoResolvido,
            );
            if (refeita) return refeita;
          }

          // O CODIGO ANTES DA APROVACAO: "BR26252" nao e veredito, e sem esta
          // ordem ele passaria direto para os agentes.
          if (esperandoCodigo) {
            const anotado = await this.canalCatalogo.codigo(
              msg.de,
              textoResolvido,
              nome,
            );
            if (anotado) return anotado;
          }

          const aprovacao = await this.canalCatalogo.aprovacao(
            msg.de,
            nome,
            textoResolvido,
            msg.em,
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
              nome,
            );
            if (escolhida) return escolhida;
          }

          // O RECIBO E A REFERENCIA ADIANTADA, por ultimo. Aqui ja se sabe
          // que o texto nao era resposta a nenhuma pergunta aberta — e a
          // conversa so fica com ele se ele for INTEIRO do catalogo ("Ok",
          // "#0003", "CO26185"). O resto segue para os agentes.
          const continuou = await this.canalCatalogo.continuarConversa(
            msg.de,
            textoResolvido,
          );
          if (continuou) return continuou;
        }
      }
    }

    // ---------------------------------------------------------------------
    // A ORDEM DAS CONSULTAS SEGUE O NUMERO, e isto resolve de graca um empate
    // que antes era decidido no codigo.
    //
    // Quem e vendedora E tem login de gestao caia sempre no lado restrito,
    // porque a vendedora era procurada primeiro. Com dois numeros quem decide
    // e a propria pessoa, pelo numero que escolheu — e nenhuma ordem escrita
    // aqui precisa arbitrar por ela.
    //
    // A consulta do publico DAQUELE numero vem primeiro; a outra so acontece
    // para saber se cabe desvio ou silencio.
    // ---------------------------------------------------------------------
    // `undefined` = um numero so. Ver `MensagemDoCanal.agente`.
    const separadas = msg.agente !== undefined;
    const naAnastasia = msg.agente === 'ANASTASIA';

    const gestaoPrimeiro = naAnastasia
      ? await this.identificarAdmin.execute(telefone)
      : null;
    const vendedora = gestaoPrimeiro
      ? null
      : await this.identificarVendedora.execute(telefone);

    // ===================================================================
    // NA HELENA, AS DUAS PERGUNTAS SAO FEITAS — 07/10/2026.
    //
    // Ate hoje a de gestao so era feita quando a de vendedora falhava, e
    // isso bastava enquanto cada pessoa fosse uma coisa so. A Nathalia e
    // as duas: gerente de vendas E vendedora, com UM numero — o da
    // Helena. Parando na primeira resposta, metade do trabalho dela nao
    // tinha canal.
    //
    // O CUSTO E UM LOOKUP POR HASH indexado, e so no canal da Helena:
    // quem escreve para a Anastasia continua resolvido numa consulta so.
    // ===================================================================
    const admin =
      gestaoPrimeiro ?? (await this.identificarAdmin.execute(telefone));

    // QUEM CUIDA DO CATALOGO E DA CASA, e ate 03/09/2026 caia na TRIAGEM: o
    // estoquista escrevia qualquer coisa que nao fosse "aprovo" e a Anastasia
    // tentava qualifica-lo como cliente — o telefone da equipe virava lead na
    // fila de encaminhamento da gestao.
    //
    // VEM DEPOIS DA GESTAO de proposito. O ADMIN tem as duas permissoes, e o
    // texto dele continua sendo assunto da Anastasia; foto dele ja ia para o
    // catalogo pelo ramo da imagem, e continua indo. So chega aqui quem NAO
    // tem canal proprio — estoque e marketing.
    const doCatalogo =
      vendedora || admin
        ? null
        : await this.identificarAdmin.execute(telefone, PERMISSAO_CATALOGO);

    if (!vendedora && !admin && !doCatalogo) {
      // Nao logamos o numero: e PII, e o log e o lugar mais facil de vazar.
      this.logger.debug(
        'Mensagem interna de remetente nao reconhecido — ignorada.',
      );
      return { resposta: null, motivo: 'ignorado_remetente_desconhecido' };
    }

    // ---------------------------------------------------------------------
    // O NUMERO ERRADO, E A PESSOA E DA CASA: desvio educado.
    //
    // Depois do reconhecimento de proposito. Antes dele, a frase confirmaria a
    // qualquer desconhecido que existe um segundo numero — e quem nao e da
    // casa continua sem saber que existe canal nenhum.
    // ---------------------------------------------------------------------
    if (separadas && naAnastasia && !admin) {
      return this.desviar('ELENA', vendedora?.nome ?? doCatalogo?.nome ?? '');
    }

    // ===================================================================
    // NA HELENA, SO E DESVIADO QUEM VE A LOJA — 07/10/2026.
    //
    // A Anastasia e o canal de quem enxerga a loja em dinheiro. Quem
    // gerencia um time e nao ve a loja (GERENTE_VENDAS) nao tem o que ir
    // buscar la: as ferramentas dela sao as mesmas de que a Helena passa
    // a dispor, ja recortadas pela equipe.
    //
    // E DESVIAR CUSTAVA O CANAL INTEIRO: a gerente que so tem o numero da
    // Helena ouvia "me chama no outro numero" apontando para um numero
    // que ninguem deu a ela. Sem canal, e sem saber por que.
    //
    // QUEM VE A LOJA CONTINUA SENDO DESVIADO, e isso e de proposito: o
    // faturamento do grupo e assunto da Anastasia, e a Helena nao tem — e
    // nao deve ter — ferramenta que fale dele.
    //
    // MAS VENDEDORA NUNCA E DESVIADA, e esta linha custou um teste: quem
    // tem cadastro de vendedora e atendida aqui SEMPRE, acumulando a
    // gestao se tiver. Sem o `!vendedora`, uma vendedora que tambem fosse
    // ADMIN seria mandada para a Anastasia e perderia a propria carteira
    // — o canal dela trocado por outro, sem ninguem decidir isso.
    // ===================================================================
    const desviavel = separadas && !naAnastasia && admin !== null && !vendedora;
    const veLoja =
      desviavel &&
      (await this.identificarAdmin.execute(telefone, PERMISSAO_LOJA)) !== null;

    if (desviavel && veLoja) {
      return this.desviar('ANASTASIA', admin!.nome ?? '');
    }

    let texto =
      textoResolvido !== undefined
        ? textoResolvido
        : await this.resolverTexto(msg);
    if (texto === null) {
      const nome = (vendedora?.nome ?? admin?.nome ?? doCatalogo?.nome ?? '')
        .trim()
        .split(/\s+/)[0];
      return {
        resposta:
          `${nome ? `${nome}, c` : 'C'}hegou seu áudio mas não consegui ouvir. ` +
          `Pode mandar por escrito?`,
        motivo: 'audio_nao_entendido',
      };
    }
    // ARQUIVO SEM LEGENDA TAMBEM NAO E "SEM CONTEUDO" — RF9, 08/10/2026.
    //
    // Quem manda planilha costuma mandar SO a planilha, e perguntar depois.
    // Sem esta condicao a mensagem morria tres linhas abaixo, no
    // `ignorado_sem_conteudo` — exatamente o descarte silencioso que o RF9
    // existe para consertar, e agora dentro do nosso proprio codigo.
    //
    // Achado por teste, e nao em producao: foi o `arquivo sem legenda` do
    // spec que falhou.
    if (!texto && !msg.documento) {
      // ------------------------------------------------------------------
      // NO GRUPO, VAZIO NAO E "SEM CONTEUDO" — 30/09/2026.
      //
      // "@anastasia" sozinho e mensagem legitima: e chamar alguem pelo nome
      // do outro lado da sala. Depois de tirar a mencao sobra vazio, e cair
      // no silencio daqui foi o que o Lucas viu no primeiro teste — ele
      // mandou a pergunta numa mensagem e a mencao na seguinte, as duas
      // certas, nenhuma das duas completa, e o sintoma foi indistinguivel de
      // "o grupo nao funciona".
      //
      // DEPOIS DO RECONHECIMENTO, e isso nao e detalhe: aqui ja se sabe que
      // quem chamou tem cadastro. Responder antes faria qualquer um descobrir
      // que ha uma agente ali so mencionando o numero.
      //
      // A frase e CANJA — pagar uma chamada ao modelo para ele descobrir que
      // nao ha pergunta seria pagar para dizer "oi".
      // ------------------------------------------------------------------
      if (msg.grupo) {
        // SO QUANDO NAO HA O QUE LER. Com a sala guardada, a mencao sozinha
        // deixa de ser um beco: ela olha o que foi dito antes e responde,
        // que e o que o Lucas esperava em 30/09 — "da para saber o que quer".
        // A frase abaixo ficou para o caso de ele chamar numa sala vazia.
        if (this.contextoDoGrupo(msg).length === 0) {
          return {
            resposta: 'Oi! Me diz o que você precisa que eu vejo.',
            motivo: 'grupo_mencao_sem_pergunta',
          };
        }
      } else {
        return { resposta: null, motivo: 'ignorado_sem_conteudo' };
      }
    }

    // ---------------------------------------------------------------------
    // A RECEPCAO — pedido do Lucas em 15/09/2026.
    //
    // DEPOIS DE TUDO QUE ESTAVA PENDENTE, e nao antes: com foto esperando
    // catalogo, "1" e escolha da lista de pecas e "oi" segue o fluxo. O menu
    // so atende quem chega sem conversa em curso.
    //
    // O NUMERO PRIMEIRO, E DE GRACA: e uma consulta a um Map. So depois vem a
    // saudacao, que tambem e teste em memoria. Mensagem com conteudo nao paga
    // nada por esta porta.
    // ---------------------------------------------------------------------
    const escolha = this.recepcionar.escolhida(msg.de, texto);
    if (escolha) {
      switch (escolha.acao.tipo) {
        case 'catalogo_foto':
          // A FRASE VAI ESCRITA, e nao o "6": o `intencao` le o texto
          // procurando catalogo e codigo, e um numero solto ali seria lido
          // como numero de catalogo.
          return this.canalCatalogo.intencao(
            msg.de,
            'quero mandar foto para o catálogo',
          );
        case 'catalogo_consulta':
          return this.canalCatalogo.pedirConsulta(msg.de);
        case 'catalogo_abertos':
          return this.canalCatalogo.conversa(
            msg.de,
            (doCatalogo ?? admin)?.nome ?? '',
          );
        case 'frase':
          // O MENU DOS AGENTES NAO RESPONDE NADA: ele escreve a pergunta por
          // quem esta no celular, e ela segue o caminho de sempre. Nenhuma
          // regra da Elena ou da Anastasia e repetida aqui.
          texto = escolha.acao.texto;
          break;
      }
    } else {
      // QUEM FALA OUTRA COISA FECHA O MENU, e isto nao e limpeza: e o que
      // impede o menu velho de roubar o numero de outra pergunta. A Elena
      // responde listas numeradas ("1 · CB384 …"); com o menu ainda de pe, o
      // "2" que responde a LISTA dela viraria "Minhas metas".
      //
      // O menu serve a quem acabou de chegar. Passou para outro assunto, ele
      // some — e um "oi" traz outro na hora.
      this.recepcionar.esquecerMenu(msg.de);
    }

    if (this.recepcionar.ehSaudacao(texto)) {
      // A PERMISSAO DE CATALOGO DA GESTAO SO E CONSULTADA AQUI, uma vez por
      // saudacao: e o unico momento em que ela muda o que a pessoa VE. No
      // resto do canal ela continua sendo perguntada so quando o texto fala
      // de foto.
      const gestaoComCatalogo =
        admin &&
        (await this.identificarAdmin.execute(telefone, PERMISSAO_CATALOGO));

      const perfilDoCanal = {
        vendedora: !!vendedora,
        gestao: !!admin,
        catalogo: !!doCatalogo || !!gestaoComCatalogo,
      };
      const nome = vendedora?.nome ?? admin?.nome ?? doCatalogo?.nome ?? '';

      // DUAS PERGUNTAS, DUAS RESPOSTAS — 28/09/2026. "Oi" abre conversa e
      // recebe so o cumprimento; "ajuda" ou "o que você faz" pergunta o que
      // existe, e e a unica que recebe a lista. Ver `RE_PEDIDO_DE_AJUDA`.
      return this.recepcionar.ehPedidoDeAjuda(texto)
        ? this.recepcionar.oQuePossoFazer(perfilDoCanal, nome)
        : this.recepcionar.saudar(msg.de, perfilDoCanal, nome);
    }

    // O CHAO DO CANAL DO CATALOGO. Tudo que era assunto dele ja foi tentado
    // la em cima — responder o catalogo, mandar o codigo, aprovar, buscar a
    // peca. Aqui chega o que sobrou, e a resposta e dizer o que este canal faz
    // — ou, se a pessoa disse que quer mandar foto, abrir a conversa.
    //
    // A CONSULTA ANTES DA LISTA DE CATALOGOS — 16/09/2026. O Lucas escreveu
    // "consultar peça" com o menu ja vencido e recebeu os catalogos abertos. A
    // lista so e a resposta quando o texto nao pede NADA que o canal saiba
    // fazer. Foto vem antes: "vou mandar a foto da peça" fala de peca, mas e
    // envio.
    if (doCatalogo) {
      // A PERGUNTA PELO QUE ESTA PENDURADO VEM PRIMEIRO. "tem foto em aberto
      // no catalogo?" fala de foto e de catalogo — sem esta ordem viraria
      // envio, e a pergunta nunca seria respondida.
      if (this.canalCatalogo.falaDeFotosPendentes(texto)) {
        return this.canalCatalogo.fotosPendentes(msg.de, doCatalogo.nome ?? '');
      }
      if (this.canalCatalogo.falaDeMandarFoto(texto)) {
        return this.canalCatalogo.intencao(msg.de, texto);
      }
      if (this.canalCatalogo.falaDeConsultar(texto)) {
        return this.canalCatalogo.consultarAgora(msg.de, texto);
      }
      // A LISTA DE CATALOGOS E RESPOSTA, E NAO CHAO — 21/09/2026. Quem
      // pergunta por catalogo recebe a lista; ver `falaDeCatalogos`.
      if (this.canalCatalogo.falaDeCatalogos(texto)) {
        return this.canalCatalogo.conversa(msg.de, doCatalogo.nome ?? '');
      }
      // ANTES DO MENU, A FOTO PENDURADA. Um texto solto com foto esperando
      // veredito e quase sempre uma tentativa de responder a ela — ver
      // `lembreteDaAprovacao`. O teste de memoria vem primeiro e e de graca:
      // sem foto pendurada ninguem paga a consulta.
      if (this.canalCatalogo.temFotoEmAprovacao(msg.de)) {
        const lembrete = await this.canalCatalogo.lembreteDaAprovacao(
          msg.de,
          doCatalogo.nome ?? '',
        );
        if (lembrete) return lembrete;
      }

      // O QUE SOBROU NAO E DESTE CANAL. Dizer isso, e dizer o que e —
      // "qual minha carteira?" de um estoquista recebia os catalogos abertos.
      return this.recepcionar.naoSeiFazer(
        msg.de,
        { vendedora: false, gestao: false, catalogo: true },
        doCatalogo.nome ?? '',
      );
    }

    // ---------------------------------------------------------------------
    // A GESTAO QUE QUER MANDAR FOTO. Em 10/09 o Yerlon, ADM, escreveu "Quero
    // adicionar fotos ao catálogo #0001" e a Anastasia respondeu que catalogo
    // "fica fora do meu alcance". O canal que sabia fazer nunca ouviu.
    //
    // DEPOIS DA VENDEDORA, e isto nao e detalhe: a vendedora ja saiu la em
    // cima para a Elena, entao a ordem que protege o canal restrito nao muda.
    // A consulta de permissao so acontece quando o texto FALA de mandar foto,
    // que e teste em memoria — o resto da gestao nao paga nada a mais. E o
    // canal do catalogo nao enxerga venda: ninguem ganha dado por esta porta.
    // ---------------------------------------------------------------------
    if (admin && this.canalCatalogo.falaDeMandarFoto(texto)) {
      const podeCatalogo = await this.identificarAdmin.execute(
        telefone,
        PERMISSAO_CATALOGO,
      );
      if (podeCatalogo) return this.canalCatalogo.intencao(msg.de, texto);
    }

    // ---------------------------------------------------------------------
    // O ARQUIVO QUE A GESTAO MANDOU — RF9, 08/10/2026.
    //
    // AQUI, E NAO ANTES: baixar e LER custa (uma planilha de mil linhas e uma
    // chamada grande ao modelo), e so neste ponto se sabe quem mandou. E a
    // mesma economia do audio, e o mesmo lugar na ordem.
    //
    // DEPOIS DO CATALOGO e ANTES DA VENDEDORA, de proposito: a vendedora sai
    // para a Elena logo abaixo, e um arquivo que chegasse lá seria descartado
    // em silencio por um canal que nao sabe ler arquivo.
    // ---------------------------------------------------------------------
    if (msg.documento) {
      const doArquivo = await this.comDigitando(msg, () =>
        this.lerDocumento(msg, admin, vendedora?.nome),
      );
      if (doArquivo.resposta !== undefined) return doArquivo.resposta;
      if (doArquivo.texto) texto = doArquivo.texto;
    }

    if (vendedora) {
      // O canal da vendedora identifica DE NOVO por dentro. Nao e desperdicio:
      // e o que mantem aquele use case seguro se um dia for chamado de outro
      // lugar. A consulta e um lookup por hash indexado.
      //
      // O `gestao` VAI JUNTO quando a MESMA pessoa tambem gerencia — e o
      // caso da Nathalia, gerente de vendas e vendedora com um numero so.
      // Vazio para quase todo mundo, e ai nada muda.
      return this.comDigitando(msg, () =>
        this.canalVendedora.execute({
          de: msg.de,
          texto,
          ...(admin
            ? { gestao: { usuarioId: admin.id, role: admin.role } }
            : {}),
        }),
      );
    }

    // O ID vai junto: e a chave da memoria de conversa dele. Telefone nao
    // serve — numero muda de dono, e a conversa nao pode ir junto.
    //
    // O PAPEL TAMBEM, desde 28/09/2026: passar pela porta deixou de significar
    // ver tudo igual. Quem gerencia as vendedoras (GERENTE_VENDAS) recebe as
    // mesmas 17 ferramentas, mas nenhuma delas fala da loja em dinheiro — ver
    // `MensagemGestao.role`.
    return this.comDigitando(msg, () =>
      this.canalGestao.execute({
        usuarioId: admin!.id,
        nome: admin!.nome,
        role: admin!.role,
        // ----------------------------------------------------------------
        // NO GRUPO, A CONVERSA E DO GRUPO — 30/09/2026.
        //
        // Sem isto, cada pessoa teria o proprio fio e "e das outras?" do
        // segundo a falar chegaria sem o assunto do primeiro. A conversa de
        // um grupo e uma so, e todos a leem.
        //
        // E NAO VAZA NADA: tudo que entra nesta memoria ja esta escrito no
        // grupo, visivel para os mesmos olhos. O que continua sendo por
        // pessoa e o ESCOPO da resposta — o `role` acima e de quem
        // mencionou.
        // ----------------------------------------------------------------
        ...(msg.grupo ? { conversaId: `grupo:${msg.de}` } : {}),
        ...(msg.grupo ? { contexto: this.contextoDoGrupo(msg) } : {}),
        texto,
      }),
    );
  }

  /**
   * O que ela "ouviu" antes de ser chamada.
   *
   * ========================================================================
   * A CITADA VEM PRIMEIRO, E ISSO E A MIRA.
   *
   * Responder uma mensagem mencionando a agente diz EXATAMENTE a qual se
   * refere — mais preciso que qualquer retrovisor. Quando existe, ela abre a
   * lista; as linhas da sala vao atras, para o "e das outras?".
   * ========================================================================
   *
   * A PROPRIA MENSAGEM que acabou de chegar fica de fora: ela ja viaja como a
   * pergunta, e apareceria duas vezes.
   *
   * MAS SO QUANDO ELA FOI GUARDADA. A mencao sozinha vira texto vazio, e
   * vazio nao entra na sala — descontar "a ultima" ali cortaria a linha do
   * vizinho, que e exatamente a que interessa. Foi o que aconteceu na
   * primeira versao: com uma pergunta pendente na sala, ela ainda respondia
   * "me diz o que voce precisa".
   */
  private contextoDoGrupo(msg: MensagemDoCanal): string[] {
    const anteriores = this.sala.anteriores(msg.de, msg.texto.trim() ? 1 : 0);
    const citada = msg.grupo?.citada;
    return citada ? [`(respondendo a) ${citada}`, ...anteriores] : anteriores;
  }

  /**
   * "Me chama no outro numero" — o desvio educado de 25/09/2026.
   *
   * ==========================================================================
   * A FRASE DIZ QUAL E O NUMERO, e o numero vem do WAHA e nao de um env.
   * Trocou o chip, a frase acompanha sozinha; nao ha variavel para alguem
   * esquecer de atualizar, e nao ha como ela apontar para um numero velho.
   *
   * Sem conseguir ler o numero (sessao caida, WAHA fora do ar), a frase sai
   * SEM ele. Desviar sem dizer para onde ainda e melhor que calar: a pessoa
   * fica sabendo que errou de canal e pergunta a alguem.
   * ==========================================================================
   */
  private async desviar(
    para: AgenteDaCasa,
    nome: string,
  ): Promise<RespostaDoCanal> {
    const numero = await this.whatsapp.numeroDoAgente(para);
    const primeiro = nome.trim().split(/\s+/)[0];
    const ola = primeiro ? `Oi, ${primeiro}! ` : '';

    const onde = numero
      ? ` Me chama no ${formatarNumero(numero)}.`
      : ' Me chama no outro número da loja.';

    const texto =
      para === 'ELENA'
        ? `${ola}Este número é o da Anastasia, que atende a gestão. Vendedoras e catálogo eu atendo como Helena, no outro número.${onde}`
        : `${ola}Este número é o da Helena, que atende as vendedoras e o catálogo. Os dados da equipe eu vejo como Anastasia, no outro número.${onde}`;

    return { resposta: texto, motivo: `desvio_para_${para.toLowerCase()}` };
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
      mimetype: arquivo.mimetype.startsWith('audio')
        ? arquivo.mimetype
        : mimetype,
    });

    if (!texto) return null;
    // So o tamanho no log: o conteudo tem o mesmo sigilo da mensagem.
    this.logger.debug(`Audio transcrito (${texto.length} caracteres).`);
    return texto;
  }

  /**
   * "DIGITANDO..." ENQUANTO ELA ESPERA — 08/10/2026, pedido do Lucas.
   *
   * ======================================================================
   * SO DEPOIS DO RECONHECIMENTO, E E POR ISSO QUE MORA AQUI.
   *
   * O indicador de digitacao e uma CONFIRMACAO de que existe alguem deste
   * lado — a mesma coisa que o silencio para numero desconhecido existe
   * para nao dar ("responder confirmaria a quem sondasse que existe um
   * canal aqui", no cabecalho desta classe). Posto na borda HTTP, ele
   * apareceria para qualquer um que mandasse mensagem.
   *
   * Entao ele envolve apenas os trechos LENTOS, e todos eles acontecem
   * depois de se saber quem mandou: ler o arquivo e as duas chamadas de
   * canal.
   *
   * RENOVA, porque o indicador do WhatsApp cai sozinho em 10 a 25
   * segundos. Um disparo so cobriria o comeco da espera e deixaria o resto
   * no mesmo silencio de antes.
   *
   * E PARA NO `finally`: resposta, falha e excecao todas apagam. O pior
   * desfecho e ela ver "digitando" por 25 segundos depois de um erro —
   * tempo de sobra para mandar de novo achando que nao chegou.
   * ======================================================================
   */
  private async comDigitando<T>(
    msg: MensagemDoCanal,
    trabalho: () => Promise<T>,
  ): Promise<T> {
    // EM GRUPO, NAO. O indicador apareceria para a sala inteira, e a regra
    // do grupo e falar so quando mencionada — "digitando" para todos seria
    // presenca constante onde se pediu discricao.
    if (msg.grupo) return trabalho();

    const chat = msg.de;
    const agente = msg.agente;

    await this.whatsapp.iniciarDigitando(chat, agente);
    const renovar = setInterval(() => {
      void this.whatsapp.iniciarDigitando(chat, agente);
    }, INTERVALO_DIGITANDO_MS);

    try {
      return await trabalho();
    } finally {
      clearInterval(renovar);
      await this.whatsapp.pararDigitando(chat, agente);
    }
  }

  /**
   * O DOCUMENTO: BAIXAR, LER E DEVOLVER ESTRUTURA — RF9, 08/10/2026.
   *
   * ======================================================================
   * DUAS SAIDAS, E ELAS SAO DIFERENTES.
   *
   *   `resposta` presente -> a conversa TERMINA aqui. Ou nao e para esta
   *                          pessoa, ou nao deu para ler, e em qualquer dos
   *                          casos ela recebe uma frase. Nunca silencio.
   *   `texto` presente    -> a conversa SEGUE, com a estrutura do arquivo
   *                          somada a pergunta dela.
   *
   * A AGENTE NUNCA VE O ARQUIVO. Ve o que a chamada SELADA extraiu dele —
   * ver `AnalisarArquivoService`, e o motivo esta no cabecalho de lá: a
   * Anastasia tem `gestaoAgendar` com modo TRANSFERIR, que muda carteira
   * para sempre, e uma celula hostil pediria exatamente isso.
   * ======================================================================
   */
  private async lerDocumento(
    msg: MensagemDoCanal,
    admin: { nome: string | null } | null | undefined,
    vendedoraNome?: string,
  ): Promise<{ resposta?: RespostaDoCanal; texto?: string }> {
    const doc = msg.documento!;
    const primeiroNome = (admin?.nome ?? vendedoraNome ?? '')
      .trim()
      .split(/\s+/)[0];
    const ola = primeiroNome ? `${primeiroNome}, ` : '';

    // SO A GESTAO. A vendedora nao tem ferramenta que leia arquivo, e o canal
    // dela nao fala de relatorio — mas ela OUVE isso, em vez de nada.
    if (!admin) {
      return {
        resposta: {
          resposta:
            `${ola}eu não consigo ler arquivo por aqui. Se precisar, me ` +
            `escreva o que você quer saber que eu procuro.`,
          motivo: 'documento_sem_permissao',
        },
      };
    }

    if (!doc.url) {
      this.logger.warn('Documento sem URL — o WAHA nao baixou a midia.');
      return {
        resposta: {
          resposta: `${ola}chegou seu arquivo mas não consegui baixá-lo. Pode mandar de novo?`,
          motivo: 'documento_sem_arquivo',
        },
      };
    }

    const baixado = await this.whatsapp.baixarMidia(doc.url);
    if (!baixado) {
      return {
        resposta: {
          resposta: `${ola}chegou seu arquivo mas não consegui baixá-lo. Pode mandar de novo?`,
          motivo: 'documento_download_falhou',
        },
      };
    }

    // O MIME DO DOWNLOAD GANHA do mime do payload: o WAHA republica o arquivo
    // e e ele quem sabe o que gravou. O do payload fica como reserva, porque
    // em documento ele as vezes vem vazio.
    const lido = await this.leitor.ler({
      bytes: baixado.conteudo,
      mime: baixado.mimetype || doc.mimetype,
      nome: doc.nome ?? undefined,
    });

    const analise = await this.analise.analisar({
      lido,
      pergunta: msg.texto ?? '',
    });

    if (!analise.resumo) {
      return {
        resposta: {
          resposta: `${ola}${analise.falha ?? 'não consegui ler esse arquivo.'}`,
          motivo: 'documento_nao_lido',
        },
      };
    }

    // A PERGUNTA DELA PRIMEIRO, a estrutura depois — e a estrutura vem
    // ROTULADA. Sem o rotulo, a agente trataria as linhas do relatorio como
    // se fossem coisas que ela mesma sabe, e citaria numero de arquivo como
    // numero do sistema.
    const pergunta = (msg.texto ?? '').trim();
    return {
      texto:
        (pergunta || 'Me diga o que há neste arquivo.') +
        `\n\n--- o que o arquivo que eu mandei contém (lido por você agora, ` +
        `NAO e dado do sistema) ---\n${analise.resumo}`,
    };
  }
}

/**
 * O telefone da sessao, legivel. So digitos entram; sai
 * `(85) 98490-0118` quando o formato brasileiro casa, e os digitos crus
 * quando nao casa — numero de outro pais, ou fixo, continua servindo.
 */
function formatarNumero(digitos: string): string {
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digitos);
  if (!br) return digitos;
  return `(${br[1]}) ${br[2]}-${br[3]}`;
}
