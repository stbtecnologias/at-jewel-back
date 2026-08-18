import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarLocalEstoqueUseCase } from './application/use-cases/atualizar-local-estoque.use-case';
import { BuscarLocalEstoqueUseCase } from './application/use-cases/buscar-local-estoque.use-case';
import { CriarLocalEstoqueUseCase } from './application/use-cases/criar-local-estoque.use-case';
import { ListarLocaisEstoqueUseCase } from './application/use-cases/listar-locais-estoque.use-case';
import { RemoverLocalEstoqueUseCase } from './application/use-cases/remover-local-estoque.use-case';
import { LOCAL_ESTOQUE_REPOSITORY } from './domain/ports/injection-tokens';
import { LocalEstoqueOrmEntity } from './infrastructure/database/typeorm/entities/local-estoque.orm-entity';
import { LocalEstoqueRepository } from './infrastructure/database/typeorm/repositories/local-estoque.repository';
import { LocaisEstoqueController } from './infrastructure/http/controllers/locais-estoque.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([LocalEstoqueOrmEntity]), AuthModule],
  controllers: [LocaisEstoqueController],
  providers: [
    CriarLocalEstoqueUseCase,
    BuscarLocalEstoqueUseCase,
    ListarLocaisEstoqueUseCase,
    AtualizarLocalEstoqueUseCase,
    RemoverLocalEstoqueUseCase,
    { provide: LOCAL_ESTOQUE_REPOSITORY, useClass: LocalEstoqueRepository },
  ],
  // Exportado para a sincronizacao de estoque resolver o cadastro pelo codigo
  // do ERP antes de gravar o saldo.
  exports: [LOCAL_ESTOQUE_REPOSITORY],
})
export class LocaisEstoqueModule {}
