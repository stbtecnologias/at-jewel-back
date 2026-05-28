import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ListarEventosUseCase } from './application/use-cases/listar-eventos.use-case';
import { RegistrarEventoUseCase } from './application/use-cases/registrar-evento.use-case';
import { AGENTE_EVENTO_REPOSITORY } from './domain/ports/injection-tokens';
import { AgenteEventoOrmEntity } from './infrastructure/database/typeorm/entities/agente-evento.orm-entity';
import { AgenteEventoRepository } from './infrastructure/database/typeorm/repositories/agente-evento.repository';
import { AgenteEventosController } from './infrastructure/http/controllers/agente-eventos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AgenteEventoOrmEntity]), AuthModule],
  controllers: [AgenteEventosController],
  providers: [
    RegistrarEventoUseCase,
    ListarEventosUseCase,
    { provide: AGENTE_EVENTO_REPOSITORY, useClass: AgenteEventoRepository },
  ],
  exports: [AGENTE_EVENTO_REPOSITORY, RegistrarEventoUseCase],
})
export class AgenteEventosModule {}
