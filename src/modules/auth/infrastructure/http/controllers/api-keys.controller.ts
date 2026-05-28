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
import { CriarApiKeyDto } from '../dto/criar-api-key.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

@Controller('auth/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(
    private readonly gerarApiKey: GerarApiKeyUseCase,
    private readonly listarApiKeys: ListarApiKeysUseCase,
    private readonly revogarApiKey: RevogarApiKeyUseCase,
  ) {}

  @Post()
  create(@Body() dto: CriarApiKeyDto, @Request() req: { user: JwtPayload }) {
    return this.gerarApiKey.execute(dto.name, req.user.sub);
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
