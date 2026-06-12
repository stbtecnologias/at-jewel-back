import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarDefeitoUseCase } from './application/use-cases/atualizar-defeito.use-case';
import { BuscarDefeitoUseCase } from './application/use-cases/buscar-defeito.use-case';
import { CriarDefeitoUseCase } from './application/use-cases/criar-defeito.use-case';
import { KpisDefeitosUseCase } from './application/use-cases/kpis-defeitos.use-case';
import { ListarDefeitosUseCase } from './application/use-cases/listar-defeitos.use-case';
import { RemoverDefeitoUseCase } from './application/use-cases/remover-defeito.use-case';
import { DEFEITO_REPOSITORY } from './domain/ports/injection-tokens';
import { DefeitoOrmEntity } from './infrastructure/database/typeorm/entities/defeito.orm-entity';
import { DefeitoRepository } from './infrastructure/database/typeorm/repositories/defeito.repository';
import { DefeitosController } from './infrastructure/http/controllers/defeitos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DefeitoOrmEntity]), AuthModule],
  controllers: [DefeitosController],
  providers: [
    ListarDefeitosUseCase,
    BuscarDefeitoUseCase,
    CriarDefeitoUseCase,
    AtualizarDefeitoUseCase,
    RemoverDefeitoUseCase,
    KpisDefeitosUseCase,
    { provide: DEFEITO_REPOSITORY, useClass: DefeitoRepository },
  ],
  exports: [DEFEITO_REPOSITORY],
})
export class DefeitosModule {}
