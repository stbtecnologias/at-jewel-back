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
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { AtualizarMetaUseCase } from '../../../application/use-cases/atualizar-meta.use-case';
import { BuscarMetaUseCase } from '../../../application/use-cases/buscar-meta.use-case';
import { CriarMetaUseCase } from '../../../application/use-cases/criar-meta.use-case';
import { ListarMetasUseCase } from '../../../application/use-cases/listar-metas.use-case';
import { ProgressoMetaUseCase } from '../../../application/use-cases/progresso-meta.use-case';
import { RemoverMetaUseCase } from '../../../application/use-cases/remover-meta.use-case';
import type { TipoMeta } from '../../../domain/entities/enums';
import { AtualizarMetaDto } from '../dto/atualizar-meta.dto';
import { CriarMetaDto } from '../dto/criar-meta.dto';

// Gestao de metas — leitura exige metas:read, escrita metas:write (RF-USU-01).
@Controller('metas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MetasController {
  constructor(
    private readonly listarMetas: ListarMetasUseCase,
    private readonly buscarMeta: BuscarMetaUseCase,
    private readonly criarMeta: CriarMetaUseCase,
    private readonly atualizarMeta: AtualizarMetaUseCase,
    private readonly removerMeta: RemoverMetaUseCase,
    private readonly progressoMeta: ProgressoMetaUseCase,
  ) {}

  @Get()
  @Permissions('metas:read')
  async listar(
    @Query('tipo') tipo?: TipoMeta,
    @Query('referencia_id') referenciaId?: string,
  ) {
    return this.listarMetas.execute({ tipo, referenciaId });
  }

  @Get(':id')
  @Permissions('metas:read')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarMeta.execute(id);
  }

  // Progresso da meta (realizado vs alvo) calculado sobre as vendas concluidas
  // na janela criado_em -> prazo.
  @Get(':id/progresso')
  @Permissions('metas:read')
  async progresso(@Param('id', ParseUUIDPipe) id: string) {
    return this.progressoMeta.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('metas:write')
  async criar(@Body() dto: CriarMetaDto) {
    return this.criarMeta.execute({
      tipo: dto.tipo,
      referenciaId: dto.referencia_id ?? null,
      valorAlvo: dto.valor_alvo,
      prazo: new Date(dto.prazo),
      descricao: dto.descricao ?? null,
    });
  }

  @Patch(':id')
  @Permissions('metas:write')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarMetaDto,
  ) {
    return this.atualizarMeta.execute(id, {
      tipo: dto.tipo,
      referenciaId: dto.referencia_id,
      valorAlvo: dto.valor_alvo,
      prazo: dto.prazo ? new Date(dto.prazo) : undefined,
      descricao: dto.descricao,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('metas:write')
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.removerMeta.execute(id);
  }
}
