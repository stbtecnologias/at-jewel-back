import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ComportamentoDatasUseCase } from '../../../application/use-cases/comportamento-datas.use-case';
import { DemografiaUseCase } from '../../../application/use-cases/demografia.use-case';
import { DistribuicaoOrigemUseCase } from '../../../application/use-cases/distribuicao-origem.use-case';
import { DistribuicaoPagamentoUseCase } from '../../../application/use-cases/distribuicao-pagamento.use-case';
import { EstatisticasInventarioUseCase } from '../../../application/use-cases/estatisticas-inventario.use-case';
import { ExportarVendasCsvUseCase } from '../../../application/use-cases/exportar-vendas-csv.use-case';
import { GiroEstoqueUseCase } from '../../../application/use-cases/giro-estoque.use-case';
import { ReceitaMensalUseCase } from '../../../application/use-cases/receita-mensal.use-case';
import { ResumoPeriodoUseCase } from '../../../application/use-cases/resumo-periodo.use-case';
import { TopProdutosUseCase } from '../../../application/use-cases/top-produtos.use-case';
import type { FiltroAnalitico } from '../../../domain/ports/repositories/analytics-repository.port';

// Converte as query strings do filtro comum das telas de Analytics num
// FiltroAnalitico. Retorna undefined quando TUDO esta vazio. Periodo so vale
// quando AMBAS as datas vem e sao validas; os recortes demograficos
// (sexo/origem/faixa) entram individualmente quando presentes.
function parseFiltro(
  de?: string,
  ate?: string,
  sexo?: string,
  origem?: string,
  faixa?: string,
  idadeMin?: string,
  idadeMax?: string,
): FiltroAnalitico | undefined {
  const filtro: FiltroAnalitico = {};
  if (de && ate) {
    const dataInicio = new Date(de);
    const dataFim = new Date(ate);
    if (!Number.isNaN(dataInicio.getTime()) && !Number.isNaN(dataFim.getTime())) {
      filtro.dataInicio = dataInicio;
      filtro.dataFim = dataFim;
    }
  }
  if (sexo) filtro.sexo = sexo;
  if (origem) filtro.origem = origem;
  if (faixa) filtro.faixaEtaria = faixa;
  if (idadeMin) {
    const min = Number(idadeMin);
    if (Number.isInteger(min) && min >= 0) filtro.idadeMin = min;
  }
  if (idadeMax) {
    const max = Number(idadeMax);
    if (Number.isInteger(max) && max >= 0) filtro.idadeMax = max;
  }
  return Object.keys(filtro).length > 0 ? filtro : undefined;
}

// Dashboards e KPIs gerenciais — exige analytics:read (RF-USU-01). Somente
// leitura/agregacao; todos os endpoints sao GET, dai a permissao no class-level.
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('analytics:read')
export class AnalyticsController {
  constructor(
    private readonly receitaMensal: ReceitaMensalUseCase,
    private readonly topProdutos: TopProdutosUseCase,
    private readonly giroEstoque: GiroEstoqueUseCase,
    private readonly distribuicaoPagamento: DistribuicaoPagamentoUseCase,
    private readonly estatisticasInventario: EstatisticasInventarioUseCase,
    private readonly distribuicaoOrigem: DistribuicaoOrigemUseCase,
    private readonly demografia: DemografiaUseCase,
    private readonly comportamentoDatas: ComportamentoDatasUseCase,
    private readonly exportarVendasCsv: ExportarVendasCsvUseCase,
    private readonly resumoPeriodo: ResumoPeriodoUseCase,
  ) {}

  // Resumo (receita/vendas/ticket) do recorte temporal selecionado (RF-ANL-01).
  @Get('resumo')
  async resumo(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    return this.resumoPeriodo.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('receita-mensal')
  async receita(@Query('meses') meses?: string) {
    return this.receitaMensal.execute(meses ? Number(meses) : undefined);
  }

  @Get('top-produtos')
  async top(
    @Query('limit') limit?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    return this.topProdutos.execute(
      limit ? Number(limit) : undefined,
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('giro-estoque')
  async giro(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    return this.giroEstoque.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('distribuicao-pagamento')
  async pagamento(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    return this.distribuicaoPagamento.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('inventario')
  async inventario() {
    return this.estatisticasInventario.execute();
  }

  @Get('origem')
  async origem(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    return this.distribuicaoOrigem.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('demografia')
  async demo(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    return this.demografia.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  // Comportamento de compra em torno de datas comemorativas (janela de 15 dias).
  // O periodo vem das janelas; data_inicio/data_fim NAO se aplicam aqui, mas
  // os recortes demograficos (sexo/origem/faixa) sim.
  @Get('datas-comemorativas')
  async datas(
    @Query('ano') ano?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    const anoNum = Number(ano);
    const alvo = Number.isInteger(anoNum) && anoNum > 2000 ? anoNum : new Date().getFullYear();
    return this.comportamentoDatas.execute(
      alvo,
      parseFiltro(undefined, undefined, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('vendas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="vendas.csv"')
  async exportar(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ): Promise<string> {
    return this.exportarVendasCsv.execute(
      dataInicio ? new Date(dataInicio) : undefined,
      dataFim ? new Date(dataFim) : undefined,
    );
  }
}
