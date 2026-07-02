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
import { AtualizarConsignacaoUseCase } from '../../../application/use-cases/atualizar-consignacao.use-case';
import { BuscarConsignacaoUseCase } from '../../../application/use-cases/buscar-consignacao.use-case';
import { CriarConsignacaoUseCase } from '../../../application/use-cases/criar-consignacao.use-case';
import { ListarConsignacoesUseCase } from '../../../application/use-cases/listar-consignacoes.use-case';
import { ResumoConsignacoesUseCase } from '../../../application/use-cases/resumo-consignacoes.use-case';
import type {
  DestinoConsignacao,
  StatusConsignacao,
} from '../../../domain/entities/enums';
import { AtualizarConsignacaoDto } from '../dto/atualizar-consignacao.dto';
import { CriarConsignacaoDto } from '../dto/criar-consignacao.dto';

// Consignacoes (RF-13/RF-14): pecas em posse de clientes/vendedoras.
// Leitura exige consignacoes:read, escrita consignacoes:write (RF-USU-01).
@Controller('consignacoes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConsignacoesController {
  constructor(
    private readonly listarConsignacoes: ListarConsignacoesUseCase,
    private readonly resumoConsignacoes: ResumoConsignacoesUseCase,
    private readonly buscarConsignacao: BuscarConsignacaoUseCase,
    private readonly criarConsignacao: CriarConsignacaoUseCase,
    private readonly atualizarConsignacao: AtualizarConsignacaoUseCase,
  ) {}

  @Get()
  @Permissions('consignacoes:read')
  async listar(
    @Query('status') status?: StatusConsignacao,
    @Query('destinoTipo') destinoTipo?: DestinoConsignacao,
    @Query('produtoId') produtoId?: string,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.listarConsignacoes.execute({
      status,
      destinoTipo,
      produtoId,
      dataDe: dataDe ? new Date(dataDe) : undefined,
      dataAte: dataAte ? new Date(dataAte) : undefined,
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      offset: Math.max(0, Number(offset) || 0),
    });
  }

  // ATENCAO: declarar /resumo ANTES de /:id para o Nest nao casar
  // "resumo" como parametro :id.
  @Get('resumo')
  @Permissions('consignacoes:read')
  async resumo() {
    return this.resumoConsignacoes.execute();
  }

  @Get(':id')
  @Permissions('consignacoes:read')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarConsignacao.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('consignacoes:write')
  async criar(
    @Body() dto: CriarConsignacaoDto,
    @Request() req: { user: JwtPayload },
  ) {
    const criada = await this.criarConsignacao.execute({
      produtoId: dto.produtoId,
      quantidade: dto.quantidade,
      destinoTipo: dto.destinoTipo,
      clienteId: dto.clienteId ?? null,
      vendedoraId: dto.vendedoraId ?? null,
      dataPrevistaRetorno: dto.dataPrevistaRetorno
        ? new Date(dto.dataPrevistaRetorno)
        : null,
      observacao: dto.observacao ?? null,
      criadoPor: req.user.sub,
    });
    // Devolve o item enriquecido (mesmo contrato do GET) usando o id gerado.
    return this.buscarConsignacao.execute(criada.id as string);
  }

  @Patch(':id')
  @Permissions('consignacoes:write')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarConsignacaoDto,
  ) {
    return this.atualizarConsignacao.execute(id, {
      status: dto.status,
      dataRetorno: dto.dataRetorno ? new Date(dto.dataRetorno) : undefined,
      observacao: dto.observacao,
    });
  }
}
