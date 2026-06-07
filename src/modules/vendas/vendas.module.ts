import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BuscarVendaUseCase } from './application/use-cases/buscar-venda.use-case';
import { ListarVendasUseCase } from './application/use-cases/listar-vendas.use-case';
import { RegistrarVendaUseCase } from './application/use-cases/registrar-venda.use-case';
import { VENDA_REPOSITORY } from './domain/ports/injection-tokens';
import { ItemVendaOrmEntity } from './infrastructure/database/typeorm/entities/item-venda.orm-entity';
import { PagamentoVendaOrmEntity } from './infrastructure/database/typeorm/entities/pagamento-venda.orm-entity';
import { VendaOrmEntity } from './infrastructure/database/typeorm/entities/venda.orm-entity';
import { VendaRepository } from './infrastructure/database/typeorm/repositories/venda.repository';
import { VendasController } from './infrastructure/http/controllers/vendas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendaOrmEntity,
      ItemVendaOrmEntity,
      PagamentoVendaOrmEntity,
    ]),
    AuthModule,
  ],
  controllers: [VendasController],
  providers: [
    RegistrarVendaUseCase,
    ListarVendasUseCase,
    BuscarVendaUseCase,
    { provide: VENDA_REPOSITORY, useClass: VendaRepository },
  ],
  exports: [VENDA_REPOSITORY],
})
export class VendasModule {}
