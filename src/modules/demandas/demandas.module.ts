import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarDemandaUseCase } from './application/use-cases/atualizar-demanda.use-case';
import { BuscarDemandaUseCase } from './application/use-cases/buscar-demanda.use-case';
import { CriarDemandaUseCase } from './application/use-cases/criar-demanda.use-case';
import { KpisDemandasUseCase } from './application/use-cases/kpis-demandas.use-case';
import { ListarDemandasUseCase } from './application/use-cases/listar-demandas.use-case';
import { DEMANDA_REPOSITORY } from './domain/ports/injection-tokens';
import { DemandaOrmEntity } from './infrastructure/database/typeorm/entities/demanda.orm-entity';
import { DemandaRepository } from './infrastructure/database/typeorm/repositories/demanda.repository';
import { DemandasController } from './infrastructure/http/controllers/demandas.controller';

// AuthModule e OBRIGATORIO: o controller usa PermissionsGuard, cuja
// resolucao de DI so falha no boot (nest build/jest nao pegam).
// CriarDemandaUseCase e DEMANDA_REPOSITORY sao exportados para o
// modulo de agentes reusar (tool registrar_demanda da Anastasia).
@Module({
  imports: [TypeOrmModule.forFeature([DemandaOrmEntity]), AuthModule],
  controllers: [DemandasController],
  providers: [
    ListarDemandasUseCase,
    KpisDemandasUseCase,
    BuscarDemandaUseCase,
    CriarDemandaUseCase,
    AtualizarDemandaUseCase,
    { provide: DEMANDA_REPOSITORY, useClass: DemandaRepository },
  ],
  exports: [CriarDemandaUseCase, DEMANDA_REPOSITORY],
})
export class DemandasModule {}
