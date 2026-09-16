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
  idProduto?: string | null;
  quantidade: number;
  valorUnitario: number;
  ativo?: boolean;
}

export interface PagamentoMovimentacaoInput {
  idErpPagamento?: string | number | null;
  nParcela?: number | null;
  idErpFormaPagamento?: string | number | null;
  formaPagamentoId?: string | null;
  valor: number;
  debitoCredito?: 'D' | 'C';
  ativo?: boolean;
}

export interface SincronizarMovimentacaoInput {
  idErpMovimentacao: string | number;
  numero?: number | null;
  dataMovimentacao: string;
  idErpOperacao?: string | number | null;
  /** O nosso UUID, quando o integrador o tem. Vence o `idErp*` do mesmo campo. */
  idOperacao?: string | null;
  idErpEmpresa?: string | number | null;
  idEmpresa?: string | null;
  idErpGrupoOrigem?: string | number | null;
  idGrupoOrigem?: string | null;
  idErpGrupoDestino?: string | number | null;
  idGrupoDestino?: string | null;
  idErpEntidadeOrigem?: string | number | null;
  idErpEntidadeDestino?: string | number | null;
  idErpVendedora?: string | number | null;
  idVendedora?: string | null;
  /** O cliente direto, sem depender da deducao pelas duas pontas. */
  clienteId?: string | null;
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

    // OS DOIS FORMATOS, E O UUID VENCE — pedido do integrador em 15/09/2026,
    // para o payload de movimentacao ficar igual ao de `/estoque`. Ver
    // `ResolverReferenciasErpService.resolver`: o id do ERP segue best-effort,
    // e o nosso UUID, quando vem, tem de existir.
    const [operacao, empresa, grupoOrigem, grupoDestino, vendedora] =
      await Promise.all([
        this.referencias.operacao(input.idErpOperacao, input.idOperacao),
        this.referencias.empresa(input.idErpEmpresa, input.idEmpresa),
        this.referencias.grupoEstoque(
          input.idErpGrupoOrigem,
          input.idGrupoOrigem,
        ),
        this.referencias.grupoEstoque(
          input.idErpGrupoDestino,
          input.idGrupoDestino,
        ),
        this.referencias.vendedora(input.idErpVendedora, input.idVendedora),
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
    // O `clienteId` VENCE A DEDUCAO. As duas pontas sao polimorficas — uma e a
    // loja, a outra pode ser cliente ou fornecedor —, e um UUID solto nao diz
    // de qual tabela e. Quem quiser mandar o nosso id manda neste campo, que
    // ja diz; quem nao mandar continua caindo na regra de entrada/saida.
    const cliente = await this.referencias.cliente(
      candidatoCliente,
      input.clienteId,
    );

    const itens = await Promise.all(
      (input.itens ?? []).map(async (i) => {
        const produto = await this.referencias.produto(
          i.idErpProduto,
          i.idProduto,
        );
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
          p.formaPagamentoId,
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
