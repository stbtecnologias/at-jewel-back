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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string) {
    return this.revogarApiKey.execute(id);
  }
}
