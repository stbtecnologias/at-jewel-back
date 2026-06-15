import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AlertasEstoqueUseCase } from './application/use-cases/alertas-estoque.use-case';
import { AtualizarProdutoUseCase } from './application/use-cases/atualizar-produto.use-case';
import { BuscarProdutoUseCase } from './application/use-cases/buscar-produto.use-case';
import { CriarProdutoUseCase } from './application/use-cases/criar-produto.use-case';
import { CriarProdutosLoteUseCase } from './application/use-cases/criar-produtos-lote.use-case';
import { FacetasProdutosUseCase } from './application/use-cases/facetas-produtos.use-case';
import { ListarProdutosUseCase } from './application/use-cases/listar-produtos.use-case';
import { RemoverProdutoUseCase } from './application/use-cases/remover-produto.use-case';
import { PRODUTO_REPOSITORY } from '../erp/domain/ports/injection-tokens';
import { ProdutoOrmEntity } from '../erp/infrastructure/database/typeorm/entities/produto.orm-entity';
import { ProdutoRepository } from '../erp/infrastructure/database/typeorm/repositories/produto.repository';
import { ProdutosController } from './infrastructure/http/controllers/produtos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProdutoOrmEntity]), AuthModule],
  controllers: [ProdutosController],
  providers: [
    ListarProdutosUseCase,
    BuscarProdutoUseCase,
    CriarProdutoUseCase,
    CriarProdutosLoteUseCase,
    AtualizarProdutoUseCase,
    RemoverProdutoUseCase,
    FacetasProdutosUseCase,
    AlertasEstoqueUseCase,
    { provide: PRODUTO_REPOSITORY, useClass: ProdutoRepository },
  ],
})
export class ProdutosModule {}
