import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './modules/auth/auth.module';
import { AdminUserOrmEntity } from './modules/auth/infrastructure/database/typeorm/entities/admin-user.orm-entity';
import { ApiKeyOrmEntity } from './modules/auth/infrastructure/database/typeorm/entities/api-key.orm-entity';
import { AgenteEventosModule } from './modules/agente-eventos/agente-eventos.module';
import { AgenteEventoOrmEntity } from './modules/agente-eventos/infrastructure/database/typeorm/entities/agente-evento.orm-entity';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ClienteOrmEntity } from './modules/clientes/infrastructure/database/typeorm/entities/cliente.orm-entity';
import { ClientePerfilOrmEntity } from './modules/clientes/infrastructure/database/typeorm/entities/cliente-perfil.orm-entity';
import { ErpModule } from './modules/erp/erp.module';
import { ErpEventoOrmEntity } from './modules/erp/infrastructure/database/typeorm/entities/erp-evento.orm-entity';
import { ProdutoOrmEntity } from './modules/erp/infrastructure/database/typeorm/entities/produto.orm-entity';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { VendedorasModule } from './modules/vendedoras/vendedoras.module';
import { VendedoraOrmEntity } from './modules/vendedoras/infrastructure/database/typeorm/entities/vendedora.orm-entity';
import { GlobalExceptionFilter } from './shared/http/filters/global-exception.filter';
import { buildLoggerOptions } from './shared/logger/logger.module-options';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Logger estruturado Pino: JSON em prod, pretty em dev. Request ID por
    // requisicao + redacao de PII e secrets. Substitui console.log.
    LoggerModule.forRoot(buildLoggerOptions()),
    // Rate limiting global. Default agressivo o suficiente para conter abuso
    // sem incomodar uso legitimo. Endpoints sensiveis (login, lookup) podem
    // sobrescrever via @Throttle no controller.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000, // 1 minuto
          limit: 100, // 100 req/min por IP
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [
          ProdutoOrmEntity,
          ErpEventoOrmEntity,
          AdminUserOrmEntity,
          ApiKeyOrmEntity,
          ClienteOrmEntity,
          ClientePerfilOrmEntity,
          VendedoraOrmEntity,
          AgenteEventoOrmEntity,
        ],
        synchronize: false,
        logging: config.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    ErpModule,
    ProdutosModule,
    ClientesModule,
    VendedorasModule,
    AgenteEventosModule,
  ],
  controllers: [HealthController],
  providers: [
    // Filtro global de excecoes — shape consistente, sem vazar stack em prod.
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Aplica o ThrottlerGuard a todas as rotas globalmente.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
