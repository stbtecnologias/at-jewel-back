import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import type { JwtPayload } from '../../../../auth/infrastructure/http/strategies/jwt.strategy';
import { AtualizarDemandaUseCase } from '../../../application/use-cases/atualizar-demanda.use-case';
import { BuscarDemandaUseCase } from '../../../application/use-cases/buscar-demanda.use-case';
import { CriarDemandaUseCase } from '../../../application/use-cases/criar-demanda.use-case';
import { KpisDemandasUseCase } from '../../../application/use-cases/kpis-demandas.use-case';
import { ListarDemandasUseCase } from '../../../application/use-cases/listar-demandas.use-case';
import type { StatusDemanda, TipoDemanda } from '../../../domain/entities/enums';
import { AtualizarDemandaDto } from '../dto/atualizar-demanda.dto';
import { CriarDemandaDto } from '../dto/criar-demanda.dto';

// Demandas (RF-24/25/26): canal de solicitacoes internas para a equipe
// tecnica. Leitura/abertura por qualquer usuaria (demandas:read/write);
// resposta e mudanca de status apenas pela gestao (demandas:manage).
@Controller('demandas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DemandasController {
  constructor(
    private readonly listarDemandas: ListarDemandasUseCase,
    private readonly kpisDemandas: KpisDemandasUseCase,
    private readonly buscarDemanda: BuscarDemandaUseCase,
    private readonly criarDemanda: CriarDemandaUseCase,
    private readonly atualizarDemanda: AtualizarDemandaUseCase,
  ) {}

  @Get()
  @Permissions('demandas:read')
  async listar(
    @Query('status') status?: StatusDemanda,
    @Query('tipo') tipo?: TipoDemanda,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.listarDemandas.execute({
      status,
      tipo,
      dataDe: dataDe ? new Date(dataDe) : undefined,
      dataAte: dataAte ? new Date(dataAte) : undefined,
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      offset: Math.max(0, Number(offset) || 0),
    });
  }

  // ATENCAO: declarar /kpis ANTES de /:id para o Nest nao casar
  // "kpis" como parametro :id.
  @Get('kpis')
  @Permissions('demandas:read')
  async kpis() {
    return this.kpisDemandas.execute();
  }

  @Get(':id')
  @Permissions('demandas:read')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarDemanda.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('demandas:write')
  async criar(
    @Body() dto: CriarDemandaDto,
    @Request() req: { user: JwtPayload },
  ) {
    const criada = await this.criarDemanda.execute({
      tipo: dto.tipo,
      descricao: dto.descricao,
      canal: 'MANUAL',
      solicitanteUserId: req.user.sub,
      // O JWT nao carrega nome; usa o email como rotulo de fallback
      // (o nome cadastrado do staff, se existir, tem prioridade no use case).
      solicitanteNomeFallback: req.user.email,
    });
    // Devolve o item achatado (mesmo contrato do GET) usando o id gerado.
    return this.buscarDemanda.execute(criada.id as string);
  }

  @Patch(':id')
  @Permissions('demandas:manage')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarDemandaDto,
  ) {
    return this.atualizarDemanda.execute(id, {
      status: dto.status,
      resposta: dto.resposta,
    });
  }
}
