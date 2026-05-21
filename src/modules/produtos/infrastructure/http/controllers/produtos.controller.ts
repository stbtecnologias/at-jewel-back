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
} from '@nestjs/common';
import { AtualizarProdutoUseCase } from '../../../application/use-cases/atualizar-produto.use-case';
import { BuscarProdutoUseCase } from '../../../application/use-cases/buscar-produto.use-case';
import { CriarProdutoUseCase } from '../../../application/use-cases/criar-produto.use-case';
import { ListarProdutosUseCase } from '../../../application/use-cases/listar-produtos.use-case';
import { RemoverProdutoUseCase } from '../../../application/use-cases/remover-produto.use-case';
import { AtualizarProdutoDto } from '../dto/atualizar-produto.dto';
import { CriarProdutoDto } from '../dto/criar-produto.dto';
import { FiltroProdutoDto } from '../dto/filtro-produto.dto';

@Controller('produtos')
export class ProdutosController {
  constructor(
    private readonly listarProdutos: ListarProdutosUseCase,
    private readonly buscarProduto: BuscarProdutoUseCase,
    private readonly criarProduto: CriarProdutoUseCase,
    private readonly atualizarProduto: AtualizarProdutoUseCase,
    private readonly removerProduto: RemoverProdutoUseCase,
  ) {}

  @Get()
  async listar(@Query() filtros: FiltroProdutoDto) {
    return this.listarProdutos.execute(filtros);
  }

  @Get(':id')
  async buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.buscarProduto.execute(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async criar(@Body() dto: CriarProdutoDto) {
    return this.criarProduto.execute({
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
    });
  }

  @Patch(':id')
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
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.removerProduto.execute(id);
  }
}
