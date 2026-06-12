import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DemografiaUseCase } from './application/use-cases/demografia.use-case';
import { DistribuicaoOrigemUseCase } from './application/use-cases/distribuicao-origem.use-case';
import { DistribuicaoPagamentoUseCase } from './application/use-cases/distribuicao-pagamento.use-case';
import { EstatisticasInventarioUseCase } from './application/use-cases/estatisticas-inventario.use-case';
import { ExportarVendasCsvUseCase } from './application/use-cases/exportar-vendas-csv.use-case';
import { GiroEstoqueUseCase } from './application/use-cases/giro-estoque.use-case';
import { ReceitaMensalUseCase } from './application/use-cases/receita-mensal.use-case';
import { TopProdutosUseCase } from './application/use-cases/top-produtos.use-case';
import { ANALYTICS_REPOSITORY } from './domain/ports/injection-tokens';
import { AnalyticsRepository } from './infrastructure/database/typeorm/repositories/analytics.repository';
import { AnalyticsController } from './infrastructure/http/controllers/analytics.controller';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [
    ReceitaMensalUseCase,
    TopProdutosUseCase,
    GiroEstoqueUseCase,
    DistribuicaoPagamentoUseCase,
    EstatisticasInventarioUseCase,
    DistribuicaoOrigemUseCase,
    DemografiaUseCase,
    ExportarVendasCsvUseCase,
    { provide: ANALYTICS_REPOSITORY, useClass: AnalyticsRepository },
  ],
})
export class AnalyticsModule {}
