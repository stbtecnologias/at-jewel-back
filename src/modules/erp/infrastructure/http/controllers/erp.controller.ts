import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AtualizarProdutoViaErpUseCase } from '../../../application/use-cases/atualizar-produto-via-erp.use-case';
import { RegistrarVendaViaErpUseCase } from '../../../application/use-cases/registrar-venda-via-erp.use-case';
import { SafiraAuthGuard } from '../guards/safira-auth.guard';
import { ErpProdutoDto } from '../dto/erp-produto.dto';
import { ErpVendaDto } from '../dto/erp-venda.dto';

@Controller('erp')
@UseGuards(SafiraAuthGuard)
export class ErpController {
  constructor(
    private readonly atualizarProdutoUseCase: AtualizarProdutoViaErpUseCase,
    private readonly registrarVendaUseCase: RegistrarVendaViaErpUseCase,
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

  @Post('vendas')
  @HttpCode(HttpStatus.OK)
  async receberVenda(@Body() dto: ErpVendaDto) {
    const result = await this.registrarVendaUseCase.execute({
      eventoId: dto.evento_id,
      codigoErp: dto.codigo_erp,
      clienteCodigoErp: dto.cliente_codigo_erp,
      vendedoraCodigoErp: dto.vendedora_codigo_erp,
      dataVenda: new Date(dto.data_venda),
      dataContato: dto.data_contato ? new Date(dto.data_contato) : null,
      valorBruto: dto.valor_bruto,
      valorDesconto: dto.valor_desconto,
      valorTotal: dto.valor_total,
      status: dto.status,
      observacao: dto.observacao,
      itens: dto.itens.map((i) => ({
        codigoErpItem: i.codigo_erp_item,
        produtoCodigoErp: i.produto_codigo_erp,
        quantidade: i.quantidade,
        valorUnitario: i.valor_unitario,
        valorCustoUnitario: i.valor_custo_unitario,
        valorDescontoItem: i.valor_desconto_item,
        valorTotalItem: i.valor_total_item,
      })),
      pagamentos: dto.pagamentos.map((p) => ({
        formaPagamento: p.forma_pagamento,
        valor: p.valor,
        parcelas: p.parcelas,
        valorParcela: p.valor_parcela,
        bandeira: p.bandeira,
        dataPagamento: p.data_pagamento ? new Date(p.data_pagamento) : null,
      })),
    });

    return {
      ok: true,
      idempotente: result.idempotente,
    };
  }
}
