import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { FormaPagamento, StatusVenda } from '../../domain/entities/enums';
import { ItemVenda } from '../../domain/entities/item-venda.entity';
import { PagamentoVenda } from '../../domain/entities/pagamento-venda.entity';
import {
  Venda,
  VendaInvalidaError,
} from '../../domain/entities/venda.entity';
import { VENDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendaRepository } from '../../domain/ports/repositories/venda-repository.port';

export interface ItemVendaInput {
  produtoId?: string | null;
  codigoErpItem?: string | null;
  quantidade: number;
  valorUnitario: number;
  valorCustoUnitario?: number | null;
  valorDescontoItem?: number;
  valorTotalItem: number;
}

export interface PagamentoVendaInput {
  formaPagamento: FormaPagamento;
  valor: number;
  parcelas?: number;
  valorParcela?: number | null;
  bandeira?: string | null;
  dataPagamento?: Date | null;
}

export interface RegistrarVendaInput {
  codigoErp?: string | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
  dataVenda: Date;
  dataContato?: Date | null;
  valorBruto: number;
  valorDesconto?: number;
  valorTotal: number;
  status?: StatusVenda;
  observacao?: string | null;
  itens: ItemVendaInput[];
  pagamentos: PagamentoVendaInput[];
}

@Injectable()
export class RegistrarVendaUseCase {
  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
  ) {}

  async execute(input: RegistrarVendaInput): Promise<Venda> {
    const itens = input.itens.map((i) =>
      ItemVenda.create({
        produtoId: i.produtoId ?? null,
        codigoErpItem: i.codigoErpItem ?? null,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        valorCustoUnitario: i.valorCustoUnitario ?? null,
        valorDescontoItem: i.valorDescontoItem ?? 0,
        valorTotalItem: i.valorTotalItem,
      }),
    );

    const pagamentos = input.pagamentos.map((p) =>
      PagamentoVenda.create({
        formaPagamento: p.formaPagamento,
        valor: p.valor,
        parcelas: p.parcelas ?? 1,
        valorParcela: p.valorParcela ?? null,
        bandeira: p.bandeira ?? null,
        dataPagamento: p.dataPagamento ?? null,
      }),
    );

    const venda = Venda.create({
      codigoErp: input.codigoErp ?? null,
      clienteId: input.clienteId ?? null,
      vendedoraId: input.vendedoraId ?? null,
      dataVenda: input.dataVenda,
      dataContato: input.dataContato ?? null,
      valorBruto: input.valorBruto,
      valorDesconto: input.valorDesconto ?? 0,
      valorTotal: input.valorTotal,
      status: input.status ?? 'concluida',
      observacao: input.observacao ?? null,
      ativo: true,
      itens,
      pagamentos,
    });

    // Invariantes monetarias e estruturais sao regra de dominio, vivem na
    // entidade Venda e sao compartilhadas com a ingestao via ERP.
    try {
      venda.validarInvariantes();
    } catch (erro) {
      if (erro instanceof VendaInvalidaError) {
        throw new BadRequestException(erro.message);
      }
      throw erro;
    }

    // Idempotencia: nao duplicar venda ja sincronizada do ERP.
    if (input.codigoErp) {
      const existente = await this.vendaRepo.buscarPorCodigoErp(input.codigoErp);
      if (existente) {
        throw new ConflictException('Venda com este codigo ERP ja registrada');
      }
    }

    return this.vendaRepo.criarComAgregado(venda);
  }
}
