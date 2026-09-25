import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClientesModule } from '../clientes/clientes.module';
import { EmpresasModule } from '../empresas/empresas.module';
import { FormasPagamentoModule } from '../formas-pagamento/formas-pagamento.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { GruposEstoqueModule } from '../grupos-estoque/grupos-estoque.module';
import { LocaisEstoqueModule } from '../locais-estoque/locais-estoque.module';
import { OperacoesModule } from '../operacoes/operacoes.module';
import { ProdutosModule } from '../produtos/produtos.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { ResolverReferenciasErpService } from './application/resolver-referencias-erp.service';
import { ConsultarVendasUseCase } from './application/use-cases/consultar-vendas.use-case';
import { BuscarMovimentacaoPorIdErpUseCase } from './application/use-cases/buscar-movimentacao-por-id-erp.use-case';
import { BuscarMovimentacaoUseCase } from './application/use-cases/buscar-movimentacao.use-case';
import { ListarMovimentacoesUseCase } from './application/use-cases/listar-movimentacoes.use-case';
import { RemoverMovimentacaoUseCase } from './application/use-cases/remover-movimentacao.use-case';
import { SincronizarMovimentacaoUseCase } from './application/use-cases/sincronizar-movimentacao.use-case';
import { MOVIMENTACAO_REPOSITORY } from './domain/ports/injection-tokens';
import { VENDAS_MOVIMENTACAO_REPOSITORY } from './domain/ports/repositories/vendas-movimentacao-repository.port';
import { VendasMovimentacaoRepository } from './infrastructure/database/typeorm/repositories/vendas-movimentacao.repository';
import { MovimentacaoItemOrmEntity } from './infrastructure/database/typeorm/entities/movimentacao-item.orm-entity';
import { MovimentacaoPagamentoOrmEntity } from './infrastructure/database/typeorm/entities/movimentacao-pagamento.orm-entity';
import { MovimentacaoOrmEntity } from './infrastructure/database/typeorm/entities/movimentacao.orm-entity';
import { MovimentacaoRepository } from './infrastructure/database/typeorm/repositories/movimentacao.repository';
import { MovimentacoesController } from './infrastructure/http/controllers/movimentacoes.controller';

/**
 * SETE modulos importados, e cada um por um motivo so: o `id_erp` de um
 * cadastro que a movimentacao referencia.
 *
 * Parece muito, e e — mas e o preco de resolver as FKs na ingestao em vez de
 * deixar a movimentacao virar um amontoado de numeros do ERP. O
 * `RegistrarVendaViaErpUseCase` ja faz o mesmo com tres.
 *
 * SEM CICLO: nenhum destes importa `MovimentacoesModule`. As dependencias vao
 * todas na direcao dos cadastros, que sao folhas — e a projecao para `vendas`,
 * quando existir, vai ler DAQUI, nunca o contrario.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MovimentacaoOrmEntity,
      MovimentacaoItemOrmEntity,
      MovimentacaoPagamentoOrmEntity,
    ]),
    // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
    // depende — sem esse import o guard nao resolve no contexto deste modulo.
    AuthModule,
    OperacoesModule,
    EmpresasModule,
    GruposEstoqueModule,
    // A ponta da movimentacao passou a aceitar local de estoque em 24/09/2026.
    LocaisEstoqueModule,
    ClientesModule,
    VendedorasModule,
    ProdutosModule,
    FormasPagamentoModule,
    // A ponta da movimentacao pode ser fornecedor (idEntidade*, 16/09/2026).
    FornecedoresModule,
  ],
  controllers: [MovimentacoesController],
  providers: [
    ResolverReferenciasErpService,
    ConsultarVendasUseCase,
    {
      provide: VENDAS_MOVIMENTACAO_REPOSITORY,
      useClass: VendasMovimentacaoRepository,
    },
    SincronizarMovimentacaoUseCase,
    BuscarMovimentacaoUseCase,
    BuscarMovimentacaoPorIdErpUseCase,
    ListarMovimentacoesUseCase,
    RemoverMovimentacaoUseCase,
    { provide: MOVIMENTACAO_REPOSITORY, useClass: MovimentacaoRepository },
  ],
  // A VENDA LIDA DA MOVIMENTACAO — 25/09/2026. Quem consulta venda passa a
  // vir aqui, e nao a tabela `vendas`. Ver a porta para a decisao.
  exports: [MOVIMENTACAO_REPOSITORY, ConsultarVendasUseCase],
})
export class MovimentacoesModule {}
