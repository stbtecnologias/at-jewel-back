import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ComportamentoDatasUseCase } from './application/use-cases/comportamento-datas.use-case';
import { DemografiaUseCase } from './application/use-cases/demografia.use-case';
import { EmpresasDoFiltroUseCase } from './application/use-cases/empresas-do-filtro.use-case';
import { DistribuicaoOrigemUseCase } from './application/use-cases/distribuicao-origem.use-case';
import { DistribuicaoPagamentoUseCase } from './application/use-cases/distribuicao-pagamento.use-case';
import { EstatisticasInventarioUseCase } from './application/use-cases/estatisticas-inventario.use-case';
import { ExportarVendasCsvUseCase } from './application/use-cases/exportar-vendas-csv.use-case';
import { GiroEstoqueUseCase } from './application/use-cases/giro-estoque.use-case';
import { GiroFamiliasUseCase } from './application/use-cases/giro-familias.use-case';
import { ReceitaMensalUseCase } from './application/use-cases/receita-mensal.use-case';
import { ResumoPeriodoUseCase } from './application/use-cases/resumo-periodo.use-case';
import { TopProdutosUseCase } from './application/use-cases/top-produtos.use-case';
import { ANALYTICS_REPOSITORY } from './domain/ports/injection-tokens';
import { AnalyticsDeMovimentacaoRepository } from './infrastructure/database/typeorm/repositories/analytics-de-movimentacao.repository';
import { AnalyticsRepository } from './infrastructure/database/typeorm/repositories/analytics.repository';
import { AnalyticsController } from './infrastructure/http/controllers/analytics.controller';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [
    ReceitaMensalUseCase,
    TopProdutosUseCase,
    GiroEstoqueUseCase,
    GiroFamiliasUseCase,
    DistribuicaoPagamentoUseCase,
    EstatisticasInventarioUseCase,
    DistribuicaoOrigemUseCase,
    EmpresasDoFiltroUseCase,
    DemografiaUseCase,
    ComportamentoDatasUseCase,
    ExportarVendasCsvUseCase,
    ResumoPeriodoUseCase,
    // A LEITURA VEM DA MOVIMENTACAO DESDE 01/10/2026.
    //
    // `vendas`, `itens_venda` e `pagamentos_venda` tem ZERO linhas — nada as
    // escreve, porque o ERP manda movimentacao. A tela mostrava 0 em tudo com
    // 1.388 documentos e tres anos de historico no banco.
    //
    // O ANTIGO FICA REGISTRADO porque o novo delega a ele as cinco leituras que
    // nao vem da venda (inventario, origem, demografia e os dois giros). E
    // voltar atras e trocar o `useClass` desta linha.
    AnalyticsRepository,
    { provide: ANALYTICS_REPOSITORY, useClass: AnalyticsDeMovimentacaoRepository },
  ],
})
export class AnalyticsModule {}
