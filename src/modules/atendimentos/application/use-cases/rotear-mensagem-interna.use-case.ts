import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { RecepcionarUseCase } from './recepcionar.use-case';
import {
  PERMISSAO_CATALOGO,
  ProcessarFotoCatalogoUseCase,
  type ImagemInterna,
} from './processar-foto-catalogo.use-case';

export interface MensagemDoCanal {
  /** Chat de origem, ja traduzido de LID para telefone na borda HTTP. */
  de: string;
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
   * Quando a mensagem foi ESCRITA (ms), pelo carimbo do WhatsApp. E o relogio
   * da aprovacao do catalogo — ver `ProcessarFotoCatalogoUseCase.aprovacao`.
   */
  em?: number;
}

export interface RespostaDoCanal {
  resposta: string | null;
  motivo: string;
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
    const admin =
      gestaoPrimeiro ?? (vendedora ? null : await this.identificarAdmin.execute(telefone));

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
    if (separadas && !naAnastasia && admin) {
      return this.desviar('ANASTASIA', admin.nome ?? '');
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
    if (!texto) {
      return { resposta: null, motivo: 'ignorado_sem_conteudo' };
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

      return this.recepcionar.saudar(
        msg.de,
        {
          vendedora: !!vendedora,
          gestao: !!admin,
          catalogo: !!doCatalogo || !!gestaoComCatalogo,
        },
        vendedora?.nome ?? admin?.nome ?? doCatalogo?.nome ?? '',
      );
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
