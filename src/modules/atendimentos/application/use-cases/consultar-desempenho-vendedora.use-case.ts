import { Injectable } from '@nestjs/common';
import { ListarMetasUseCase } from '../../../metas/application/use-cases/listar-metas.use-case';
import { ProgressoMetaUseCase } from '../../../metas/application/use-cases/progresso-meta.use-case';
import { ConsultarVendasUseCase } from '../../../movimentacoes/application/use-cases/consultar-vendas.use-case';

export type PeriodoVendas = 'HOJE' | 'SEMANA' | 'MES';

export interface VendasDoPeriodo {
  quantidade: number;
  receita: number;
  ticketMedio: number;
}

export interface MetaDaVendedora {
  descricao: string;
  alvo: number;
  realizado: number;
  percentual: number;
  restante: number;
  prazo: Date;
  batida: boolean;
}

/**
 * O que a vendedora consegue ver sobre SI MESMA: as vendas dela no periodo e
 * as metas dela.
 *
 * ESCOPO NO `WHERE`, como na agenda. As vendas saem de um filtro que ja aceita
 * `vendedoraId`, e as metas de `tipo=POR_VENDEDORA` com `referenciaId` igual ao
 * id dela. Nenhum dos dois caminhos aceita "de outra pessoa" — o id vem do
 * telefone resolvido na entrada do canal.
 *
 * VENDAS VEM DA CONSULTA AO VIVO, nao da view materializada
 * `vendedoras_metricas`. A matview e agregada da vida inteira e so muda no
 * refresh — responder "quantas vendas voce fez hoje" com ela seria dar um
 * numero velho com cara de atual. O recorte por periodo exige o dado de agora.
 */
@Injectable()
export class ConsultarDesempenhoVendedoraUseCase {
  constructor(
    private readonly consultarVendas: ConsultarVendasUseCase,
    private readonly listarMetas: ListarMetasUseCase,
    private readonly progresso: ProgressoMetaUseCase,
  ) {}

  /**
   * ==========================================================================
   * A FONTE MUDOU EM 25/09/2026: LE A MOVIMENTACAO, E NAO A TABELA `vendas`.
   *
   * Decisao do Lucas. A tabela `vendas` tem ZERO linhas e as vendas de verdade
   * chegam do ERP como MOVIMENTACAO — 1.287 documentos de VENDA e 101 de
   * DEVOLUCAO na copia de 25/09. Enquanto isto lia `vendas`, a Anastasia
   * respondia "nenhuma venda no periodo" com R$ 66 milhoes no banco. Pior que
   * vazio: parecia resposta, e quem perguntasse concluiria que a equipe nao
   * vendeu.
   *
   * A ASSINATURA NAO MUDOU — por isso as ferramentas, os dois canais e os
   * testes seguem iguais, e a troca acontece num ponto so.
   *
   * O QUE MUDOU NO NUMERO, e e melhoria: a DEVOLUCAO agora abate. Em agosto de
   * 2026 foram R$ 279.680 devolvidos contra R$ 1,21 mi vendidos — 23%. Sem o
   * abatimento o ranking chegava a inverter posicoes.
   *
   * E `MES` passou a ser o mes do CALENDARIO, e nao "ultimos 30 dias": quem
   * pergunta "como esta o mes" compara com a meta do mes.
   * ==========================================================================
   */
  async vendas(
    vendedoraId: string,
    periodo: PeriodoVendas,
    agora: Date = new Date(),
  ): Promise<VendasDoPeriodo> {
    const resumo = await this.consultarVendas.resumo(
      periodo,
      vendedoraId,
      agora,
    );

    return {
      quantidade: resumo.quantidade,
      receita: resumo.receita,
      ticketMedio: resumo.ticketMedio,
    };
  }

  async metas(vendedoraId: string): Promise<MetaDaVendedora[]> {
    const metas = await this.listarMetas.execute({
      tipo: 'POR_VENDEDORA',
      referenciaId: vendedoraId,
    });

    const resultado: MetaDaVendedora[] = [];
    for (const meta of metas) {
      if (!meta.id) continue;
      const p = await this.progresso.execute(meta.id);
      resultado.push({
        descricao: meta.descricao ?? 'meta sem descrição',
        alvo: p.meta.valorAlvo,
        realizado: p.realizado,
        percentual: p.percentual,
        restante: p.restante,
        prazo: meta.prazo,
        batida: p.restante === 0,
      });
    }
    return resultado;
  }
}

/*
 * A janela de cada periodo MUDOU DE CASA em 25/09/2026: vive no
 * `ConsultarVendasUseCase`, junto com a consulta que a usa.
 *
 * O que ficava aqui dizia "SEMANA e MES sao os ultimos 7 e 30 dias corridos —
 * nao a semana do calendario nem o mes fechado". A parte do MES foi revista:
 * quem pergunta "como esta o mes" compara com a meta do mes, e uma janela
 * movel de 30 dias nunca bate com numero nenhum que a gestao acompanha.
 */
