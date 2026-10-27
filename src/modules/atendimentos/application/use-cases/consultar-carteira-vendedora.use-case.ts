import { Inject, Injectable } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type {
  ClienteDaCarteira,
  ClienteDaEpoca,
  EscopoDeCliente,
  IClienteRepository,
  PaginaDeFidelidade,
} from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import type { NivelDeFidelidade } from '../../../../shared/clientes/fidelidade';
import {
  janelasDaDataComemorativa,
  janelasDoMes,
  anosRecentes,
  type NomeComemorativo,
} from '../../../../shared/tempo/datas-comemorativas';

/**
 * Quantos clientes cabem numa resposta.
 *
 * VINTE, desde 05/10/2026 — eram dez. O numero velho servia para uma pergunta
 * diferente: "me da uma ideia de quem esta parado". A gestora fez a outra —
 * "quem esta parado na carteira da Keyciane" — e queria TRABALHAR a lista: 97
 * clientes parados, dez por vez e sem como avancar. A agente respondeu a
 * verdade, "nao consigo chegar ao 11o", e a verdade nao servia.
 *
 * ENTAO A MUDANCA REAL NAO E O NUMERO, E O `deslocamento`: dez ou vinte, sem
 * paginar a lista longa continua inalcancavel. Vinte e o tamanho que cabe numa
 * mensagem sem virar parede — cinco pedidos cobrem os 97.
 *
 * O teto SO funciona acompanhado do total. Ver `contarInativosDaCarteira`.
 */
const MAXIMO = 20;

/**
 * A carteira da vendedora: quem esta parado e quem mais compra.
 *
 * ESCOPO PELO CODIGO DO ERP. A carteira e `clientes.vendedora_codigo_erp`, o
 * mesmo campo que o `avisar_vendedora` usa para decidir quem avisar. O codigo
 * e parametro obrigatorio das consultas — nao existe versao sem recorte, entao
 * nao existe caminho para a carteira de outra pessoa.
 *
 * O QUE SAI DAQUI NAO TEM TELEFONE NEM E-MAIL. Ela ve nome, quando comprou pela
 * ultima vez, quanto e quantas vezes. Contato ela ja tem no proprio celular; o
 * que o canal nao precisa carregar, nao carrega.
 *
 * Vendedora sem `codigo_erp` nao tem carteira — devolve vazio em vez de
 * explodir, e o agente diz que nao encontrou clientes.
 */
/** Uma amostra da carteira, com quantos existem no total. */
export interface PaginaDaCarteira {
  clientes: ClienteDaCarteira[];
  /** Quantos atendem ao criterio — nao quantos vieram na amostra. */
  total: number;
  /**
   * Quantos foram pulados para montar esta pagina.
   *
   * VOLTA JUNTO para quem formata poder dizer "21 a 40 de 97" sem recalcular
   * — e sem depender de lembrar o que pediu.
   */
  deslocamento?: number;
}

/**
 * As janelas de um recorte de epoca, para os dois escopos.
 *
 * SEM MES E SEM DATA, LISTA VAZIA — e a consulta devolve nada. A pergunta nao
 * ficou de pe, e responder "a carteira inteira ordenada por compras" seria
 * responder OUTRA coisa com cara de resposta certa.
 */
function janelasDoRecorte(recorte: {
  mes?: number;
  dataComemorativa?: NomeComemorativo;
}): { de: Date; ate: Date }[] {
  const anos = anosRecentes(ANOS_DE_HISTORICO);
  if (recorte.dataComemorativa) {
    return janelasDaDataComemorativa(recorte.dataComemorativa, anos);
  }
  return recorte.mes ? janelasDoMes(recorte.mes, anos) : [];
}

/** O mesmo, para a pergunta de epoca: cada linha diz em quantos anos repetiu. */
export interface PaginaDaEpoca {
  clientes: ClienteDaEpoca[];
  total: number;
}

/**
 * Quantos anos para tras a pergunta de epoca olha.
 *
 * A base comeca em junho de 2023. Cinco cobre o historico inteiro e sobra —
 * ano sem venda devolve vazio e nao custa quase nada.
 */
const ANOS_DE_HISTORICO = 5;

