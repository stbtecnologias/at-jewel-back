import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoginAdminUseCase } from './application/use-cases/login-admin.use-case';
import { LoginGoogleUseCase } from './application/use-cases/login-google.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { BuscarPerfilUseCase } from './application/use-cases/buscar-perfil.use-case';
import { AtualizarNomeUseCase } from './application/use-cases/atualizar-nome.use-case';
import { AlterarSenhaUseCase } from './application/use-cases/alterar-senha.use-case';
import { CriarUsuarioUseCase } from './application/use-cases/criar-usuario.use-case';
import { ListarUsuariosUseCase } from './application/use-cases/listar-usuarios.use-case';
import { RemoverUsuarioUseCase } from './application/use-cases/remover-usuario.use-case';
import { GerarApiKeyUseCase } from './application/use-cases/gerar-api-key.use-case';
import { RevogarApiKeyUseCase } from './application/use-cases/revogar-api-key.use-case';
import { ListarApiKeysUseCase } from './application/use-cases/listar-api-keys.use-case';
import { ValidarApiKeyUseCase } from './application/use-cases/validar-api-key.use-case';
import { ListarRolesUseCase } from './application/use-cases/listar-roles.use-case';
import { CriarRoleUseCase } from './application/use-cases/criar-role.use-case';
import { AtualizarRoleUseCase } from './application/use-cases/atualizar-role.use-case';
import { RemoverRoleUseCase } from './application/use-cases/remover-role.use-case';
import { PermissionsService } from './application/permissions.service';
import {
  ADMIN_USER_REPOSITORY,
  API_KEY_REPOSITORY,
  GOOGLE_TOKEN_VERIFIER,
  ROLE_REPOSITORY,
} from './domain/ports/injection-tokens';
import { GoogleTokenVerifier } from './infrastructure/google/google-token-verifier';
import { AdminUserOrmEntity } from './infrastructure/database/typeorm/entities/admin-user.orm-entity';
import { ApiKeyOrmEntity } from './infrastructure/database/typeorm/entities/api-key.orm-entity';
import { RoleOrmEntity } from './infrastructure/database/typeorm/entities/role.orm-entity';
import { RolePermissionOrmEntity } from './infrastructure/database/typeorm/entities/role-permission.orm-entity';
import { AdminUserRepository } from './infrastructure/database/typeorm/repositories/admin-user.repository';
import { ApiKeyRepository } from './infrastructure/database/typeorm/repositories/api-key.repository';
import { RoleRepository } from './infrastructure/database/typeorm/repositories/role.repository';
import { AuthController } from './infrastructure/http/controllers/auth.controller';
import { ApiKeysController } from './infrastructure/http/controllers/api-keys.controller';
import { UsuariosController } from './infrastructure/http/controllers/usuarios.controller';
import { RolesController } from './infrastructure/http/controllers/roles.controller';
import { JwtStrategy } from './infrastructure/http/strategies/jwt.strategy';
import { ApiKeyGuard } from './infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from './infrastructure/http/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from './infrastructure/http/guards/jwt-or-api-key.guard';
import { RolesGuard } from './infrastructure/http/guards/roles.guard';
import { PermissionsGuard } from './infrastructure/http/guards/permissions.guard';
import { ScopesGuard } from './infrastructure/http/guards/scopes.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminUserOrmEntity,
      ApiKeyOrmEntity,
      RoleOrmEntity,
      RolePermissionOrmEntity,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // TTL do access token, configuravel por env. Default 8h (sessao de
        // trabalho confortavel num painel admin interno) — a renovacao proativa
        // no front estende enquanto ativo; o refresh token (7d) cobre o resto.
        signOptions: {
          // env e string em runtime; o tipo do jsonwebtoken e number|StringValue.
          expiresIn: (config.get<string>('JWT_ACCESS_TTL') ??
            '8h') as SignOptions['expiresIn'],
        },
      }),
    }),
    CacheModule.register({ ttl: 5 * 60 * 1000 }),
  ],
  controllers: [AuthController, ApiKeysController, UsuariosController, RolesController],
  providers: [
    LoginAdminUseCase,
    LoginGoogleUseCase,
    RefreshTokenUseCase,
    CriarUsuarioUseCase,
    ListarUsuariosUseCase,
    RemoverUsuarioUseCase,
    BuscarPerfilUseCase,
    AtualizarNomeUseCase,
    AlterarSenhaUseCase,
    GerarApiKeyUseCase,
    RevogarApiKeyUseCase,
    ListarApiKeysUseCase,
    ValidarApiKeyUseCase,
    ListarRolesUseCase,
    CriarRoleUseCase,
    AtualizarRoleUseCase,
    RemoverRoleUseCase,
    PermissionsService,
    JwtStrategy,
    ApiKeyGuard,
    JwtAuthGuard,
    JwtOrApiKeyGuard,
    RolesGuard,
    PermissionsGuard,
    ScopesGuard,
    { provide: ADMIN_USER_REPOSITORY, useClass: AdminUserRepository },
    { provide: API_KEY_REPOSITORY, useClass: ApiKeyRepository },
    { provide: ROLE_REPOSITORY, useClass: RoleRepository },
    { provide: GOOGLE_TOKEN_VERIFIER, useClass: GoogleTokenVerifier },
  ],
  exports: [
    // JwtModule exportado para o JwtOrApiKeyGuard resolver o JwtService quando
    // instanciado no contexto de outro modulo (ex.: ProdutosModule).
    JwtModule,
    ApiKeyGuard,
    JwtAuthGuard,
    JwtOrApiKeyGuard,
    RolesGuard,
    PermissionsGuard,
    ScopesGuard,
    PermissionsService,
    ValidarApiKeyUseCase,
  ],
})
export class AuthModule {}
