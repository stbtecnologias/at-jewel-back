import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BuscarVendaUseCase } from './application/use-cases/buscar-venda.use-case';
import { ComparativoVendedorasUseCase } from './application/use-cases/comparativo-vendedoras.use-case';
import { ListarVendasUseCase } from './application/use-cases/listar-vendas.use-case';
import { RegistrarVendaUseCase } from './application/use-cases/registrar-venda.use-case';
import { ResumoVendasUseCase } from './application/use-cases/resumo-vendas.use-case';
import { SerieMensalVendasUseCase } from './application/use-cases/serie-mensal-vendas.use-case';
import { EscopoVendasService } from './application/escopo-vendas.service';
import { VENDA_REPOSITORY } from './domain/ports/injection-tokens';
import { ItemVendaOrmEntity } from './infrastructure/database/typeorm/entities/item-venda.orm-entity';
import { PagamentoVendaOrmEntity } from './infrastructure/database/typeorm/entities/pagamento-venda.orm-entity';
import { VendaOrmEntity } from './infrastructure/database/typeorm/entities/venda.orm-entity';
import { VENDAS_LEITURA_REPOSITORY } from './domain/ports/repositories/vendas-leitura-repository.port';
import { VendaRepository } from './infrastructure/database/typeorm/repositories/venda.repository';
import { VendasDeMovimentacaoRepository } from './infrastructure/database/typeorm/repositories/vendas-de-movimentacao.repository';
import { VendasController } from './infrastructure/http/controllers/vendas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendaOrmEntity,
      ItemVendaOrmEntity,
      PagamentoVendaOrmEntity,
    ]),
    AuthModule,
  ],
  controllers: [VendasController],
  providers: [
    RegistrarVendaUseCase,
    ListarVendasUseCase,
    BuscarVendaUseCase,
    ResumoVendasUseCase,
    ComparativoVendedorasUseCase,
    SerieMensalVendasUseCase,
    EscopoVendasService,
    { provide: VENDA_REPOSITORY, useClass: VendaRepository },
    // AS QUATRO CONSULTAS DA TELA DE VENDAS, lidas da MOVIMENTACAO desde
    // 25/09/2026. O `VENDA_REPOSITORY` continua inteiro ao lado, servindo a
    // escrita e as outras telas — trocar de volta e mudar esta linha.
    {
      provide: VENDAS_LEITURA_REPOSITORY,
      useClass: VendasDeMovimentacaoRepository,
    },
  ],
  exports: [VENDA_REPOSITORY, ResumoVendasUseCase],
})
export class VendasModule {}
