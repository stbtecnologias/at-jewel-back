import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ErpModule } from './modules/erp/erp.module';
import { ErpEventoOrmEntity } from './modules/erp/infrastructure/database/typeorm/entities/erp-evento.orm-entity';
import { ProdutoOrmEntity } from './modules/erp/infrastructure/database/typeorm/entities/produto.orm-entity';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [ProdutoOrmEntity, ErpEventoOrmEntity],
        synchronize: false,
        logging: config.get('NODE_ENV') !== 'production',
      }),
    }),
    ErpModule,
    ProdutosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
