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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LIMITE_BYTES } from '../../../../catalogos/domain/ports/armazenamento.port';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import {
  FotoProdutoUseCase,
  type ArquivoRecebido,
} from '../../../application/use-cases/foto-produto.use-case';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { JwtOrApiKeyGuard } from '../../../../auth/infrastructure/http/guards/jwt-or-api-key.guard';
import { AlertasEstoqueUseCase } from '../../../application/use-cases/alertas-estoque.use-case';
import { SaldoDoProdutoUseCase } from '../../../application/use-cases/saldo-do-produto.use-case';
import { AtualizarProdutoUseCase } from '../../../application/use-cases/atualizar-produto.use-case';
import { BuscarProdutoUseCase } from '../../../application/use-cases/buscar-produto.use-case';
import { BuscarProdutoPorIdErpUseCase } from '../../../application/use-cases/buscar-produto-por-id-erp.use-case';
import { FacetasProdutosUseCase } from '../../../application/use-cases/facetas-produtos.use-case';
import {
  CriarProdutoInput,
  CriarProdutoUseCase,
} from '../../../application/use-cases/criar-produto.use-case';
import { CriarProdutosLoteUseCase } from '../../../application/use-cases/criar-produtos-lote.use-case';
import { ListarProdutosUseCase } from '../../../application/use-cases/listar-produtos.use-case';
import { RemoverProdutoUseCase } from '../../../application/use-cases/remover-produto.use-case';
import { AtualizarProdutoDto } from '../dto/atualizar-produto.dto';
import { CriarProdutoDto } from '../dto/criar-produto.dto';
import { CriarProdutosLoteDto } from '../dto/criar-produtos-lote.dto';
import { FiltroProdutoDto } from '../dto/filtro-produto.dto';

