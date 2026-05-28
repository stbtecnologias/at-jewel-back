import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { AdminUserOrmEntity } from './modules/auth/infrastructure/database/typeorm/entities/admin-user.orm-entity';
import { ApiKeyOrmEntity } from './modules/auth/infrastructure/database/typeorm/entities/api-key.orm-entity';
import { ErpModule } from './modules/erp/erp.module';
import { ErpEventoOrmEntity } from './modules/erp/infrastructure/database/typeorm/entities/erp-evento.orm-entity';
import { ProdutoOrmEntity } from './modules/erp/infrastructure/database/typeorm/entities/produto.orm-entity';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
        entities: [ProdutoOrmEntity, ErpEventoOrmEntity, AdminUserOrmEntity, ApiKeyOrmEntity],
        synchronize: false,
        logging: config.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    ErpModule,
    ProdutosModule,
  ],
  controllers: [HealthController],
  providers: [
    // Aplica o ThrottlerGuard a todas as rotas globalmente.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
