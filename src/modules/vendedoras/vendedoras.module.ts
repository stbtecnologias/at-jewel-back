import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClientesModule } from '../clientes/clientes.module';
import { VendasModule } from '../vendas/vendas.module';
import { AtualizarVendedoraUseCase } from './application/use-cases/atualizar-vendedora.use-case';
import { BuscarVendedoraUseCase } from './application/use-cases/buscar-vendedora.use-case';
import { BuscarVendedoraMetricasUseCase } from './application/use-cases/buscar-vendedora-metricas.use-case';
import { CriarVendedoraUseCase } from './application/use-cases/criar-vendedora.use-case';
import { ListarVendedorasUseCase } from './application/use-cases/listar-vendedoras.use-case';
import { ListarVendedorasDisponiveisUseCase } from './application/use-cases/listar-vendedoras-disponiveis.use-case';
import { ListarVendedorasMetricasUseCase } from './application/use-cases/listar-vendedoras-metricas.use-case';
import { RefreshVendedorasMetricasUseCase } from './application/use-cases/refresh-vendedoras-metricas.use-case';
import { SugerirVendedorasUseCase } from './application/use-cases/sugerir-vendedoras.use-case';
import {
  VENDEDORA_METRICAS_REPOSITORY,
  VENDEDORA_REPOSITORY,
} from './domain/ports/injection-tokens';
import { VendedoraOrmEntity } from './infrastructure/database/typeorm/entities/vendedora.orm-entity';
import { VendedoraMetricasRepository } from './infrastructure/database/typeorm/repositories/vendedora-metricas.repository';
import { VendedoraRepository } from './infrastructure/database/typeorm/repositories/vendedora.repository';
import { VendedorasController } from './infrastructure/http/controllers/vendedoras.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendedoraOrmEntity]),
    AuthModule,
    VendasModule,
    ClientesModule,
  ],
  controllers: [VendedorasController],
  providers: [
    CriarVendedoraUseCase,
    BuscarVendedoraUseCase,
    ListarVendedorasUseCase,
    ListarVendedorasDisponiveisUseCase,
    AtualizarVendedoraUseCase,
    ListarVendedorasMetricasUseCase,
    BuscarVendedoraMetricasUseCase,
    RefreshVendedorasMetricasUseCase,
    SugerirVendedorasUseCase,
    { provide: VENDEDORA_REPOSITORY, useClass: VendedoraRepository },
    {
      provide: VENDEDORA_METRICAS_REPOSITORY,
      useClass: VendedoraMetricasRepository,
    },
  ],
  exports: [VENDEDORA_REPOSITORY, VENDEDORA_METRICAS_REPOSITORY],
})
export class VendedorasModule {}
