import { Injectable, Logger } from '@nestjs/common';

/**
 * Memoria curta da conversa de catalogo no WhatsApp.
 *
 * ==========================================================================
 * TRES COISAS VIVEM AQUI, E POR MOTIVOS DIFERENTES.
 *
 * 1. O CATALOGO ESCOLHIDO. Quem fotografa 20 pecas de uma colecao nao vai
 *    dizer "e do 0002" vinte vezes. A primeira resposta vale para as fotos
 *    seguintes daquele remetente.
 *
 * 2. AS FOTOS AGUARDANDO CATALOGO. O arquivo do WAHA vive 30 minutos, entao
 *    ele e baixado e gravado ANTES de saber a que catalogo pertence. A linha
 *    no banco, nao: `catalogo_id` e NOT NULL. Entao a foto ja gravada em disco
 *    espera aqui ate a pessoa responder.
 *
 *    O CUSTO ACEITO: reiniciar o processo perde a fila e deixa o arquivo orfao
 *    no disco. E o preco de nao ter, ainda, a tela de "nao classificadas" que
 *    justificaria tornar `catalogo_id` nulavel. Quando essa tela existir, esta
 *    metade do servico sai e vira linha no banco.
 *
 * 3. A CATRACA DA APROVACAO. Um booleano dizendo se ja saiu foto tratada
 *    esperando o "aprovo" daquele remetente. Aqui a memoria e so um ATALHO —
 *    a fila de verdade esta no banco, em EM_APROVACAO. Ver `aguardandoAprovacao`.
 *
 * DESDE 11/09/2026 A SESSAO TAMBEM E "A CONVERSA ABERTA". Decisao do Lucas:
 * a pessoa manda as coisas NA ORDEM QUE QUISER — a intencao antes da foto, o
 * codigo antes da foto, o "aprovo" antes do codigo. Cada peca que chega fica
 * guardada aqui ate a foto ficar completa. E o relogio da aprovacao mora aqui
 * tambem: quando cada foto tratada saiu, para uma afirmacao so valer para foto
 * que a pessoa ja viu. Ver `enviadas`.
 * ==========================================================================
 *
 * Map em memoria, como o `MemoriaConversaService` dos outros dois canais: o
 * processo e unico e a janela e curta. Nao vale um Redis para 30 minutos de
 * "de qual catalogo e essa foto".
 */

/** Janela de validade. Igual ao `WHATSAPP_FILES_LIFETIME` do WAHA, e nao por acaso. */
const JANELA_MS = 30 * 60 * 1000;

/** Teto de fotos penduradas por remetente. Evita fila infinita de quem nunca responde. */
const MAX_PENDENTES = 30;

/**
 * Folga do relogio da aprovacao.
 *
 * O WhatsApp carimba a mensagem em SEGUNDOS, e o nosso relogio e o dele nao
 * batem ao milissegundo. Dois segundos cobrem as duas coisas — e ninguem ve a
 * foto, le e responde em menos que isso, entao a folga nao abre a porta que o
 * relogio existe para fechar.
 */
export const FOLGA_RELOGIO_MS = 2000;

/**
 * Uma peca que a busca por descricao devolveu, esperando escolha.
 *
 * O PRECO VAI JUNTO de proposito. Duas pecas da mesma familia tem descricao
 * quase igual — "ANEL ESMERALDA OB 18K" e "ANEL ESMERALDA GOTA OB 18K" —, e o
 * valor e o que separa uma da outra num relance. Escolher errado aqui nao
 * levanta erro nenhum: imprime o preco de outra peca na pagina do catalogo.
 */
export interface OpcaoPeca {
  codigo: string;
  descricao: string;
  preco: number | null;
}

export interface FotoPendente {
  /** Chave do arquivo JA gravado no armazenamento. */
  arquivoId: string;
  mime: string;
  /** Codigo da peca, quando veio na legenda. */
  codigoErp: string | null;
  parcelas: number | null;
  /** Juro em %. null = nao informado, vale a regra da casa. */
  juros?: number | null;
  /**
   * O que sobrou da legenda depois de tirar catalogo, codigo e parcelas:
   * "fundo rosa", "mais claro". Vai para a IA como pedido pontual.
   */
  pedidoDeEstilo?: string | null;
  em: number;
}

/**
 * A foto que espera o codigo.
 *
 * `aprovada` e a aprovacao que chegou ANTES do codigo — decisao do Lucas em
 * 11/09: a pessoa diz as coisas na ordem que quiser. Ate aqui um "aprovo" sem
 * codigo recebia "falta o codigo", e depois do codigo era preciso aprovar DE
 * NOVO: tres mensagens para uma intencao so. Com a marca, o codigo que chegar
 * anota e publica de uma vez.
 */
