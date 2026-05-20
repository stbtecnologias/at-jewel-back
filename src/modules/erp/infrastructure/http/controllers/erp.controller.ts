import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AtualizarProdutoViaErpUseCase } from '../../../application/use-cases/atualizar-produto-via-erp.use-case';
import { SafiraAuthGuard } from '../guards/safira-auth.guard';
import { ErpProdutoDto } from '../dto/erp-produto.dto';

@Controller('erp')
@UseGuards(SafiraAuthGuard)
export class ErpController {
  constructor(
    private readonly atualizarProdutoUseCase: AtualizarProdutoViaErpUseCase,
  ) {}

  @Post('produtos')
  @HttpCode(HttpStatus.OK)
  async receberProduto(@Body() dto: ErpProdutoDto) {
    const result = await this.atualizarProdutoUseCase.execute({
      eventoId: dto.evento_id,
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

    return {
      ok: true,
      idempotente: result.idempotente,
    };
  }
}
