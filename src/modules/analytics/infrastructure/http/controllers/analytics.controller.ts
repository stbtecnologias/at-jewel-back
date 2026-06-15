import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { ComportamentoDatasUseCase } from '../../../application/use-cases/comportamento-datas.use-case';
import { DemografiaUseCase } from '../../../application/use-cases/demografia.use-case';
import { DistribuicaoOrigemUseCase } from '../../../application/use-cases/distribuicao-origem.use-case';
import { DistribuicaoPagamentoUseCase } from '../../../application/use-cases/distribuicao-pagamento.use-case';
import { EstatisticasInventarioUseCase } from '../../../application/use-cases/estatisticas-inventario.use-case';
import { ExportarVendasCsvUseCase } from '../../../application/use-cases/exportar-vendas-csv.use-case';
import { GiroEstoqueUseCase } from '../../../application/use-cases/giro-estoque.use-case';
import { ReceitaMensalUseCase } from '../../../application/use-cases/receita-mensal.use-case';
import { TopProdutosUseCase } from '../../../application/use-cases/top-produtos.use-case';

// Dashboards e KPIs gerenciais — restrito a staff (ADMIN/GERENTE) via JWT.
// Somente leitura/agregacao.
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'GERENTE')
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
  ) {}

  @Get('receita-mensal')
  async receita(@Query('meses') meses?: string) {
    return this.receitaMensal.execute(meses ? Number(meses) : undefined);
  }

  @Get('top-produtos')
  async top(@Query('limit') limit?: string) {
    return this.topProdutos.execute(limit ? Number(limit) : undefined);
  }

  @Get('giro-estoque')
  async giro() {
    return this.giroEstoque.execute();
  }

  @Get('distribuicao-pagamento')
  async pagamento() {
    return this.distribuicaoPagamento.execute();
  }

  @Get('inventario')
  async inventario() {
    return this.estatisticasInventario.execute();
  }

  @Get('origem')
  async origem() {
    return this.distribuicaoOrigem.execute();
  }

  @Get('demografia')
  async demo() {
    return this.demografia.execute();
  }

  // Comportamento de compra em torno de datas comemorativas (janela de 15 dias).
  @Get('datas-comemorativas')
  async datas(@Query('ano') ano?: string) {
    const anoNum = Number(ano);
    const alvo = Number.isInteger(anoNum) && anoNum > 2000 ? anoNum : new Date().getFullYear();
    return this.comportamentoDatas.execute(alvo);
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
