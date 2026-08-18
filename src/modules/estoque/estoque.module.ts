import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarEstoqueUseCase } from './application/use-cases/atualizar-estoque.use-case';
import { BuscarEstoqueUseCase } from './application/use-cases/buscar-estoque.use-case';
import { CriarEstoqueUseCase } from './application/use-cases/criar-estoque.use-case';
import { ListarEstoqueUseCase } from './application/use-cases/listar-estoque.use-case';
import { RemoverEstoqueUseCase } from './application/use-cases/remover-estoque.use-case';
import { SincronizarEstoqueUseCase } from './application/use-cases/sincronizar-estoque.use-case';
import { ESTOQUE_REPOSITORY } from './domain/ports/injection-tokens';
import { EstoqueOrmEntity } from './infrastructure/database/typeorm/entities/estoque.orm-entity';
import { EstoqueRepository } from './infrastructure/database/typeorm/repositories/estoque.repository';
import { EstoqueController } from './infrastructure/http/controllers/estoque.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([EstoqueOrmEntity]), AuthModule],
  controllers: [EstoqueController],
  providers: [
    CriarEstoqueUseCase,
    SincronizarEstoqueUseCase,
    BuscarEstoqueUseCase,
    ListarEstoqueUseCase,
    AtualizarEstoqueUseCase,
    RemoverEstoqueUseCase,
    { provide: ESTOQUE_REPOSITORY, useClass: EstoqueRepository },
  ],
  exports: [ESTOQUE_REPOSITORY],
})
export class EstoqueModule {}
