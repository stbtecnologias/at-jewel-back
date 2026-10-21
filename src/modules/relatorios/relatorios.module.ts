import { Module } from '@nestjs/common';
import { MontarArquivoUseCase } from './application/montar-arquivo.use-case';
import { RelatorioDeProdutosUseCase } from './application/relatorio-de-produtos.use-case';
import { UltimoRelatorioService } from './application/ultimo-relatorio.service';
import { RelatorioDeVendasUseCase } from './application/relatorio-de-vendas.use-case';
import { RelatorioPdfService } from './infrastructure/relatorio-pdf.service';
import { RelatorioXlsxService } from './infrastructure/relatorio-xlsx.service';

/**
 * OS RELATÓRIOS — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * MÓDULO PRÓPRIO DESDE O PRIMEIRO DIA, e não um canto de `analytics`.
 *
 * O pedido do Lucas foi um molde: *"vendas, vendedoras e produtos, podendo
 * ser em PDF ou xls, e o mesmo padrão do relatório, apenas os dados
 * diferentes"*. Isso é um lugar, não um arquivo — se nascesse dentro de um
 * módulo de conteúdo, o segundo conteúdo teria de importar o primeiro só
 * para desenhar igual.
 * ==========================================================================
 *
 * Dentro, a separação que faz o molde valer:
 *
 *   domain/relatorio.ts        o CONTRATO — o que é um relatório
 *   application/*.use-case     o CONTEÚDO — produtos, vendas
 *   infrastructure/*.service   o FORMATO  — pdf, xlsx
 *
 * Conteúdo novo não encosta no formato; formato novo não encosta no conteúdo.
 */
@Module({
  providers: [
    UltimoRelatorioService,
    MontarArquivoUseCase,
    RelatorioDeProdutosUseCase,
    RelatorioDeVendasUseCase,
    RelatorioPdfService,
    RelatorioXlsxService,
  ],
  exports: [
    UltimoRelatorioService,
    MontarArquivoUseCase,
    RelatorioDeProdutosUseCase,
    RelatorioDeVendasUseCase,
    RelatorioPdfService,
    RelatorioXlsxService,
  ],
})
export class RelatoriosModule {}
