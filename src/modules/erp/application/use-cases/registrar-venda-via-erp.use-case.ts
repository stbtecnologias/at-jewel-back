import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../../clientes/domain/ports/repositories/cliente-repository.port';
import { ItemVenda } from '../../../vendas/domain/entities/item-venda.entity';
import { PagamentoVenda } from '../../../vendas/domain/entities/pagamento-venda.entity';
import {
  Venda,
  VendaInvalidaError,
} from '../../../vendas/domain/entities/venda.entity';
import type {
  FormaPagamento,
  StatusVenda,
} from '../../../vendas/domain/entities/enums';
import { VENDA_REPOSITORY } from '../../../vendas/domain/ports/injection-tokens';
import type { IVendaRepository } from '../../../vendas/domain/ports/repositories/venda-repository.port';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import {
  ERP_EVENTO_REPOSITORY,
  PRODUTO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IErpEventoRepository } from '../../domain/ports/repositories/erp-evento-repository.port';
import type { IProdutoRepository } from '../../domain/ports/repositories/produto-repository.port';

export interface RegistrarVendaViaErpItemInput {
  codigoErpItem?: string | null;
  produtoCodigoErp?: string | null;
  quantidade: number;
  valorUnitario: number;
  valorCustoUnitario?: number | null;
  valorDescontoItem?: number;
  valorTotalItem: number;
}

export interface RegistrarVendaViaErpPagamentoInput {
  formaPagamento: FormaPagamento;
  valor: number;
  parcelas?: number;
  valorParcela?: number | null;
  bandeira?: string | null;
  dataPagamento?: Date | null;
}

export interface RegistrarVendaViaErpInput {
  eventoId: string;
  codigoErp: string;
  clienteCodigoErp?: string | null;
  vendedoraCodigoErp?: string | null;
  dataVenda: Date;
  dataContato?: Date | null;
  valorBruto: number;
  valorDesconto?: number;
  valorTotal: number;
  status?: StatusVenda;
  observacao?: string | null;
  itens: RegistrarVendaViaErpItemInput[];
  pagamentos: RegistrarVendaViaErpPagamentoInput[];
}

export interface RegistrarVendaViaErpOutput {
  idempotente: boolean;
}

@Injectable()
export class RegistrarVendaViaErpUseCase {
  private readonly logger = new Logger(RegistrarVendaViaErpUseCase.name);

  constructor(
    @Inject(VENDA_REPOSITORY)
    private readonly vendaRepo: IVendaRepository,
    @Inject(ERP_EVENTO_REPOSITORY)
    private readonly eventoRepo: IErpEventoRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoraRepo: IVendedoraRepository,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtoRepo: IProdutoRepository,
  ) {}

  async execute(
    input: RegistrarVendaViaErpInput,
  ): Promise<RegistrarVendaViaErpOutput> {
    // Idempotencia da ingestao: cada evento do ERP e processado uma unica vez.
    const jaProcessado = await this.eventoRepo.jaProcessado(input.eventoId);
    if (jaProcessado) {
      return { idempotente: true };
    }

    // Resolucao de FKs por codigo_erp. LIMITACAO DE ORDENACAO DE SYNC: o ERP
    // pode enviar uma venda antes de o cliente/vendedora/produto referenciado
    // ter sido sincronizado. Nesse caso persistimos a FK como NULL (as FKs do
    // schema 09 sao ON DELETE SET NULL justamente para tolerar isso) e
    // registramos um aviso. NAO bloqueamos a venda. PENDENCIA: um job de
    // reconciliacao poderia, no futuro, re-vincular FKs nulas quando a
    // entidade ausente for sincronizada.
    const clienteId = await this.resolverClienteId(input.clienteCodigoErp);
    const vendedoraId = await this.resolverVendedoraId(
      input.vendedoraCodigoErp,
    );

    const itens: ItemVenda[] = [];
    for (const i of input.itens) {
      const produtoId = await this.resolverProdutoId(i.produtoCodigoErp);
      itens.push(
        ItemVenda.create({
          produtoId,
          codigoErpItem: i.codigoErpItem ?? null,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          valorCustoUnitario: i.valorCustoUnitario ?? null,
          valorDescontoItem: i.valorDescontoItem ?? 0,
          valorTotalItem: i.valorTotalItem,
        }),
      );
    }

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
      codigoErp: input.codigoErp,
      clienteId,
      vendedoraId,
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

    // Mesma regra de dominio do registro manual (RegistrarVendaUseCase):
    // a validacao de invariantes vive na entidade Venda.
    try {
      venda.validarInvariantes();
    } catch (erro) {
      if (erro instanceof VendaInvalidaError) {
        throw new BadRequestException(erro.message);
      }
      throw erro;
    }

    // Upsert por codigo_erp: o ERP pode reenviar a venda atualizada (ex.:
    // cancelamento). Substitui o agregado em uma transacao.
    await this.vendaRepo.upsertByCodigoErp(venda);

    await this.eventoRepo.marcarComoProcessado(input.eventoId, 'VENDA');

    return { idempotente: false };
  }

  private async resolverClienteId(
    codigoErp?: string | null,
  ): Promise<string | null> {
    if (!codigoErp) return null;
    const cliente = await this.clienteRepo.buscarPorCodigoErp(codigoErp);
    if (!cliente?.id) {
      // Nao logar nome/PII do cliente: apenas o codigo_erp (identificador
      // operacional, nao PII).
      this.logger.warn(
        `Cliente codigo_erp=${codigoErp} nao encontrado ao sincronizar venda; FK cliente_id sera NULL`,
      );
      return null;
    }
    return cliente.id;
  }

  private async resolverVendedoraId(
    codigoErp?: string | null,
  ): Promise<string | null> {
    if (!codigoErp) return null;
    const vendedora = await this.vendedoraRepo.buscarPorCodigoErp(codigoErp);
    if (!vendedora?.id) {
      this.logger.warn(
        `Vendedora codigo_erp=${codigoErp} nao encontrada ao sincronizar venda; FK vendedora_id sera NULL`,
      );
      return null;
    }
    return vendedora.id;
  }

  private async resolverProdutoId(
    codigoErp?: string | null,
  ): Promise<string | null> {
    if (!codigoErp) return null;
    const produto = await this.produtoRepo.findByCodigoErp(codigoErp);
    if (!produto?.id) {
      this.logger.warn(
        `Produto codigo_erp=${codigoErp} nao encontrado ao sincronizar venda; FK produto_id do item sera NULL`,
      );
      return null;
    }
    return produto.id;
  }
}
