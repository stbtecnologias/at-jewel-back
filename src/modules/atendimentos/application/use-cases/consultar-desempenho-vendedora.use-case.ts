import { Injectable } from '@nestjs/common';
import { ListarMetasUseCase } from '../../../metas/application/use-cases/listar-metas.use-case';
import { ProgressoMetaUseCase } from '../../../metas/application/use-cases/progresso-meta.use-case';
import { ResumoVendasUseCase } from '../../../vendas/application/use-cases/resumo-vendas.use-case';

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
    private readonly resumoVendas: ResumoVendasUseCase,
    private readonly listarMetas: ListarMetasUseCase,
    private readonly progresso: ProgressoMetaUseCase,
  ) {}

  async vendas(
    vendedoraId: string,
    periodo: PeriodoVendas,
    agora: Date = new Date(),
  ): Promise<VendasDoPeriodo> {
    const { de, ate } = janela(periodo, agora);

    const resumo = await this.resumoVendas.execute({
      vendedoraId,
      dataDe: de,
      dataAte: ate,
    });

    return {
      quantidade: resumo.totalVendas,
      receita: resumo.receitaTotal,
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

/**
 * A janela de cada periodo, no fuso do servidor.
 *
 * Diferente da agenda, aqui HOJE comeca a MEIA-NOITE: "quantas vendas eu fiz
 * hoje" e uma pergunta sobre o que ja aconteceu, nao sobre o que vem.
 * SEMANA e MES sao os ultimos 7 e 30 dias corridos — nao a semana do calendario
 * nem o mes fechado —, porque e o que responde "como eu venho indo".
 */
function janela(periodo: PeriodoVendas, agora: Date): { de: Date; ate: Date } {
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  if (periodo === 'HOJE') return { de: inicioDoDia, ate: agora };

  const dias = periodo === 'SEMANA' ? 7 : 30;
  const de = new Date(inicioDoDia);
  de.setDate(de.getDate() - (dias - 1));
  return { de, ate: agora };
}
