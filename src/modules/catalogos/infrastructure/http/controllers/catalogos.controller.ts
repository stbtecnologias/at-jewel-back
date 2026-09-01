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
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  EnviarFinalUseCase,
  LIMITE_FINAL_BYTES,
} from '../../../application/use-cases/enviar-final.use-case';
import { ExportarCatalogoUseCase } from '../../../application/use-cases/exportar-catalogo.use-case';
import { MontarCatalogoUseCase } from '../../../application/use-cases/montar-catalogo.use-case';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import type { JwtPayload } from '../../../../auth/infrastructure/http/strategies/jwt.strategy';
import {
  AnexarReferenciaUseCase,
  AtualizarCatalogoUseCase,
  BuscarCatalogoUseCase,
  CriarCatalogoUseCase,
  CurarFotoUseCase,
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
    private readonly curarFoto: CurarFotoUseCase,
    private readonly exportarCatalogo: ExportarCatalogoUseCase,
    private readonly montarCatalogo: MontarCatalogoUseCase,
    private readonly enviarFinalCatalogo: EnviarFinalUseCase,
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
  async criar(
    @Body() dto: CriarCatalogoDto,
    @Request() req: { user: JwtPayload },
  ) {
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

  /**
   * Monta o catálogo em PDF, uma peça por página.
   *
   * `catalogo:write` porque grava: o arquivo vai para o armazenamento e o
   * catálogo passa a apontar para ele. Rodar de novo substitui o anterior.
   */
  @Post(':id/montagem')
  @Permissions('catalogo:write')
  async montar(@Param('id', ParseUUIDPipe) id: string) {
    return this.montarCatalogo.execute(id);
  }

  /**
   * O catálogo montado fora, voltando.
   *
   * `FileInterceptor` com `limits` próprio: o teto do catálogo (12 MB) foi
   * dimensionado para foto de celular, e um PDF de InDesign passa disso sem
   * esforço. Sem `limits`, o multer leria um arquivo de qualquer tamanho para
   * a memória antes de qualquer validação nossa.
   */
  @Post(':id/final')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('catalogo:write')
  @UseInterceptors(
    FileInterceptor('arquivo', { limits: { fileSize: LIMITE_FINAL_BYTES } }),
  )
  async enviarFinal(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
    @Request() req: { user: JwtPayload },
  ) {
    // O nome do staff sai do JWT — nunca do corpo. Rótulo de histórico que a
    // própria pessoa pudesse escrever não valeria como registro de quem foi.
    return this.enviarFinalCatalogo.execute(id, arquivo, req.user.email);
  }

  /**
   * O zip para o marketing montar a peça fora.
   *
   * `@Res()` porque a resposta é um STREAM: o zip vai sendo escrito enquanto as
   * fotos são lidas do armazenamento, e não existe objeto para o Nest
   * serializar. Devolver o arquivo montado exigiria segurá-lo inteiro na
   * memória antes de mandar o primeiro byte.
   *
   * `catalogo:read` e não `write`: exportar não muda nada.
   */
  @Get(':id/exportacao')
  @Permissions('catalogo:read')
  async exportar(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const { nomeArquivo, arquivo } = await this.exportarCatalogo.execute(id);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeArquivo}"`,
    );
    // Sem isto o navegador do front não enxerga o cabeçalho e o download sai
    // com o nome da rota (`exportacao`) em vez do nome do catálogo.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    arquivo.pipe(res);
  }

  // ---------------------------------------------------------------------------
  // Curadoria das fotos
  //
  // NAO HA ROTA DE APROVAR AQUI, e a ausencia e a regra: a qualidade da foto e
  // julgada por quem fotografou, na conversa do WhatsApp. Esta tela decide
  // outra coisa — se a peca entra nesta edicao. Ver `CurarFotoUseCase`.
  //
  // Sao duas rotas explicitas em vez de um PATCH com `status` no corpo: assim
  // a tela nao TEM como gravar APROVADA, nem por engano nem por quem montar a
  // requisicao a mao.
  // ---------------------------------------------------------------------------

  @Patch(':id/fotos/:fotoId/tirar')
  @Permissions('catalogo:write')
  async tirarFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fotoId', ParseUUIDPipe) fotoId: string,
  ) {
    return this.curarFoto.tirar(id, fotoId);
  }

  @Patch(':id/fotos/:fotoId/devolver')
  @Permissions('catalogo:write')
  async devolverFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fotoId', ParseUUIDPipe) fotoId: string,
  ) {
    return this.curarFoto.devolver(id, fotoId);
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
