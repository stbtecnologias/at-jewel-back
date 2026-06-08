import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { VendasModule } from '../vendas/vendas.module';
import { AtualizarPerfilClienteUseCase } from './application/use-cases/atualizar-perfil-cliente.use-case';
import { BuscarClienteUseCase } from './application/use-cases/buscar-cliente.use-case';
import { BuscarClientePorWhatsappUseCase } from './application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { BuscarHistoricoClienteUseCase } from './application/use-cases/buscar-historico-cliente.use-case';
import { CriarClienteUseCase } from './application/use-cases/criar-cliente.use-case';
import { ListarClientesUseCase } from './application/use-cases/listar-clientes.use-case';
import {
  CLIENTE_PERFIL_REPOSITORY,
  CLIENTE_REPOSITORY,
} from './domain/ports/injection-tokens';
import { ClienteOrmEntity } from './infrastructure/database/typeorm/entities/cliente.orm-entity';
import { ClientePerfilOrmEntity } from './infrastructure/database/typeorm/entities/cliente-perfil.orm-entity';
import { ClienteRepository } from './infrastructure/database/typeorm/repositories/cliente.repository';
import { ClientePerfilRepository } from './infrastructure/database/typeorm/repositories/cliente-perfil.repository';
import { ClientesController } from './infrastructure/http/controllers/clientes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClienteOrmEntity, ClientePerfilOrmEntity]),
    AuthModule,
    // Expoe VENDA_REPOSITORY para o historico de compras do cliente.
    VendasModule,
  ],
  controllers: [ClientesController],
  providers: [
    CriarClienteUseCase,
    BuscarClienteUseCase,
    BuscarClientePorWhatsappUseCase,
    ListarClientesUseCase,
    AtualizarPerfilClienteUseCase,
    BuscarHistoricoClienteUseCase,
    { provide: CLIENTE_REPOSITORY, useClass: ClienteRepository },
    { provide: CLIENTE_PERFIL_REPOSITORY, useClass: ClientePerfilRepository },
  ],
  exports: [CLIENTE_REPOSITORY],
})
export class ClientesModule {}