export interface CodigoEsperado {
  fotoId: string;
  alvo: string;
  aprovada?: boolean;
}

/** O codigo mandado antes da foto, com o que veio junto dele. */
export interface CodigoAdiantado {
  codigoErp: string;
  parcelas: number | null;
  juros: number | null;
}

interface Sessao {
  catalogoId: string | null;
  catalogoNumero: string | null;
  catalogoNome: string | null;
  pendentes: FotoPendente[];
  /**
   * Ja mandei para este remetente alguma foto tratada esperando o "aprovo"?
   *
   * E UMA CATRACA DE ROTEAMENTO, e nao a verdade. A verdade e o status
   * EM_APROVACAO no banco; isto existe para o roteador saber, SEM ir ao banco,
   * se vale tratar o texto como resposta de aprovacao. Sem a catraca, toda
   * mensagem de texto do canal interno pagaria uma consulta a mais — e, pior,
   * um lookup de admin ANTES do de vendedora, invertendo a ordem que protege
   * o canal restrito.
   *
   * Reiniciar o processo perde a marca: a foto continua EM_APROVACAO e sera
   * aprovada pela tela. Perde-se o atalho, nunca o trabalho.
   */
  aguardandoAprovacao: boolean;
  /** Perguntei "o que quer que eu mude?" e ainda não recebi a resposta. */
  aguardandoPedido: boolean;
  /**
   * A última foto guardada veio SEM código, e eu convidei a pessoa a mandá-lo.
   *
   * Sem isto o convite era vazio: a mensagem dizia "me manda o código da peça
   * que eu completo o descritivo" e o `BR26252` digitado em seguida caía na
   * Anastasia, que respondia "esse código não me diz muito sozinho". Medido
   * em 01/09/2026.
   */
  fotoSemCodigo: CodigoEsperado | null;
  /**
   * O codigo que chegou ANTES da foto — "CO26185", mandado sozinho com a
   * conversa aberta. Vale para a proxima foto sem codigo na legenda, e so
   * para ela.
   */
  codigoAdiantado: CodigoAdiantado | null;
  /**
   * Quando cada foto tratada SAIU para o WhatsApp, por id.
   *
   * E O RELOGIO DA APROVACAO. Uma afirmacao so vale para foto que ja tinha
   * chegado quando a pessoa escreveu. Em 10/09 o "Ok" do Yerlon respondia a
   * "codigo anotado", e a foto tratada chegou um minuto depois: se tivesse
   * chegado segundos antes, aquele "Ok" teria publicado uma foto que ele nao
   * viu.
   */
  enviadas: Map<string, number>;
  /**
   * Fotos com a versao tratada A CAMINHO: o status ja e EM_APROVACAO no
   * banco, mas a imagem ainda nao saiu. Nesse intervalo o banco diz "pode
   * aprovar" e a pessoa ainda nao viu nada — e o intervalo que o relogio fecha.
   */
  emEnvio: Set<string>;
  /**
   * Ja dei a dica "responde aprovo, ajusta ou descarta" para esta foto. E de
   * um uso so: a segunda frase que eu nao entender vai para os agentes, como
   * sempre foi.
   */
  dicaDada: Set<string>;
  /**
   * A lista que eu acabei de mostrar — "1 · CB384 …", "2 · CB512 …" —,
   * esperando o numero.
   *
   * ANDA COLADA AO `fotoSemCodigo`, e nunca sozinha: a escolha so faz sentido
   * enquanto existe a foto que vai receber o codigo. Por isso nasce e morre
   * junto — ver `esperarCodigo` e `esquecerCodigo`. Solta, uma lista velha
   * transformaria o "2" digitado dez minutos depois no codigo de uma peca que
   * ninguem estava mais procurando.
   */
  escolha: OpcaoPeca[] | null;
  atualizadoEm: number;
}

@Injectable()
export class SessaoCatalogoService {
  private readonly logger = new Logger(SessaoCatalogoService.name);
  private readonly sessoes = new Map<string, Sessao>();
  /** Fotos de sessoes ja vencidas, esperando o aviso a quem as mandou. */
  private readonly vencidas = new Map<string, FotoPendente[]>();

