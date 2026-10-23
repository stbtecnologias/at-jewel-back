import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { EscopoVendasService } from '../../../../vendas/application/escopo-vendas.service';
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
    // O ESCOPO DA GERENTE — 23/10/2026. Meta POR_VENDEDORA de quem nao esta
    // na equipe dela nao aparece, nem na lista nem pelo id.
    private readonly escopo: EscopoVendasService,
  ) {}

  @Get()
  @Permissions('metas:read')
  async listar(
    @Request() req: RequisicaoComUsuario,
    @Query('tipo') tipo?: TipoMeta,
    @Query('referencia_id') referenciaId?: string,
  ) {
    const metas = await this.listarMetas.execute({ tipo, referenciaId });
    const equipe = await this.daEquipe(req);
    if (equipe === null) return metas;
    // SO AS DE VENDEDORA SAO RECORTADAS. Meta GLOBAL, de produto e de cliente
    // nao sao de ninguem em particular — esconde-las seria inventar uma regra
    // que ninguem pediu.
    return metas.filter((m) => this.alcanca(m, equipe));
  }

  @Get(':id')
  @Permissions('metas:read')
  async buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequisicaoComUsuario,
  ) {
    const meta = await this.buscarMeta.execute(id);
    await this.exigirAlcance(req, meta);
    return meta;
  }

  // Progresso da meta (realizado vs alvo) calculado sobre as vendas concluidas
  // na janela criado_em -> prazo.
  @Get(':id/progresso')
  @Permissions('metas:read')
  async progresso(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequisicaoComUsuario,
  ) {
    // A META VEM ANTES DO PROGRESSO: sem isto, o progresso de uma meta fora
    // da equipe sairia pelo id, e com ele o numero dela.
    await this.exigirAlcance(req, await this.buscarMeta.execute(id));
    return this.progressoMeta.execute(id);
  }

  /** As vendedoras que este usuario alcanca — `null` = todas. */
  private async daEquipe(req: RequisicaoComUsuario): Promise<string[] | null> {
    const sub = req?.user?.sub;
    if (!sub) return null;
    return this.escopo.equipeDoUsuario(sub);
  }

  /** Meta de vendedora so vale se a vendedora for da equipe. */
  private alcanca(meta: MetaComAlvo, equipe: string[]): boolean {
    if (meta.tipo !== 'POR_VENDEDORA') return true;
    return Boolean(meta.referenciaId && equipe.includes(meta.referenciaId));
  }

  /** Fora da equipe responde "nao achei" — nao "voce nao pode". */
  private async exigirAlcance(
    req: RequisicaoComUsuario,
    meta: MetaComAlvo,
  ): Promise<void> {
    const equipe = await this.daEquipe(req);
    if (equipe === null) return;
    if (!this.alcanca(meta, equipe)) {
      throw new NotFoundException('Meta não encontrada');
    }
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

/** O id do usuario do painel; ausente no caminho de chave de API. */
interface RequisicaoComUsuario {
  user?: { sub?: string };
}

/** O que o recorte precisa saber de uma meta. */
interface MetaComAlvo {
  tipo: TipoMeta;
  referenciaId: string | null;
}