@Injectable()
export class ConsultarCarteiraVendedoraUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
  ) {}

  /**
   * Quem nao compra desde `desde` — inclui quem nunca comprou.
   *
   * A DATA CHEGA PRONTA, e nao um numero de meses — 01/10/2026. Ela pergunta
   * "ha 45 dias", "desde julho" e "ha 6 meses", e quem entende a frase e quem
   * conversa com ela; aqui dentro so existe uma data de corte.
   *
   * Devolve a amostra E o total. Sem o total, "estes estao parados" soa
   * completo com dez de trezentos, e quem le vai embora com a impressao
   * errada. O teto so e honesto se vier acompanhado do numero.
   */
  async semComprar(
    vendedoraCodigoErp: string | null,
    desde: Date,
    /**
     * Quantos pular. Zero e a primeira pagina.
     *
     * NEGATIVO VIRA ZERO, e nao erro: quem preenche este campo e um modelo de
     * linguagem a partir de "me manda os proximos". Um -5 que chegasse ao SQL
     * seria erro de banco no meio de uma conversa; virar a primeira pagina e
     * o pior que pode acontecer, e e inofensivo.
     */
    deslocamento = 0,
    /** Quantos trazer. O arquivo pede mais que a conversa — 27/10/2026. */
    limite?: number,
  ): Promise<PaginaDaCarteira> {
    if (!vendedoraCodigoErp) return { clientes: [], total: 0 };

    const pular = Math.max(0, Math.trunc(deslocamento));
    const [clientes, total] = await Promise.all([
      this.clientes.inativosDaCarteira(
        vendedoraCodigoErp,
        desde,
        limite ?? MAXIMO,
        pular,
      ),
      this.clientes.contarInativosDaCarteira(vendedoraCodigoErp, desde),
    ]);
    return { clientes, total, deslocamento: pular };
  }

  /**
   * QUEM COMPRA NAQUELA EPOCA, somando todos os anos — 01/10/2026.
   *
   * Pedido do Lucas: "quem mais compra no mes de outubro?", "quem mais compra
   * no dia das maes?", "quem mais compra no natal?".
   *
   * UMA PERGUNTA SO, e nao duas ferramentas. Mes e data comemorativa viram a
   * mesma lista de janelas antes de chegar ao banco — para quem conversa, e a
   * mesma pergunta, e duas ferramentas parecidas e o que faz o modelo escolher
   * errado.
   *
   * CINCO ANOS. A base tem historico desde 2023; pedir mais anos do que existe
   * custa uma faixa a mais no `OR` e devolve vazio, o que e barato. Pedir
   * menos esconderia dado que esta la.
   *
   * SEM RECORTE, VAZIO. Nem mes nem data = a pergunta nao ficou de pe. Devolver
   * a carteira inteira ordenada por compras seria responder OUTRA coisa — e a
   * agente apresentaria como se fosse a resposta certa.
   */
  async porEpoca(
    vendedoraCodigoErp: string | null,
    recorte: { mes?: number; dataComemorativa?: NomeComemorativo },
    limite?: number,
  ): Promise<PaginaDaEpoca> {
    if (!vendedoraCodigoErp) return { clientes: [], total: 0 };

    const janelas = janelasDoRecorte(recorte);

    return this.clientes.compradoresPorEpoca(
      { tipo: 'CARTEIRA', vendedoraCodigoErp },
      janelas,
      limite ?? MAXIMO,
    );
  }

  /**
   * A MESMA PERGUNTA, PELA LOJA INTEIRA — 01/10/2026.
   *
   * ======================================================================
   * METODO SEPARADO, E NAO O MESMO COM O CODIGO NULO.
   *
   * "Sem vendedora = a loja" seria um desastre mudo: no canal da vendedora o
   * codigo chega NULO quando ela nao tem cadastro no ERP, e ela veria a loja
   * inteira sem ninguem ter escrito isso em lugar nenhum.
   *
   * Quem chama este metodo esta dizendo LOJA com todas as letras — e quem
   * chama e so a gestao, atras da guarda de `verLoja`.
   * ======================================================================
   */
  async porEpocaDaLoja(
    recorte: {
      mes?: number;
      dataComemorativa?: NomeComemorativo;
    },
    limite?: number,
  ): Promise<PaginaDaEpoca> {
    const janelas = janelasDoRecorte(recorte);
    return this.clientes.compradoresPorEpoca(
      { tipo: 'LOJA' },
      janelas,
      limite ?? MAXIMO,
    );
  }

  /**
   * Quem mais comprou. Com `categoria` a conta e de ITENS daquele tipo
   * ("quem comprou mais aneis"); sem ela, de COMPRAS ("quem mais compra de
   * mim"). Sao perguntas diferentes e a unidade muda junto.
   */
  /**
   * O PERIODO FECHADO — 27/10/2026.
   *
   * ======================================================================
   * *"As compras dos clientes da Ylka em 2025 e 2026."*
   *
   * So havia `ultimosMeses`, que conta de hoje para tras — e com ele nao se
   * pergunta "2025". Um ano fechado precisa das duas pontas, e e assim que
   * a pergunta chega: "em 2025", "de janeiro a marco".
   *
   * `de`/`ate` GANHAM do `ultimosMeses` quando vem juntos: sao mais
   * especificos, e misturar os dois daria uma janela que ninguem pediu.
   * ======================================================================
   */
  async maioresCompradores(
    vendedoraCodigoErp: string | null,
    opcoes: {
      categoria?: string;
      ultimosMeses?: number;
      de?: Date;
      ate?: Date;
      /** Quantos clientes trazer. O arquivo pede mais que a conversa. */
      limite?: number;
    },
  ): Promise<PaginaDaCarteira> {
    if (!vendedoraCodigoErp) return { clientes: [], total: 0 };

    let desde: Date | undefined = opcoes.de;
    if (!desde && opcoes.ultimosMeses && opcoes.ultimosMeses > 0) {
      desde = new Date();
      desde.setMonth(desde.getMonth() - opcoes.ultimosMeses);
    }
    // ATE A MEIA-NOITE INCLUSIVE: a data chega as 00:00, e sem isto o
    // ultimo dia da janela ficaria de fora inteiro.
    const ate = fimDoDia(opcoes.de ? opcoes.ate : undefined);

    const [clientes, total] = await Promise.all([
      this.clientes.maioresCompradoresDaCarteira(vendedoraCodigoErp, {
        categoria: opcoes.categoria,
        desde,
        ate,
        limite: opcoes.limite ?? MAXIMO,
      }),
      this.clientes.contarCompradoresDaCarteira(vendedoraCodigoErp, {
        categoria: opcoes.categoria,
        desde,
        ate,
      }),
    ]);
    return { clientes, total };
  }

  /**
   * OS CLIENTES POR NÍVEL DE FIDELIDADE — Ouro, Prata, Bronze — 09/10/2026.
   *
   * ==========================================================================
   * O ESCOPO É EXPLÍCITO, E ISSO NÃO É DETALHE.
   *
   * Quem chama tem de escrever `{ tipo: 'LOJA' }` para alcançar a loja: no
   * canal da vendedora o código do ERP chega NULO quando ela não tem cadastro,
   * e "nulo = a loja inteira" faria aquela vendedora ver a base toda sem
   * ninguém ter decidido isso. É a mesma proteção do `compradoresPorEpoca`.
   * ==========================================================================
   *
   * `mesesSemComprar` vira data AQUI e não no repositório: "seis meses atrás"
   * é regra de aplicação, e o repositório recebe o instante pronto — o que
   * deixa a consulta testável sem relógio.
   */
  async porFidelidade(opcoes: {
    escopo: EscopoDeCliente;
    nivel?: NivelDeFidelidade;
    mesesSemComprar?: number;
    deslocamento?: number;
    /** O arquivo pede mais que a conversa — 27/10/2026. */
    limite?: number;
  }): Promise<PaginaDeFidelidade & { deslocamento: number }> {
    let semCompraDesde: Date | undefined;
    if (opcoes.mesesSemComprar && opcoes.mesesSemComprar > 0) {
      semCompraDesde = new Date();
      semCompraDesde.setMonth(semCompraDesde.getMonth() - opcoes.mesesSemComprar);
    }

    const deslocamento = opcoes.deslocamento ?? 0;
    const pagina = await this.clientes.clientesPorFidelidade(opcoes.escopo, {
      nivel: opcoes.nivel,
      semCompraDesde,
      limite: opcoes.limite ?? MAXIMO,
      deslocamento,
    });
    return { ...pagina, deslocamento };
  }
  /**
   * AS COMPRAS DE CADA CLIENTE, ANO A ANO — 27/10/2026.
   *
   * ======================================================================
   * O PEDIDO, NAS PALAVRAS DE QUEM PEDIU:
   *
   *   "Organizar por cliente, em ordem alfabetica, mostrando a quantidade
   *    de pecas compradas em cada ano, o valor das compras e o total dos
   *    dois anos."
   *
   * Ate aqui a pergunta nao tinha resposta: a janela unica (2025 ate 2026)
   * devolvia a SOMA dos dois anos, e perguntar um ano de cada vez fazia a
   * segunda tabela escrever por cima da primeira — o PDF saia com um ano.
   * ======================================================================
   *
   * OS ANOS SAEM DA JANELA, e nao do que foi comprado: um cliente que so
   * comprou em 2026 aparece com 2025 zerado, e isso E a informacao. Se os
   * anos viessem dos dados, a tabela mudaria de colunas conforme a linha.
   */
  async comprasPorAno(
    vendedoraCodigoErp: string | null,
    opcoes: { de: Date; ate: Date; limite?: number },
  ): Promise<PaginaDeComprasPorAno> {
    if (!vendedoraCodigoErp) return { clientes: [], anos: [], total: 0 };

    const ate = fimDoDia(opcoes.ate) ?? opcoes.ate;
    const anos: number[] = [];
    for (
      let ano = opcoes.de.getFullYear();
      ano <= ate.getFullYear();
      ano += 1
    ) {
      anos.push(ano);
    }

    const [linhas, total] = await Promise.all([
      this.clientes.comprasPorAnoDaCarteira(vendedoraCodigoErp, {
        de: opcoes.de,
        ate,
        limite: opcoes.limite ?? MAXIMO,
      }),
      this.clientes.contarClientesComCompraNaCarteira(vendedoraCodigoErp, {
        de: opcoes.de,
        ate,
      }),
    ]);

    // O PIVO MORA AQUI, e nao no SQL: a tabela tem duas colunas por ano, e
    // quantos anos sao so se sabe depois de ler a janela.
    const porCliente = new Map<string, ClienteComprasPorAno>();
    for (const l of linhas) {
      let cliente = porCliente.get(l.clienteId);
      if (!cliente) {
        cliente = {
          nome: l.nome,
          porAno: {},
          totalPecas: 0,
          totalValor: 0,
        };
        porCliente.set(l.clienteId, cliente);
      }
      cliente.porAno[l.ano] = { pecas: l.pecas, valor: l.valor };
      cliente.totalPecas += l.pecas;
      cliente.totalValor += l.valor;
    }

    return { clientes: [...porCliente.values()], anos, total };
  }
}

/** A data chega as 00:00; o fim da janela tem de cobrir o dia inteiro. */
function fimDoDia(data?: Date): Date | undefined {
  if (!data) return undefined;
  const fim = new Date(data);
  if (
    fim.getHours() === 0 &&
    fim.getMinutes() === 0 &&
    fim.getSeconds() === 0 &&
    fim.getMilliseconds() === 0
  ) {
    fim.setHours(23, 59, 59, 999);
  }
  return fim;

}

/** O que cada cliente comprou em cada ano — ver `comprasPorAno`. */
export interface ClienteComprasPorAno {
  nome: string;
  /** `{ 2025: { pecas, valor } }` — ano sem compra simplesmente falta. */
  porAno: Record<number, { pecas: number; valor: number }>;
  totalPecas: number;
  totalValor: number;
}

export interface PaginaDeComprasPorAno {
  clientes: ClienteComprasPorAno[];
  /** Os anos da JANELA, em ordem — as colunas da tabela. */
  anos: number[];
  /** Quantos clientes compraram na janela, mesmo acima do teto. */
  total: number;
}