  /** Catalogo lembrado da ultima vez, se ainda dentro da janela. */
  catalogoAtual(
    chave: string,
  ): { id: string; numero: string; nome: string } | null {
    const s = this.viva(chave);
    if (!s?.catalogoId) return null;
    return {
      id: s.catalogoId,
      numero: s.catalogoNumero!,
      nome: s.catalogoNome!,
    };
  }

  lembrarCatalogo(
    chave: string,
    catalogo: { id: string; numero: string; nome: string },
  ): void {
    const s = this.viva(chave) ?? this.nova();
    s.catalogoId = catalogo.id;
    s.catalogoNumero = catalogo.numero;
    s.catalogoNome = catalogo.nome;
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /**
   * Pendura uma foto ja gravada esperando a resposta de "qual catalogo".
   * @returns false quando a fila daquele remetente estourou.
   */
  pendurar(chave: string, foto: Omit<FotoPendente, 'em'>): boolean {
    const s = this.viva(chave) ?? this.nova();
    if (s.pendentes.length >= MAX_PENDENTES) return false;
    s.pendentes.push({ ...foto, em: Date.now() });
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
    return true;
  }

  temPendentes(chave: string): boolean {
    return (this.viva(chave)?.pendentes.length ?? 0) > 0;
  }

  /**
   * Marca que ha foto tratada esperando o "aprovo" deste remetente. Chamado
   * depois de a versao tratada sair para o WhatsApp — antes disso nao ha o que
   * aprovar.
   */
  marcarEmAprovacao(chave: string): void {
    const s = this.viva(chave) ?? this.nova();
    s.aguardandoAprovacao = true;
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  temEmAprovacao(chave: string): boolean {
    return this.viva(chave)?.aguardandoAprovacao ?? false;
  }

  /**
   * Baixa a catraca quando a fila do banco esvaziou. Nao apaga a sessao: o
   * catalogo lembrado continua valendo para as proximas fotos.
   */
  esquecerAprovacao(chave: string): void {
    const s = this.viva(chave);
    if (!s) return;
    s.aguardandoAprovacao = false;
    this.sessoes.set(chave, s);
  }

  /**
   * Acabei de perguntar "o que você quer que eu mude?" — então a PRÓXIMA
   * mensagem desta pessoa é a resposta, e não precisa começar com `ajusta`.
   *
   * SEM ISTO A CONVERSA NÃO FECHA. Aconteceu em 31/08: eu perguntei, o Lucas
   * respondeu "apenas a pedra que foi acrescentada e não tem", e a resposta
   * caiu na Anastasia — porque não abria com a palavra de comando. Exigir a
   * palavra numa resposta a uma pergunta minha é cobrar senha de quem eu
   * mesmo chamei.
   *
   * É de um uso só: a marca cai assim que a resposta chega, seja ela pedido de
   * ajuste ou outra coisa qualquer.
   */
  pedirOAjuste(chave: string): void {
    const s = this.viva(chave) ?? this.nova();
    s.aguardandoPedido = true;
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /** Consome a marca: devolve se estava esperando, e já baixa. */
  eraRespostaDeAjuste(chave: string): boolean {
    const s = this.viva(chave);
    if (!s?.aguardandoPedido) return false;
    s.aguardandoPedido = false;
    this.sessoes.set(chave, s);
    return true;
  }

  /**
   * Guarda que esta foto ficou sem código, para o código digitado em seguida
   * ter onde entrar.
   *
   * SÓ A ÚLTIMA. Mandando três fotos sem código, o `BR26252` que vier depois
   * é da terceira — é a que ela acabou de ver confirmada na tela. Uma fila
   * aqui exigiria dizer de qual peça é cada código, e quem fotografa em série
   * manda o código junto da legenda de qualquer forma.
   *
   * @param alvo rótulo do catálogo, para a confirmação citar onde a peça está.
   * @param aprovada a pessoa já aprovou — o código que chegar publica junto.
   */
  esperarCodigo(
    chave: string,
    fotoId: string,
    alvo: string,
    aprovada = false,
  ): void {
    const s = this.viva(chave) ?? this.nova();
    // Convite novo, lista velha morre: as opcoes da foto anterior nao servem
    // para esta. MAS SO SE A FOTO FOR OUTRA — o "aprovo" dito com a lista na
    // tela marca a MESMA foto, e apagar a lista ali faria o "2" digitado em
    // seguida perder o lugar onde entrar.
    if (s.fotoSemCodigo?.fotoId !== fotoId) s.escolha = null;
    s.fotoSemCodigo = { fotoId, alvo, aprovada };
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  codigoPendente(chave: string): CodigoEsperado | null {
    return this.viva(chave)?.fotoSemCodigo ?? null;
  }

  // ---------------------------------------------------------------------------
  // A conversa aberta — decisao do Lucas em 11/09/2026: em qualquer ordem.
  // ---------------------------------------------------------------------------

  /**
   * "Quero mandar foto pro catalogo" abre a conversa ANTES da foto.
   *
   * Ate aqui so a foto abria. Em 10/09 o Yerlon disse o que queria e qual
   * catalogo, a frase foi para a Anastasia, e a foto que veio em seguida
   * perguntou de novo o que ele ja tinha dito.
   */
  abrirConversa(chave: string): void {
    const s = this.viva(chave) ?? this.nova();
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /**
   * Ha conversa de catalogo em curso com este remetente?
   *
   * E a MESMA sessao de 30 minutos que ja existia. Fora dela, texto de gestao
   * continua sendo da Anastasia — um `0003` solto numa conversa sobre vendas
   * nao pode virar catalogo.
   */
  conversaAberta(chave: string): boolean {
    return this.viva(chave) !== null;
  }

  /** Guarda o codigo que chegou antes da foto. Substitui o anterior. */
  adiantarCodigo(chave: string, codigo: CodigoAdiantado): void {
    const s = this.viva(chave) ?? this.nova();
    s.codigoAdiantado = codigo;
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /** Retira o codigo adiantado: vale para UMA foto. */
  retirarCodigoAdiantado(chave: string): CodigoAdiantado | null {
    const s = this.viva(chave);
    if (!s?.codigoAdiantado) return null;
    const codigo = s.codigoAdiantado;
    s.codigoAdiantado = null;
    this.sessoes.set(chave, s);
    return codigo;
  }

  // ---------------------------------------------------------------------------
  // O relogio da aprovacao
  // ---------------------------------------------------------------------------

  /** A versao tratada desta foto esta saindo — ainda ninguem a viu. */
  marcarEmEnvio(chave: string, fotoId: string): void {
    const s = this.viva(chave) ?? this.nova();
    s.emEnvio.add(fotoId);
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /** Saiu. A partir de agora, afirmacao que chegar vale para ela. */
  marcarEnviada(chave: string, fotoId: string, em = Date.now()): void {
    const s = this.viva(chave) ?? this.nova();
    s.emEnvio.delete(fotoId);
    s.enviadas.set(fotoId, em);
    // Versao nova, dica nova: a dica valeu para a imagem anterior.
    s.dicaDada.delete(fotoId);
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /** O envio nao aconteceu (falha, recado da IA). Tira a marca de "a caminho". */
  desistirDoEnvio(chave: string, fotoId: string): void {
    this.viva(chave)?.emEnvio.delete(fotoId);
  }

  /**
   * A pessoa ja tinha visto esta foto quando escreveu?
   *
   * @param escritaEm quando a mensagem foi ESCRITA, pelo carimbo do WhatsApp.
   *
   * SEM REGISTRO DE ENVIO, A RESPOSTA E SIM, e nao por descuido: a memoria e
   * RAM, e um restart a apaga. Uma foto EM_APROVACAO sem hora de envio foi
   * enviada antes do que a memoria lembra — ha mais de meia hora ou antes do
   * restart —, e recusar ali deixaria a pessoa sem saida. O "nao" fica para o
   * unico caso em que ele e certo: a foto a caminho, ou enviada DEPOIS de a
   * mensagem ser escrita.
   */
  foiVista(chave: string, fotoId: string, escritaEm: number): boolean {
    const s = this.viva(chave);
    if (!s) return true;
    if (s.emEnvio.has(fotoId)) return false;
    const enviada = s.enviadas.get(fotoId);
    if (enviada === undefined) return true;
    return escritaEm + FOLGA_RELOGIO_MS >= enviada;
  }

  /**
   * Registra a dica para esta foto. Devolve `false` quando ela ja tinha sido
   * dada — ai a frase segue para os agentes.
   */
  darDica(chave: string, fotoId: string): boolean {
    const s = this.viva(chave) ?? this.nova();
    if (s.dicaDada.has(fotoId)) return false;
    s.dicaDada.add(fotoId);
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
    return true;
  }

  esquecerCodigo(chave: string): void {
    const s = this.viva(chave);
    if (!s) return;
    s.fotoSemCodigo = null;
    s.escolha = null;
    this.sessoes.set(chave, s);
  }

  /**
   * Guarda a lista mostrada, para o numero digitado em seguida ter onde entrar.
   * Substitui a anterior: quem busca de novo esta corrigindo a busca.
   */
  oferecerEscolha(chave: string, opcoes: OpcaoPeca[]): void {
    const s = this.viva(chave) ?? this.nova();
    s.escolha = opcoes;
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  escolhaPendente(chave: string): OpcaoPeca[] | null {
    return this.viva(chave)?.escolha ?? null;
  }

  /**
   * O codigo chegou antes do catalogo: anota nas fotos penduradas que ainda
   * nao tem codigo. As que ja tem ficam como estao — o da legenda de cada uma
   * e mais especifico.
   *
   * @returns quantas fotos receberam o codigo.
   */
  completarPendentes(chave: string, codigo: CodigoAdiantado): number {
    const s = this.viva(chave);
    if (!s) return 0;
    let n = 0;
    s.pendentes = s.pendentes.map((p) => {
      if (p.codigoErp) return p;
      n++;
      return {
        ...p,
        codigoErp: codigo.codigoErp,
        parcelas: p.parcelas ?? codigo.parcelas,
        juros: p.juros ?? codigo.juros,
      };
    });
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
    return n;
  }

  /** Retira e devolve tudo que estava esperando. */
  recolherPendentes(chave: string): FotoPendente[] {
    const s = this.viva(chave);
    if (!s) return [];
    const fila = s.pendentes;
    s.pendentes = [];
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
    return fila;
  }

  /**
   * Descarta as sessoes vencidas e devolve, POR REMETENTE, as fotos que
   * morreram sem ninguem dizer o catalogo — para quem chamar apagar o arquivo
   * E AVISAR.
   *
   * ==========================================================================
   * ATE 11/09/2026 ISTO DEVOLVIA SO AS CHAVES DE ARQUIVO, e a foto sumia calada.
   * Em 10/09 o Yerlon mandou uma foto, nao respondeu "de qual catalogo", e ela
   * desapareceu meia hora depois sem uma palavra — quem mandou acha que deu
   * certo. Agrupar por remetente e o que permite dizer a ELE o que aconteceu.
   * ==========================================================================
   */
  recolherVencidas(): Map<string, FotoPendente[]> {
    const agora = Date.now();
    for (const [chave, s] of this.sessoes) {
      if (agora - s.atualizadoEm > JANELA_MS) this.enterrar(chave, s);
    }

    const saida = new Map(this.vencidas);
    this.vencidas.clear();

    const total = [...saida.values()].reduce((n, f) => n + f.length, 0);
    if (total) {
      this.logger.warn(`${total} foto(s) expiraram sem catalogo informado.`);
    }
    return saida;
  }

  /**
   * Daqui a quantos milissegundos vence a proxima sessao COM FOTO PENDURADA.
   * `null` quando nao ha nenhuma — e ai nao ha o que agendar.
   */
  proximoVencimento(): number | null {
    const agora = Date.now();
    let menor: number | null = null;
    for (const s of this.sessoes.values()) {
      if (s.pendentes.length === 0) continue;
      const falta = Math.max(0, s.atualizadoEm + JANELA_MS - agora);
      if (menor === null || falta < menor) menor = falta;
    }
    return menor;
  }

  /**
   * Tira a sessao vencida do mapa — mas as fotos penduradas nela vao para a
   * lista das vencidas, e nao para o nada. Antes, qualquer consulta que
   * esbarrasse numa sessao vencida a apagava junto com as fotos, e o arquivo
   * ficava orfao no armazenamento sem ninguem saber.
   */
  private enterrar(chave: string, s: Sessao): void {
    if (s.pendentes.length > 0) {
      this.vencidas.set(chave, [
        ...(this.vencidas.get(chave) ?? []),
        ...s.pendentes,
      ]);
    }
    this.sessoes.delete(chave);
  }

  private viva(chave: string): Sessao | null {
    const s = this.sessoes.get(chave);
    if (!s) return null;
    if (Date.now() - s.atualizadoEm > JANELA_MS) {
      this.enterrar(chave, s);
      return null;
    }
    return s;
  }

  private nova(): Sessao {
    return {
      catalogoId: null,
      catalogoNumero: null,
      catalogoNome: null,
      pendentes: [],
      aguardandoAprovacao: false,
      aguardandoPedido: false,
      fotoSemCodigo: null,
      codigoAdiantado: null,
      enviadas: new Map(),
      emEnvio: new Set(),
      dicaDada: new Set(),
      escolha: null,
      atualizadoEm: Date.now(),
    };
  }
}
