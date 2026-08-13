import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SCOPES_CATALOGO, type ScopeDef } from '../../../domain/entities/scopes';
import { GerarApiKeyUseCase } from '../../../application/use-cases/gerar-api-key.use-case';
import { ListarApiKeysUseCase } from '../../../application/use-cases/listar-api-keys.use-case';
import { RevogarApiKeyUseCase } from '../../../application/use-cases/revogar-api-key.use-case';
import { Permissions } from '../decorators/permissions.decorator';
import { CriarApiKeyDto } from '../dto/criar-api-key.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

// Gestao de API keys e operacao administrativa — restrita a quem tem
// api_keys:manage (SUPERADMIN/ADMIN por padrao — RF-API-01).
@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('api_keys:manage')
export class ApiKeysController {
  constructor(
    private readonly gerarApiKey: GerarApiKeyUseCase,
    private readonly listarApiKeys: ListarApiKeysUseCase,
    private readonly revogarApiKey: RevogarApiKeyUseCase,
  ) {}

  @Post()
  create(@Body() dto: CriarApiKeyDto, @Request() req: { user: JwtPayload }) {
    return this.gerarApiKey.execute(
      dto.name,
      req.user.sub,
      dto.scopes ?? [],
      dto.expiresAt ? new Date(dto.expiresAt) : null,
    );
  }

  @Get()
  findAll() {
    return this.listarApiKeys.execute();
  }

  /**
   * Catalogo de scopes disponiveis, para a tela montar as caixas.
   *
   * Ate 13/08/2026 o front mantinha uma copia manual desta lista. Ela saiu de
   * sincronia tres vezes em tres dias (produtos, vendedoras, fornecedores) — e
   * scope existente no back sem copia no front simplesmente NAO APARECIA na
   * tela, impedindo criar a chave pelo painel. O caso mais caro foi
   * produtos:read/write, dois meses fora: a chave `integracao-catalogo`, ativa
   * em producao, nao poderia ser recriada se fosse revogada.
   *
   * Espelha o GET /auth/roles/catalogo, que a tela de Papeis ja consumia.
   *
   * Herda os guards do controller (JWT + api_keys:manage). Nao expoe segredo:
   * e a mesma lista que o CriarApiKeyDto ja usa para validar a entrada.
   *
   * Declarado ANTES da rota de parametro para nao ser capturado por ela.
   */
  @Get('scopes')
  scopes(): ScopeDef[] {
    return SCOPES_CATALOGO;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string) {
    return this.revogarApiKey.execute(id);
  }
}
