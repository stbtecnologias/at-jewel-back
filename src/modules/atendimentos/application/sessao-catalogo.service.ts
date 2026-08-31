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

export interface FotoPendente {
  /** Chave do arquivo JA gravado no armazenamento. */
  arquivoId: string;
  mime: string;
  /** Codigo da peca, quando veio na legenda. */
  codigoErp: string | null;
  parcelas: number | null;
  /**
   * O que sobrou da legenda depois de tirar catalogo, codigo e parcelas:
   * "fundo rosa", "mais claro". Vai para a IA como pedido pontual.
   */
  pedidoDeEstilo?: string | null;
  em: number;
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
  atualizadoEm: number;
}

@Injectable()
export class SessaoCatalogoService {
  private readonly logger = new Logger(SessaoCatalogoService.name);
  private readonly sessoes = new Map<string, Sessao>();

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
   * Descarta sessoes vencidas e devolve as chaves de arquivo que ficaram
   * orfas, para quem chamar apagar do disco. E chamado de dentro do fluxo, e
   * nao por agendador: o volume e baixo e um `setInterval` a mais so existiria
   * para varrer um Map quase sempre vazio.
   */
  limpar(): string[] {
    const orfaos: string[] = [];
    const agora = Date.now();
    for (const [chave, s] of this.sessoes) {
      if (agora - s.atualizadoEm <= JANELA_MS) continue;
      for (const p of s.pendentes) orfaos.push(p.arquivoId);
      this.sessoes.delete(chave);
    }
    if (orfaos.length) {
      this.logger.warn(
        `${orfaos.length} foto(s) expiraram sem catalogo informado.`,
      );
    }
    return orfaos;
  }

  private viva(chave: string): Sessao | null {
    const s = this.sessoes.get(chave);
    if (!s) return null;
    if (Date.now() - s.atualizadoEm > JANELA_MS) {
      this.sessoes.delete(chave);
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
      atualizadoEm: Date.now(),
    };
  }
}
