import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ListarEventosUseCase } from '../../../application/use-cases/listar-eventos.use-case';
import { RegistrarEventoUseCase } from '../../../application/use-cases/registrar-evento.use-case';
import { FiltroEventoDto } from '../dto/filtro-evento.dto';
import { RegistrarEventoDto } from '../dto/registrar-evento.dto';

// TODO(S4): aplicar guard de API Key. Endpoint POST e chamado pelo n8n
// (escrita); GET e do dashboard (read-only, RBAC GERENTE+).
@Controller('agente/eventos')
export class AgenteEventosController {
  constructor(
    private readonly registrar: RegistrarEventoUseCase,
    private readonly listar: ListarEventosUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
