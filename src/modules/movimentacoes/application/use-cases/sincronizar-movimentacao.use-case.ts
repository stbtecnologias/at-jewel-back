import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { dataDoErp } from '../../../../shared/erp/data-do-erp';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';
import { MovimentacaoItem } from '../../domain/entities/movimentacao-item.entity';
import { MovimentacaoPagamento } from '../../domain/entities/movimentacao-pagamento.entity';
import { Movimentacao } from '../../domain/entities/movimentacao.entity';
import { MOVIMENTACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMovimentacaoRepository } from '../../domain/ports/repositories/movimentacao-repository.port';
import { ResolverReferenciasErpService } from '../resolver-referencias-erp.service';

export interface ItemMovimentacaoInput {
  nItem: number;
  idErpItem?: string | number | null;
  idErpProduto?: string | number | null;
  quantidade: number;
  valorUnitario: number;
  ativo?: boolean;
}

export interface PagamentoMovimentacaoInput {
  idErpPagamento?: string | number | null;
  nParcela?: number | null;
  idErpFormaPagamento?: string | number | null;
  valor: number;
  debitoCredito?: 'D' | 'C';
  ativo?: boolean;
}

export interface SincronizarMovimentacaoInput {
  idErpMovimentacao: string | number;
  numero?: number | null;
  dataMovimentacao: string;
  idErpOperacao?: string | number | null;
  idErpEmpresa?: string | number | null;
  idErpGrupoOrigem?: string | number | null;
  idErpGrupoDestino?: string | number | null;
  idErpEntidadeOrigem?: string | number | null;
  idErpEntidadeDestino?: string | number | null;
  idErpVendedora?: string | number | null;
  valor: number;
  entrada?: boolean;
  saida?: boolean;
  ativo?: boolean;
  itens?: ItemMovimentacaoInput[];
  pagamentos?: PagamentoMovimentacaoInput[];
}

export interface SincronizarMovimentacaoResultado {
  movimentacao: Movimentacao;
  criada: boolean;
}

/**
 * Ingestao de um documento do ERP Safira.
 *
 * ==========================================================================
 * ESTE USE CASE NAO JULGA O DOCUMENTO.
 *
 * Ele nao confere se a soma dos itens bate o cabecalho, nem se os pagamentos
 * fecham o total, nem se ha ao menos um item. Faz falta? Nao: as duas primeiras
 * conferencias sao verdadeiras nas 24 movimentacoes do dump para os itens e
 * FALSAS em 14 de 18 para os pagamentos — o ERP manda parcela lancada, nao
 * plano fechado.
 *
 * Recusar aqui faria o documento sumir. Um documento estranho guardado e um
 * problema visivel; um documento recusado e um buraco que so aparece quando
 * alguem for fechar o mes.
 *
 * As regras vivem na PROJECAO, que le daqui — e pode recusar sem perder nada.
 * ==========================================================================
 *
 * O QUE ELE RECUSA, e sao dois casos so, ambos por impossibilidade:
 *   - sem `idErpMovimentacao`, nao ha chave de idempotencia e o reenvio
 *     duplicaria o documento;
 *   - sem data valida, a coluna e NOT NULL e nao ha valor honesto a inventar.
 */
@Injectable()
export class SincronizarMovimentacaoUseCase {
  constructor(
    @Inject(MOVIMENTACAO_REPOSITORY)
    private readonly repo: IMovimentacaoRepository,
    private readonly referencias: ResolverReferenciasErpService,
  ) {}

  async execute(
    input: SincronizarMovimentacaoInput,
  ): Promise<SincronizarMovimentacaoResultado> {
    const idErp = normalizarIdErp(input.idErpMovimentacao);
    if (!idErp) {
      throw new BadRequestException(
        'idErpMovimentacao e obrigatorio — e a identidade do documento no ERP',
      );
    }

    // O ERP manda a data SEM FUSO. `dataDoErp` a le como hora de parede da
    // loja; sem isso, o container em UTC deslocaria toda venda em 3 horas e as
    // que chegam a meia-noite cairiam no dia anterior.
    const dataMovimentacao = dataDoErp(input.dataMovimentacao);
    if (!dataMovimentacao) {
      throw new BadRequestException(
        `dataMovimentacao invalida: ${String(input.dataMovimentacao)}`,
      );
    }

    const entrada = input.entrada ?? false;
    const saida = input.saida ?? false;

    const [operacao, empresa, grupoOrigem, grupoDestino, vendedora] =
      await Promise.all([
        this.referencias.operacao(input.idErpOperacao),
        this.referencias.empresa(input.idErpEmpresa),
        this.referencias.grupoEstoque(input.idErpGrupoOrigem),
        this.referencias.grupoEstoque(input.idErpGrupoDestino),
        this.referencias.vendedora(input.idErpVendedora),
      ]);

    const entidadeOrigemIdErp = normalizarIdErp(input.idErpEntidadeOrigem);
    const entidadeDestinoIdErp = normalizarIdErp(input.idErpEntidadeDestino);

    // Qual das duas pontas e o terceiro — regra do dominio, ver a entidade.
    const candidatoCliente = Movimentacao.pontaDoTerceiro({
      entrada,
      saida,
      entidadeOrigemIdErp,
      entidadeDestinoIdErp,
    });
    const cliente = await this.referencias.cliente(candidatoCliente);

    const itens = await Promise.all(
      (input.itens ?? []).map(async (i) => {
        const produto = await this.referencias.produto(i.idErpProduto);
        return MovimentacaoItem.create({
          nItem: i.nItem,
          idErp: normalizarIdErp(i.idErpItem),
          produtoId: produto.id,
          produtoIdErp: produto.idErp,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          ativo: i.ativo ?? true,
        });
      }),
    );

    const pagamentos = await Promise.all(
      (input.pagamentos ?? []).map(async (p) => {
        const forma = await this.referencias.formaPagamento(
          p.idErpFormaPagamento,
        );
        return MovimentacaoPagamento.create({
          idErp: normalizarIdErp(p.idErpPagamento),
          nParcela: p.nParcela ?? null,
          formaPagamentoId: forma.id,
          formaPagamentoIdErp: forma.idErp,
          valor: p.valor,
          debitoCredito: p.debitoCredito ?? 'D',
          ativo: p.ativo ?? true,
        });
      }),
    );

    const movimentacao = Movimentacao.create({
      idErp,
      numero: input.numero ?? null,
      dataMovimentacao,
      operacaoId: operacao.id,
      operacaoIdErp: operacao.idErp,
      empresaId: empresa.id,
      empresaIdErp: empresa.idErp,
      grupoOrigemId: grupoOrigem.id,
      grupoOrigemIdErp: grupoOrigem.idErp,
      grupoDestinoId: grupoDestino.id,
      grupoDestinoIdErp: grupoDestino.idErp,
      entidadeOrigemIdErp,
      entidadeDestinoIdErp,
      clienteId: cliente.id,
      clienteIdErp: cliente.idErp,
      vendedoraId: vendedora.id,
      vendedoraIdErp: vendedora.idErp,
      valor: input.valor,
      entrada,
      saida,
      ativo: input.ativo ?? true,
      itens,
      pagamentos,
    });

    const { mov, criada } = await this.repo.sincronizar(movimentacao);
    return { movimentacao: mov, criada };
  }
}
