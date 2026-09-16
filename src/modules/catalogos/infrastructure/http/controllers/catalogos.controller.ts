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
import { AjustarCatalogoUseCase } from '../../../application/use-cases/ajustar-catalogo.use-case';
import { MontarCatalogoUseCase } from '../../../application/use-cases/montar-catalogo.use-case';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import type { JwtPayload } from '../../../../auth/infrastructure/http/strategies/jwt.strategy';
import {
  AnexarReferenciaUseCase,
  AnotarReferenciaUseCase,
  AtualizarCatalogoUseCase,
  CorrigirParcelamentoUseCase,
  BuscarCatalogoUseCase,
  CriarCatalogoUseCase,
  CurarFotoUseCase,
  DefinirCapaUseCase,
  ListarCatalogosUseCase,
  RemoverCatalogoUseCase,
  RemoverReferenciaUseCase,
  type ArquivoRecebido,
} from '../../../application/use-cases/catalogos.use-cases';
import type { StatusCatalogo } from '../../../domain/entities/enums';
import { LIMITE_PDF_BYTES } from '../../../domain/ports/armazenamento.port';
import {
  AnotarReferenciaDto,
  AtualizarCatalogoDto,
  CorrigirParcelamentoDto,
  CriarCatalogoDto,
  CriarReferenciaDto,
  DefinirCapaDto,
  AplicarAjusteDto,
  InterpretarAjusteDto,
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
    private readonly definirCapaCatalogo: DefinirCapaUseCase,
    private readonly anotarReferencia: AnotarReferenciaUseCase,
    private readonly corrigirParcelamento: CorrigirParcelamentoUseCase,
    private readonly removerCatalogo: RemoverCatalogoUseCase,
    private readonly anexarReferencia: AnexarReferenciaUseCase,
    private readonly removerReferencia: RemoverReferenciaUseCase,
    private readonly curarFoto: CurarFotoUseCase,
    private readonly exportarCatalogo: ExportarCatalogoUseCase,
    private readonly montarCatalogo: MontarCatalogoUseCase,
    private readonly enviarFinalCatalogo: EnviarFinalUseCase,
    private readonly ajustarCatalogo: AjustarCatalogoUseCase,
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

  /**
   * A capa do catalogo — uma das referencias que ja estao anexadas.
   *
   * Rota propria, e nao um campo no PATCH acima, porque este precisa checar
   * que a referencia e DESTE catalogo e que ela e imagem. Num campo do DTO
   * geral, essa checagem viraria uma excecao no meio de um caminho que so
   * atribui valores.
   *
   * `referencia_id` ausente ou nulo = volta a capa automatica.
   */
  @Patch(':id/capa')
  @Permissions('catalogo:write')
  async definirCapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DefinirCapaDto,
  ) {
    return this.definirCapaCatalogo.execute(id, dto.referencia_id ?? null);
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
   * O que foi entendido de um pedido de ajuste — NADA é gerado nem gravado.
   *
   * Passo 1 de 2: a tela mostra a lista para a pessoa confirmar. Ver
   * `AjustarCatalogoUseCase`.
   */
  @Post(':id/ajustes/interpretacao')
  @HttpCode(HttpStatus.OK)
  @Permissions('catalogo:write')
  async interpretarAjuste(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InterpretarAjusteDto,
  ) {
    return this.ajustarCatalogo.interpretar(id, dto.texto, dto.finalId);
  }

  /**
   * Aplica os ajustes confirmados e grava uma VERSÃO NOVA do PDF. A versão
   * ajustada continua guardada.
   */
  @Post(':id/ajustes')
  @Permissions('catalogo:write')
  async aplicarAjuste(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AplicarAjusteDto,
  ) {
    return this.ajustarCatalogo.aplicar(id, dto.finalId, dto.acoes);
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

  /**
   * Corrigir parcelas e juro de uma peca ja no catalogo.
   *
   * Rota propria, e nao um PATCH generico com o corpo da foto: as outras duas
   * rotas de foto sao explicitas justamente para a tela nao ter como gravar
   * `status`, e um PATCH aberto aqui desfaria essa protecao.
   *
   * Campo ausente nao mexe; `null` limpa. Sao coisas diferentes: mandar so
   * `parcelas` nao pode apagar o juro que ja estava la.
   */
  @Patch(':id/fotos/:fotoId/parcelamento')
  @Permissions('catalogo:write')
  async corrigirParcelamentoFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fotoId', ParseUUIDPipe) fotoId: string,
    @Body() dto: CorrigirParcelamentoDto,
  ) {
    return this.corrigirParcelamento.execute(id, fotoId, {
      parcelas: dto.parcelas,
      jurosPercentual: dto.juros_percentual,
    });
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
    // O TETO AQUI E O MAIOR DOS DOIS, e a diferenca por tipo fica no use case.
    // O multer nao sabe distinguir PDF de JPEG: um teto unico de 12 MB
    // derrubaria o PDF antes de qualquer validacao nossa, com erro ilegivel; um
    // teto de 60 MB deixaria passar um JPEG gigante ate a nossa recusa, que e o
    // lugar onde da para explicar o porque.
    FilesInterceptor('arquivos', MAX_ARQUIVOS, {
      limits: { fileSize: LIMITE_PDF_BYTES, files: MAX_ARQUIVOS },
    }),
  )
  async anexarImagens(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() arquivos: ArquivoRecebido[],
  ) {
    return this.anexarReferencia.imagens(id, arquivos ?? []);
  }

  /** A nota daquele arquivo. Corpo vazio, ou `observacao` em branco, apaga. */
  @Patch(':id/referencias/:referenciaId')
  @Permissions('catalogo:write')
  async anotar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('referenciaId', ParseUUIDPipe) referenciaId: string,
    @Body() dto: AnotarReferenciaDto,
  ) {
    return this.anotarReferencia.execute(
      id,
      referenciaId,
      dto.observacao ?? null,
    );
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
