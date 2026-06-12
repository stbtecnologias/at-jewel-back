import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { AtualizarDefeitoUseCase } from '../../../application/use-cases/atualizar-defeito.use-case';
import { BuscarDefeitoUseCase } from '../../../application/use-cases/buscar-defeito.use-case';
import { CriarDefeitoUseCase } from '../../../application/use-cases/criar-defeito.use-case';
import { KpisDefeitosUseCase } from '../../../application/use-cases/kpis-defeitos.use-case';
import { ListarDefeitosUseCase } from '../../../application/use-cases/listar-defeitos.use-case';
import { RemoverDefeitoUseCase } from '../../../application/use-cases/remover-defeito.use-case';
import type { TipoDefeito } from '../../../domain/entities/enums';
import { AtualizarDefeitoDto } from '../dto/atualizar-defeito.dto';
import { CriarDefeitoDto } from '../dto/criar-defeito.dto';

// Ocorrencias de produto (defeito/devolucao/reclamacao) — restrito a staff
// (ADMIN/GERENTE) via JWT do painel.
@Controller('defeitos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'GERENTE')
export class DefeitosController {
  constructor(
    private readonly listarDefeitos: ListarDefeitosUseCase,
    private readonly buscarDefeito: BuscarDefeitoUseCase,
    private readonly criarDefeito: CriarDefeitoUseCase,
    private readonly atualizarDefeito: AtualizarDefeitoUseCase,
    private readonly removerDefeito: RemoverDefeitoUseCase,
    private readonly kpisDefeitos: KpisDefeitosUseCase,
  ) {}

  @Get()
  async listar(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('tipo') tipo?: TipoDefeito,
    @Query('produto_id') produtoId?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.listarDefeitos.execute({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(200, Math.max(1, Number(limit) || 20)),
      tipo,
      produtoId,
      dataInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataFim: dataFim ? new Date(dataFim) : undefined,
    });
  }

  @Get('kpis')
  async kpis(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.kpisDefeitos.execute({
      dataInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataFim: dataFim ? new Date(dataFim) : undefined,
    });
  }

  @Get(':id')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarDefeito.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(@Body() dto: CriarDefeitoDto) {
    return this.criarDefeito.execute({
      produtoId: dto.produto_id,
      tipo: dto.tipo,
      descricao: dto.descricao,
      data: new Date(dto.data),
      resolucao: dto.resolucao ?? null,
    });
  }

  @Patch(':id')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarDefeitoDto,
  ) {
    return this.atualizarDefeito.execute(id, {
      produtoId: dto.produto_id,
      tipo: dto.tipo,
      descricao: dto.descricao,
      data: dto.data ? new Date(dto.data) : undefined,
      resolucao: dto.resolucao,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.removerDefeito.execute(id);
  }
}
