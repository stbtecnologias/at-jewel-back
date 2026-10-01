import { Inject, Injectable } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type {
  ClienteDaCarteira,
  ClienteDaEpoca,
  IClienteRepository,
} from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import {
  janelasDaDataComemorativa,
  janelasDoMes,
  anosRecentes,
  type NomeComemorativo,
} from '../../../../shared/tempo/datas-comemorativas';

/** Teto de resultados. Lista longa nao ajuda numa conversa de WhatsApp. */
/**
 * Quantos clientes cabem numa resposta.
 *
 * DEZ, e o numero e a coisa toda. Carteira de mil clientes nao cabe em
 * mensagem de WhatsApp, e listar tudo nao ajuda ninguem — vira parede de
 * texto que ninguem le. Dez da uma amostra util e deixa espaco para a
 * pergunta seguinte: "procurando alguem especifico?".
 *
 * O teto SO funciona acompanhado do total. Ver `contarInativosDaCarteira`.
 */
const MAXIMO = 10;

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
  ): Promise<PaginaDaCarteira> {
    if (!vendedoraCodigoErp) return { clientes: [], total: 0 };

    const [clientes, total] = await Promise.all([
      this.clientes.inativosDaCarteira(vendedoraCodigoErp, desde, MAXIMO),
      this.clientes.contarInativosDaCarteira(vendedoraCodigoErp, desde),
    ]);
    return { clientes, total };
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
  ): Promise<PaginaDaEpoca> {
    if (!vendedoraCodigoErp) return { clientes: [], total: 0 };

    const janelas = janelasDoRecorte(recorte);

    return this.clientes.compradoresPorEpoca(
      { tipo: 'CARTEIRA', vendedoraCodigoErp },
      janelas,
      MAXIMO,
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
  async porEpocaDaLoja(recorte: {
    mes?: number;
    dataComemorativa?: NomeComemorativo;
  }): Promise<PaginaDaEpoca> {
    const janelas = janelasDoRecorte(recorte);
    return this.clientes.compradoresPorEpoca({ tipo: 'LOJA' }, janelas, MAXIMO);
  }

  /**
   * Quem mais comprou. Com `categoria` a conta e de ITENS daquele tipo
   * ("quem comprou mais aneis"); sem ela, de COMPRAS ("quem mais compra de
   * mim"). Sao perguntas diferentes e a unidade muda junto.
   */
  async maioresCompradores(
    vendedoraCodigoErp: string | null,
    opcoes: { categoria?: string; ultimosMeses?: number },
  ): Promise<PaginaDaCarteira> {
    if (!vendedoraCodigoErp) return { clientes: [], total: 0 };

    let desde: Date | undefined;
    if (opcoes.ultimosMeses && opcoes.ultimosMeses > 0) {
      desde = new Date();
      desde.setMonth(desde.getMonth() - opcoes.ultimosMeses);
    }

    const [clientes, total] = await Promise.all([
      this.clientes.maioresCompradoresDaCarteira(vendedoraCodigoErp, {
        categoria: opcoes.categoria,
        desde,
        limite: MAXIMO,
      }),
      this.clientes.contarCompradoresDaCarteira(vendedoraCodigoErp, {
        categoria: opcoes.categoria,
        desde,
      }),
    ]);
    return { clientes, total };
  }
}
