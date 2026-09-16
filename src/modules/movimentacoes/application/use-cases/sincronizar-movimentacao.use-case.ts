import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { dataDoErp } from '../../../../shared/erp/data-do-erp';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';
import { MovimentacaoItem } from '../../domain/entities/movimentacao-item.entity';
import { MovimentacaoPagamento } from '../../domain/entities/movimentacao-pagamento.entity';
import { Movimentacao } from '../../domain/entities/movimentacao.entity';
import { MOVIMENTACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IMovimentacaoRepository } from '../../domain/ports/repositories/movimentacao-repository.port';
import {
  Entidade,
  Referencia,
  ResolverReferenciasErpService,
} from '../resolver-referencias-erp.service';

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
  /**
   * As pontas pelo NOSSO UUID — cliente, fornecedor ou empresa. Vencem os
   * `idErpEntidade*` e a deducao por entrada/saida.
   */
  idEntidadeOrigem?: string | null;
  idEntidadeDestino?: string | null;
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

    // AS PONTAS PELO NOSSO UUID, quando vierem — 16/09/2026. Cada uma pode ser
    // cliente, fornecedor ou empresa; o resolvedor procura nas tres e devolve o
    // TIPO. UUID que nao existe em nenhuma e 400.
    const [origem, destino] = await Promise.all([
      this.referencias.entidade(input.idEntidadeOrigem),
      this.referencias.entidade(input.idEntidadeDestino),
    ]);

    // O id do ERP da ponta vem de brinde quando so o UUID veio — a mesma regra
    // dos outros relacionamentos: a coluna-sombra continua preenchida.
    const brutoOrigem = normalizarIdErp(input.idErpEntidadeOrigem);
    const brutoDestino = normalizarIdErp(input.idErpEntidadeDestino);
    const entidadeOrigemIdErp = brutoOrigem ?? origem?.idErp ?? null;
    const entidadeDestinoIdErp = brutoDestino ?? destino?.idErp ?? null;

    const cliente = await this.clienteDaMovimentacao({
      entrada,
      saida,
      origem,
      destino,
      brutoOrigem,
      brutoDestino,
    });

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
      entidadeOrigemId: origem?.id ?? null,
      entidadeDestinoId: destino?.id ?? null,
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

  /**
   * O cliente da movimentacao, pelas duas vias.
   *
   * 1. PELO UUID: o TIPO decide. A ponta que e cliente e o cliente — sem
   *    depender do sentido. So se as duas forem cliente, o que nao deveria
   *    acontecer, o sentido desempata.
   *
   * 2. PELO ID DO ERP, deduzindo por entrada/saida, como sempre foi — mas SO
   *    na ponta que nao veio por UUID. Ponta que veio por UUID e nao e cliente
   *    (fornecedor, empresa) ja respondeu: nao e. Procurar o id do ERP dela em
   *    `clientes` gravaria o codigo de um fornecedor na coluna-sombra do
   *    cliente.
   */
  private async clienteDaMovimentacao(p: {
    entrada: boolean;
    saida: boolean;
    origem: Entidade | null;
    destino: Entidade | null;
    brutoOrigem: string | null;
    brutoDestino: string | null;
  }): Promise<Referencia> {
    const o = p.origem?.tipo === 'cliente' ? p.origem : null;
    const d = p.destino?.tipo === 'cliente' ? p.destino : null;
    const pelasPontas = o && d ? (p.entrada && !p.saida ? o : d) : (o ?? d);
    if (pelasPontas) {
      return { id: pelasPontas.id, idErp: pelasPontas.idErp };
    }

    const candidato = Movimentacao.pontaDoTerceiro({
      entrada: p.entrada,
      saida: p.saida,
      entidadeOrigemIdErp: p.origem ? null : p.brutoOrigem,
      entidadeDestinoIdErp: p.destino ? null : p.brutoDestino,
    });
    return this.referencias.cliente(candidato);
  }
}
