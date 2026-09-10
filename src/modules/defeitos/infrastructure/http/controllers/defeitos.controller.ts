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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { LIMITE_BYTES } from '../../../../catalogos/domain/ports/armazenamento.port';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { AtualizarDefeitoUseCase } from '../../../application/use-cases/atualizar-defeito.use-case';
import { BuscarDefeitoUseCase } from '../../../application/use-cases/buscar-defeito.use-case';
import { CriarDefeitoUseCase } from '../../../application/use-cases/criar-defeito.use-case';
import {
  FotosOcorrenciaUseCase,
  type ArquivoRecebido,
} from '../../../application/use-cases/fotos-ocorrencia.use-case';
import { KpisDefeitosUseCase } from '../../../application/use-cases/kpis-defeitos.use-case';
import { ListarDefeitosUseCase } from '../../../application/use-cases/listar-defeitos.use-case';
import { RemoverDefeitoUseCase } from '../../../application/use-cases/remover-defeito.use-case';
import type { TipoDefeito } from '../../../domain/entities/enums';
import { AtualizarDefeitoDto } from '../dto/atualizar-defeito.dto';
import { CriarDefeitoDto } from '../dto/criar-defeito.dto';

/**
 * Teto de fotos por envio. Uma ocorrencia bem documentada tem tres ou quatro
 * angulos; dez ja e alguem selecionando a pasta inteira sem olhar.
 */
const MAX_FOTOS = 10;

// Ocorrencias de produto (defeito/devolucao/reclamacao) — leitura exige
// ocorrencias:read, escrita ocorrencias:write (RF-USU-01).
@Controller('defeitos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DefeitosController {
  constructor(
    private readonly listarDefeitos: ListarDefeitosUseCase,
    private readonly buscarDefeito: BuscarDefeitoUseCase,
    private readonly criarDefeito: CriarDefeitoUseCase,
    private readonly atualizarDefeito: AtualizarDefeitoUseCase,
    private readonly removerDefeito: RemoverDefeitoUseCase,
    private readonly kpisDefeitos: KpisDefeitosUseCase,
    private readonly fotos: FotosOcorrenciaUseCase,
  ) {}

  @Get()
  @Permissions('ocorrencias:read')
  async listar(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('tipo') tipo?: TipoDefeito,
    @Query('produto_id') produtoId?: string,
    // O FILTRO QUE FAZ A CONSULTA VIRAR HISTORICO: "tudo que este cliente já
    // devolveu". Antes só dava para contar por tipo.
    @Query('cliente_id') clienteId?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ) {
    return this.listarDefeitos.execute({
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(200, Math.max(1, Number(limit) || 20)),
      tipo,
      produtoId,
      clienteId,
      dataInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataFim: dataFim ? new Date(dataFim) : undefined,
    });
  }

  @Get('kpis')
  @Permissions('ocorrencias:read')
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
  @Permissions('ocorrencias:read')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarDefeito.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('ocorrencias:write')
  async criar(@Body() dto: CriarDefeitoDto) {
    return this.criarDefeito.execute({
      produtoId: dto.produto_id,
      clienteId: dto.cliente_id ?? null,
      tipo: dto.tipo,
      descricao: dto.descricao,
      data: new Date(dto.data),
      resolucao: dto.resolucao ?? null,
    });
  }

  @Patch(':id')
  @Permissions('ocorrencias:write')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarDefeitoDto,
  ) {
    return this.atualizarDefeito.execute(id, {
      produtoId: dto.produto_id,
      clienteId: dto.cliente_id,
      tipo: dto.tipo,
      descricao: dto.descricao,
      data: dto.data ? new Date(dto.data) : undefined,
      resolucao: dto.resolucao,
    });
  }

  /**
   * As fotos da ocorrencia — a prova que atravessa o tempo.
   *
   * `limits` no interceptor porque sem ele o multer le o arquivo inteiro para
   * a memoria antes de qualquer validacao nossa.
   */
  @Post(':id/fotos')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('ocorrencias:write')
  @UseInterceptors(
    FilesInterceptor('arquivos', MAX_FOTOS, {
      limits: { fileSize: LIMITE_BYTES, files: MAX_FOTOS },
    }),
  )
  async anexarFotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() arquivos: ArquivoRecebido[],
  ) {
    return this.fotos.anexar(id, arquivos ?? []);
  }

  @Delete(':id/fotos/:fotoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('ocorrencias:write')
  async removerFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fotoId', ParseUUIDPipe) fotoId: string,
  ) {
    await this.fotos.remover(id, fotoId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('ocorrencias:write')
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.removerDefeito.execute(id);
  }
}
