import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtualizarVendedoraUseCase } from './application/use-cases/atualizar-vendedora.use-case';
import { BuscarVendedoraUseCase } from './application/use-cases/buscar-vendedora.use-case';
import { CriarVendedoraUseCase } from './application/use-cases/criar-vendedora.use-case';
import { ListarVendedorasUseCase } from './application/use-cases/listar-vendedoras.use-case';
import { VENDEDORA_REPOSITORY } from './domain/ports/injection-tokens';
import { VendedoraOrmEntity } from './infrastructure/database/typeorm/entities/vendedora.orm-entity';
import { VendedoraRepository } from './infrastructure/database/typeorm/repositories/vendedora.repository';
import { VendedorasController } from './infrastructure/http/controllers/vendedoras.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VendedoraOrmEntity])],
  controllers: [VendedorasController],
  providers: [
    CriarVendedoraUseCase,
    BuscarVendedoraUseCase,
    ListarVendedorasUseCase,
    AtualizarVendedoraUseCase,
    { provide: VENDEDORA_REPOSITORY, useClass: VendedoraRepository },
  ],
  exports: [VENDEDORA_REPOSITORY],
})
export class VendedorasModule {}
