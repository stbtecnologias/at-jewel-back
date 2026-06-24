import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import { ListarEventosUseCase } from '../../../application/use-cases/listar-eventos.use-case';
import { RegistrarEventoUseCase } from '../../../application/use-cases/registrar-evento.use-case';
import { FiltroEventoDto } from '../dto/filtro-evento.dto';
import { RegistrarEventoDto } from '../dto/registrar-evento.dto';

// Estrategia de auth:
//  - POST (escrita pelo n8n) => API Key com scope agente_eventos:write
//  - GET (leitura administrativa) => JWT + permissao analytics:read (RF-USU-01)
@Controller('agente/eventos')
export class AgenteEventosController {
  constructor(
    private readonly registrar: RegistrarEventoUseCase,
    private readonly listar: ListarEventosUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('agente_eventos:write')
  async registrarEvento(@Body() dto: RegistrarEventoDto) {
    const evento = await this.registrar.execute({
      agente: dto.agente,
      tipoEvento: dto.tipoEvento,
      clienteId: dto.clienteId,
      vendedoraId: dto.vendedoraId,
      correlationId: dto.correlationId,
      payload: dto.payload,
    });
    return evento.toPublic();
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('analytics:read')
  async listarEventos(@Query() filtros: FiltroEventoDto) {
    const eventos = await this.listar.execute({
      agente: filtros.agente,
      tipoEvento: filtros.tipoEvento,
      clienteId: filtros.clienteId,
      vendedoraId: filtros.vendedoraId,
      correlationId: filtros.correlationId,
      desde: filtros.desde ? new Date(filtros.desde) : undefined,
      limit: filtros.limit,
    });
    return eventos.map((e) => e.toPublic());
  }
}
