import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CatalogosModule } from '../catalogos/catalogos.module';
import { AlertasEstoqueUseCase } from './application/use-cases/alertas-estoque.use-case';
import { SaldoDoProdutoUseCase } from './application/use-cases/saldo-do-produto.use-case';
import { AtualizarProdutoUseCase } from './application/use-cases/atualizar-produto.use-case';
import { BuscarProdutoUseCase } from './application/use-cases/buscar-produto.use-case';
import { BuscarProdutoPorIdErpUseCase } from './application/use-cases/buscar-produto-por-id-erp.use-case';
import { CriarProdutoUseCase } from './application/use-cases/criar-produto.use-case';
import { CriarProdutosLoteUseCase } from './application/use-cases/criar-produtos-lote.use-case';
import { FacetasProdutosUseCase } from './application/use-cases/facetas-produtos.use-case';
import { ListarProdutosUseCase } from './application/use-cases/listar-produtos.use-case';
import { RemoverProdutoUseCase } from './application/use-cases/remover-produto.use-case';
import {
  PRODUTO_FOTO_REPOSITORY,
  PRODUTO_REPOSITORY,
} from '../erp/domain/ports/injection-tokens';
import { ProdutoOrmEntity } from '../erp/infrastructure/database/typeorm/entities/produto.orm-entity';
import { ProdutoFotoOrmEntity } from '../erp/infrastructure/database/typeorm/entities/produto-foto.orm-entity';
import { ProdutoRepository } from '../erp/infrastructure/database/typeorm/repositories/produto.repository';
import { ProdutoFotoRepository } from '../erp/infrastructure/database/typeorm/repositories/produto-foto.repository';
import { FotosDaPecaUseCase } from './application/use-cases/fotos-da-peca.use-case';
import { EscopoProdutosService } from './application/escopo-produtos.service';
import { FotoProdutoUseCase } from './application/use-cases/foto-produto.use-case';
import { FotoErpService } from './infrastructure/foto-erp/foto-erp.service';
import { FotoErpController } from './infrastructure/http/controllers/foto-erp.controller';
import { ProdutosController } from './infrastructure/http/controllers/produtos.controller';

@Module({
  // CatalogosModule entra pelo ARMAZENAMENTO, que ele exporta. A porta e a
  // mesma para foto de catalogo e foto de produto — o que muda e a pasta — e
  // duplicar o provider aqui criaria um segundo cliente de S3 e uma segunda
  // decisao de disco-ou-bucket para manter em sincronia.
  imports: [
    TypeOrmModule.forFeature([ProdutoOrmEntity, ProdutoFotoOrmEntity]),
    AuthModule,
    CatalogosModule,
  ],
  controllers: [ProdutosController, FotoErpController],
  providers: [
    ListarProdutosUseCase,
    BuscarProdutoUseCase,
    BuscarProdutoPorIdErpUseCase,
    CriarProdutoUseCase,
    CriarProdutosLoteUseCase,
    AtualizarProdutoUseCase,
    RemoverProdutoUseCase,
    FacetasProdutosUseCase,
    AlertasEstoqueUseCase,
    SaldoDoProdutoUseCase,
    FotoProdutoUseCase,
    // RF33 — a peca com varias fotos. Convive com o `FotoProdutoUseCase`, que
    // cuida da foto unica de `produtos.foto_arquivo_id` (0 linhas em 20/10) e
    // segue atendendo o painel antigo ate a modal nova substitui-lo.
    FotosDaPecaUseCase,
    FotoErpService,
    // Decide QUE CAMPOS da peca saem pela API, por permissao — o irmao de
    // `EscopoVendasService` e `EscopoClientesService`. Ver `Produto.toPublic`.
    EscopoProdutosService,
    { provide: PRODUTO_REPOSITORY, useClass: ProdutoRepository },
    { provide: PRODUTO_FOTO_REPOSITORY, useClass: ProdutoFotoRepository },
  ],
  // O canal interno de WhatsApp consulta catalogo pela vendedora.
  // O REPOSITORIO tambem sai: a foto que chega pelo WhatsApp traz o codigo da
  // peca, e o descritivo e preenchido por busca EXATA nele. A busca textual do
  // ListarProdutos serve para gente, nao para casar uma chave — e aqui errar a
  // peca significa publicar o preco de outra.
  // `FotosDaPecaUseCase` sai porque o canal do WhatsApp tambem guarda foto na
  // peca — e o mesmo caminho do painel, com `origem` diferente.
  exports: [ListarProdutosUseCase, PRODUTO_REPOSITORY, FotosDaPecaUseCase],
})
export class ProdutosModule {}