@Controller('produtos')
export class ProdutosController {
  constructor(
    private readonly listarProdutos: ListarProdutosUseCase,
    private readonly buscarProduto: BuscarProdutoUseCase,
    private readonly buscarProdutoPorIdErp: BuscarProdutoPorIdErpUseCase,
    private readonly criarProduto: CriarProdutoUseCase,
    private readonly criarProdutosLote: CriarProdutosLoteUseCase,
    private readonly atualizarProduto: AtualizarProdutoUseCase,
    private readonly removerProduto: RemoverProdutoUseCase,
    private readonly facetasProdutos: FacetasProdutosUseCase,
    private readonly alertasEstoque: AlertasEstoqueUseCase,
    private readonly saldoDoProduto: SaldoDoProdutoUseCase,
    private readonly fotoProduto: FotoProdutoUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async listar(@Query() filtros: FiltroProdutoDto) {
    return this.listarProdutos.execute(filtros);
  }

  // Valores distintos para filtros (declarado antes de :id para nao colidir).
  @Get('facetas')
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async facetas() {
    return this.facetasProdutos.execute();
  }

  // Alertas de estoque baixo + giro lento.
  @Get('alertas-estoque')
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async alertas(
    @Query('limite') limite?: string,
    @Query('dias') dias?: string,
  ) {
    return this.alertasEstoque.execute(
      limite ? Number(limite) : undefined,
      dias ? Number(dias) : undefined,
    );
  }

  // Busca pela identidade no ERP. Declarada ANTES de @Get(':id') porque o Nest
  // casa as rotas na ordem em que aparecem — depois dele, "iderp" seria lido
  // como um id e cairia no ParseUUIDPipe.
  @Get('iderp/:id')
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async buscarPeloIdErp(@Param('id') idErp: string) {
    return this.buscarProdutoPorIdErp.execute(idErp);
  }

  /**
   * Onde esta o saldo da peca: empresa, local e grupo, so as linhas com
   * quantidade. A soma e o `estoqueAtual` que ja vem no produto.
   */
  @Get(':id/estoque')
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async estoque(@Param('id', ParseUUIDPipe) id: string) {
    return this.saldoDoProduto.execute(id);
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarProduto.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:write')
  async criar(@Body() dto: CriarProdutoDto) {
    return this.criarProduto.execute(dtoParaInput(dto));
  }

  // Cadastro em LOTE (ate 200 itens), all-or-nothing numa transacao.
  @Post('lote')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:write')
  async criarLote(@Body() dto: CriarProdutosLoteDto) {
    const produtos = await this.criarProdutosLote.execute(
      dto.produtos.map(dtoParaInput),
    );
    return { criados: produtos.length, produtos };
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:write')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarProdutoDto,
  ) {
    return this.atualizarProduto.execute(id, {
      idErp: dto.id_erp_produto,
      categoria: dto.categoria,
      familia: dto.familia,
      colecao: dto.colecao,
      cor: dto.cor,
      tamanho: dto.tamanho,
      tipoPedra: dto.tipo_pedra,
      colecaoPedra: dto.colecao_pedra,
      referenciaFornecedor: dto.referencia_fornecedor,
      descricaoEtiqueta: dto.descricao_etiqueta,
      pesoGramas: dto.peso_gramas,
      unidade: dto.unidade,
      valorCompra: dto.valor_compra,
      valorCusto: dto.valor_custo,
      margemPercentual: dto.margem_percentual,
      valorVenda: dto.valor_venda,
      observacao: dto.observacao,
      fotoUrl: dto.foto_url,
      ativo: dto.ativo,
    });
  }

  /**
   * A foto propria da peca — a que ganha da foto do ERP.
   *
   * GUARDA DIFERENTE DO RESTO DESTE CONTROLLER, e de proposito: as demais
   * rotas usam `JwtOrApiKeyGuard`, que aceita chave de API. Aqui nao ha
   * integracao que suba foto, e o `JwtOrApiKeyGuard` com `@Permissions` teria
   * um buraco — no ramo da chave ele so confere `@RequireScopes`, entao
   * qualquer chave valida passaria. Painel so, entao guarda de painel.
   *
   * `limits` no interceptor porque sem ele o multer le o arquivo inteiro para
   * a memoria antes de qualquer validacao nossa.
   */
  @Post(':id/foto')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('produtos:foto')
  @UseInterceptors(
    FileInterceptor('arquivo', { limits: { fileSize: LIMITE_BYTES } }),
  )
  async subirFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
  ) {
    return this.fotoProduto.subir(id, arquivo);
  }

  /** Tira a foto nossa. A peca volta a exibir a do ERP, se houver. */
  @Delete(':id/foto')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('produtos:foto')
  async removerFoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.fotoProduto.remover(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:write')
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.removerProduto.execute(id);
  }
}

// Mapeia o DTO de entrada (snake_case) para o input do use case (camelCase).
// Compartilhado entre criar (1 item) e criarLote (N itens).
function dtoParaInput(dto: CriarProdutoDto): CriarProdutoInput {
  return {
    idErp: dto.id_erp_produto,
    codigoErp: dto.codigo_erp,
    categoria: dto.categoria,
    familia: dto.familia,
    colecao: dto.colecao,
    cor: dto.cor,
    tamanho: dto.tamanho,
    tipoPedra: dto.tipo_pedra,
    colecaoPedra: dto.colecao_pedra,
    referenciaFornecedor: dto.referencia_fornecedor,
    descricaoEtiqueta: dto.descricao_etiqueta,
    pesoGramas: dto.peso_gramas,
    unidade: dto.unidade,
    valorCompra: dto.valor_compra,
    valorCusto: dto.valor_custo,
    margemPercentual: dto.margem_percentual,
    valorVenda: dto.valor_venda,
    observacao: dto.observacao,
    fotoUrl: dto.foto_url,
    // `estoque_atual` NAO passa: o saldo e a tabela `estoque` — ver o DTO.
    dataEntradaEstoque: dto.data_entrada_estoque
      ? new Date(dto.data_entrada_estoque)
      : null,
  };
}
