import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesModule } from '../clientes/clientes.module';
import { VendasModule } from '../vendas/vendas.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { AtualizarProdutoViaErpUseCase } from './application/use-cases/atualizar-produto-via-erp.use-case';
import { RegistrarVendaViaErpUseCase } from './application/use-cases/registrar-venda-via-erp.use-case';
import {
  ERP_EVENTO_REPOSITORY,
  PRODUTO_REPOSITORY,
} from './domain/ports/injection-tokens';
import { ErpEventoOrmEntity } from './infrastructure/database/typeorm/entities/erp-evento.orm-entity';
import { ProdutoOrmEntity } from './infrastructure/database/typeorm/entities/produto.orm-entity';
import { ErpEventoRepository } from './infrastructure/database/typeorm/repositories/erp-evento.repository';
import { ProdutoRepository } from './infrastructure/database/typeorm/repositories/produto.repository';
import { ErpController } from './infrastructure/http/controllers/erp.controller';
import { SafiraAuthGuard } from './infrastructure/http/guards/safira-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProdutoOrmEntity, ErpEventoOrmEntity]),
    // VendasModule exporta VENDA_REPOSITORY (inclui o upsert por codigo_erp do
    // agregado). Clientes/Vendedoras exportam seus repositorios para resolver
    // as FKs por codigo_erp sem acessar tabelas de outro dominio por SQL cru.
    VendasModule,
    ClientesModule,
    VendedorasModule,
  ],
  controllers: [ErpController],
  providers: [
    AtualizarProdutoViaErpUseCase,
    RegistrarVendaViaErpUseCase,
    SafiraAuthGuard,
    {
      provide: PRODUTO_REPOSITORY,
      useClass: ProdutoRepository,
    },
    {
      provide: ERP_EVENTO_REPOSITORY,
      useClass: ErpEventoRepository,
    },
  ],
})
export class ErpModule {}
