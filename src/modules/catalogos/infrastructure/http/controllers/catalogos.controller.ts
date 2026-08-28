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
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import type { JwtPayload } from '../../../../auth/infrastructure/http/strategies/jwt.strategy';
import {
  AnexarReferenciaUseCase,
  AtualizarCatalogoUseCase,
  BuscarCatalogoUseCase,
  CriarCatalogoUseCase,
  ListarCatalogosUseCase,
  RemoverCatalogoUseCase,
  RemoverReferenciaUseCase,
  type ArquivoRecebido,
} from '../../../application/use-cases/catalogos.use-cases';
import type { StatusCatalogo } from '../../../domain/entities/enums';
import { LIMITE_BYTES } from '../../../domain/ports/armazenamento.port';
import {
  AtualizarCatalogoDto,
  CriarCatalogoDto,
  CriarReferenciaDto,
} from '../dto/catalogo.dto';

/** Teto de referencias por envio. Impede um `select all` virar 300 arquivos. */
const MAX_ARQUIVOS = 20;

/**
 * Catalogos — a colecao de campanha e as fotos que a compoem.
 *
 * Leitura e escrita por `catalogo:read` / `catalogo:write`. Sem escopo por
 * usuario: catalogo e material da casa, e o marketing precisa ver o que o
 * estoque fotografou. Nao ha PII de cliente em nenhuma destas rotas.
 */
@Controller('catalogos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogosController {
  constructor(
    private readonly listarCatalogos: ListarCatalogosUseCase,
    private readonly buscarCatalogo: BuscarCatalogoUseCase,
    private readonly criarCatalogo: CriarCatalogoUseCase,
    private readonly atualizarCatalogo: AtualizarCatalogoUseCase,
    private readonly removerCatalogo: RemoverCatalogoUseCase,
    private readonly anexarReferencia: AnexarReferenciaUseCase,
    private readonly removerReferencia: RemoverReferenciaUseCase,
  ) {}

  @Get()
  @Permissions('catalogo:read')
  async listar(
    @Query('status') status?: StatusCatalogo,
    @Query('busca') busca?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.listarCatalogos.execute({
      status,
      busca,
      limit: Math.min(200, Math.max(1, Number(limit) || 50)),
      offset: Math.max(0, Number(offset) || 0),
    });
  }

  // Aceita UUID ou o numero visivel ('0042') — a tela navega por numero.
  // Por isso NAO usa ParseUUIDPipe aqui.
  @Get(':idOuNumero')
  @Permissions('catalogo:read')
  async buscar(@Param('idOuNumero') idOuNumero: string) {
    return this.buscarCatalogo.execute(idOuNumero);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('catalogo:write')
  async criar(@Body() dto: CriarCatalogoDto, @Request() req: { user: JwtPayload }) {
    return this.criarCatalogo.execute({
      nome: dto.nome,
      tema: dto.tema ?? null,
      formato: dto.formato,
      criadoPorUserId: req.user.sub,
      // O nome cadastrado e resolvido no use case; o email so entra se nao
      // houver nome. Mesmo caminho das demandas.
      criadoPorNomeFallback: req.user.email,
    });
  }

  @Patch(':id')
  @Permissions('catalogo:write')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarCatalogoDto,
  ) {
    return this.atualizarCatalogo.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('catalogo:write')
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.removerCatalogo.execute(id);
  }

  // ---------------------------------------------------------------------------
  // Referencias criativas
  // ---------------------------------------------------------------------------

  @Post(':id/referencias')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('catalogo:write')
  async criarReferencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CriarReferenciaDto,
  ) {
    return this.anexarReferencia.texto(id, dto.tipo, dto.valor);
  }

  /**
   * Upload das paginas de catalogos anteriores.
   *
   * O limite de body global e 100kb (main.ts); o multipart nao passa por ele,
   * mas o proprio multer precisa do seu — sem `limits`, um arquivo de 2 GB
   * seria lido inteiro para a memoria antes de qualquer validacao nossa.
   */
  @Post(':id/referencias/imagens')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('catalogo:write')
  @UseInterceptors(
    FilesInterceptor('arquivos', MAX_ARQUIVOS, {
      limits: { fileSize: LIMITE_BYTES, files: MAX_ARQUIVOS },
    }),
  )
  async anexarImagens(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() arquivos: ArquivoRecebido[],
  ) {
    return this.anexarReferencia.imagens(id, arquivos ?? []);
  }

  @Delete(':id/referencias/:referenciaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('catalogo:write')
  async excluirReferencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('referenciaId', ParseUUIDPipe) referenciaId: string,
  ) {
    await this.removerReferencia.execute(id, referenciaId);
  }
}
