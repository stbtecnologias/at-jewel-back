import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarGrupoEstoqueUseCase } from './application/use-cases/atualizar-grupo-estoque.use-case';
import { BuscarGrupoEstoqueUseCase } from './application/use-cases/buscar-grupo-estoque.use-case';
import { CriarGrupoEstoqueUseCase } from './application/use-cases/criar-grupo-estoque.use-case';
import { ListarGruposEstoqueUseCase } from './application/use-cases/listar-grupos-estoque.use-case';
import { RemoverGrupoEstoqueUseCase } from './application/use-cases/remover-grupo-estoque.use-case';
import { GRUPO_ESTOQUE_REPOSITORY } from './domain/ports/injection-tokens';
import { GrupoEstoqueOrmEntity } from './infrastructure/database/typeorm/entities/grupo-estoque.orm-entity';
import { GrupoEstoqueRepository } from './infrastructure/database/typeorm/repositories/grupo-estoque.repository';
import { GruposEstoqueController } from './infrastructure/http/controllers/grupos-estoque.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([GrupoEstoqueOrmEntity]), AuthModule],
  controllers: [GruposEstoqueController],
  providers: [
    CriarGrupoEstoqueUseCase,
    BuscarGrupoEstoqueUseCase,
    ListarGruposEstoqueUseCase,
    AtualizarGrupoEstoqueUseCase,
    RemoverGrupoEstoqueUseCase,
    { provide: GRUPO_ESTOQUE_REPOSITORY, useClass: GrupoEstoqueRepository },
  ],
  // Exportado para a sincronizacao de estoque resolver o cadastro pelo codigo
  // do ERP antes de gravar o saldo.
  exports: [GRUPO_ESTOQUE_REPOSITORY],
})
export class GruposEstoqueModule {}
