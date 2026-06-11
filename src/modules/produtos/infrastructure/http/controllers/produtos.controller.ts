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
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { JwtOrApiKeyGuard } from '../../../../auth/infrastructure/http/guards/jwt-or-api-key.guard';
import { AtualizarProdutoUseCase } from '../../../application/use-cases/atualizar-produto.use-case';
import { BuscarProdutoUseCase } from '../../../application/use-cases/buscar-produto.use-case';
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
    private readonly criarProduto: CriarProdutoUseCase,
    private readonly criarProdutosLote: CriarProdutosLoteUseCase,
    private readonly atualizarProduto: AtualizarProdutoUseCase,
    private readonly removerProduto: RemoverProdutoUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @RequireScopes('produtos:read')
  async listar(@Query() filtros: FiltroProdutoDto) {
    return this.listarProdutos.execute(filtros);
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
  };
}
