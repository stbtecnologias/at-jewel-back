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
import { Roles } from '../decorators/roles.decorator';
import { CriarApiKeyDto } from '../dto/criar-api-key.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

// Gestao de API keys e operacao administrativa — restrita a ADMIN.
@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
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
