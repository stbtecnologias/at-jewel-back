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

import { VendasModule } from '../vendas/vendas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaOrmEntity]),
    AuthModule,
    // RF do escopo da gerente, 23/10/2026: meta de vendedora que nao e da
    // equipe dela nao aparece. O modulo de vendas exporta o `EscopoVendasService`
    // e nao importa este — sem ciclo.
    VendasModule,
  ],
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
  exports: [META_REPOSITORY, ListarMetasUseCase, ProgressoMetaUseCase],
})
export class MetasModule {}
