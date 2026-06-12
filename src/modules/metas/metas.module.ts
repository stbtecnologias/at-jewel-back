import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarMetaUseCase } from './application/use-cases/atualizar-meta.use-case';
import { BuscarMetaUseCase } from './application/use-cases/buscar-meta.use-case';
import { CriarMetaUseCase } from './application/use-cases/criar-meta.use-case';
import { ListarMetasUseCase } from './application/use-cases/listar-metas.use-case';
import { ProgressoMetaUseCase } from './application/use-cases/progresso-meta.use-case';
import { RemoverMetaUseCase } from './application/use-cases/remover-meta.use-case';
import { META_REPOSITORY } from './domain/ports/injection-tokens';
import { MetaOrmEntity } from './infrastructure/database/typeorm/entities/meta.orm-entity';
import { MetaRepository } from './infrastructure/database/typeorm/repositories/meta.repository';
import { MetasController } from './infrastructure/http/controllers/metas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MetaOrmEntity]), AuthModule],
  controllers: [MetasController],
  providers: [
    ListarMetasUseCase,
    BuscarMetaUseCase,
    CriarMetaUseCase,
    AtualizarMetaUseCase,
    RemoverMetaUseCase,
    ProgressoMetaUseCase,
    { provide: META_REPOSITORY, useClass: MetaRepository },
  ],
  exports: [META_REPOSITORY],
})
export class MetasModule {}
