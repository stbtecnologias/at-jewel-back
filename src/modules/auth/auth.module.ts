import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoginAdminUseCase } from './application/use-cases/login-admin.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { GerarApiKeyUseCase } from './application/use-cases/gerar-api-key.use-case';
import { RevogarApiKeyUseCase } from './application/use-cases/revogar-api-key.use-case';
import { ListarApiKeysUseCase } from './application/use-cases/listar-api-keys.use-case';
import { ValidarApiKeyUseCase } from './application/use-cases/validar-api-key.use-case';
import { ADMIN_USER_REPOSITORY, API_KEY_REPOSITORY } from './domain/ports/injection-tokens';
import { AdminUserOrmEntity } from './infrastructure/database/typeorm/entities/admin-user.orm-entity';
import { ApiKeyOrmEntity } from './infrastructure/database/typeorm/entities/api-key.orm-entity';
import { AdminUserRepository } from './infrastructure/database/typeorm/repositories/admin-user.repository';
import { ApiKeyRepository } from './infrastructure/database/typeorm/repositories/api-key.repository';
import { AuthController } from './infrastructure/http/controllers/auth.controller';
import { ApiKeysController } from './infrastructure/http/controllers/api-keys.controller';
import { JwtStrategy } from './infrastructure/http/strategies/jwt.strategy';
import { ApiKeyGuard } from './infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from './infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/http/guards/roles.guard';
import { ScopesGuard } from './infrastructure/http/guards/scopes.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUserOrmEntity, ApiKeyOrmEntity]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    CacheModule.register({ ttl: 5 * 60 * 1000 }),
  ],
  controllers: [AuthController, ApiKeysController],
  providers: [
    LoginAdminUseCase,
    RefreshTokenUseCase,
    GerarApiKeyUseCase,
    RevogarApiKeyUseCase,
    ListarApiKeysUseCase,
    ValidarApiKeyUseCase,
    JwtStrategy,
    ApiKeyGuard,
    JwtAuthGuard,
    RolesGuard,
    ScopesGuard,
    { provide: ADMIN_USER_REPOSITORY, useClass: AdminUserRepository },
    { provide: API_KEY_REPOSITORY, useClass: ApiKeyRepository },
  ],
  exports: [ApiKeyGuard, JwtAuthGuard, RolesGuard, ScopesGuard, ValidarApiKeyUseCase],
})
export class AuthModule {}
