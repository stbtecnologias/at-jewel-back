import { BadRequestException } from '@nestjs/common';
import { Movimentacao } from '../../domain/entities/movimentacao.entity';
import { IMovimentacaoRepository } from '../../domain/ports/repositories/movimentacao-repository.port';
import { ResolverReferenciasErpService } from '../resolver-referencias-erp.service';
import {
  SincronizarMovimentacaoInput,
  SincronizarMovimentacaoUseCase,
} from './sincronizar-movimentacao.use-case';

function makeRepoMock(): jest.Mocked<IMovimentacaoRepository> {
  return {
    sincronizar: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorIdErp: jest.fn(),
    listar: jest.fn(),
  } as unknown as jest.Mocked<IMovimentacaoRepository>;
}

/**
 * Resolver que NAO acha nada — o cenario normal, nao o excepcional. O dump
 * mostra cliente e vendedor criados no ato da venda; o documento chega antes
 * do cadastro o tempo todo.
 */
function resolverQueNaoAcha(): ResolverReferenciasErpService {
  const nada = jest.fn(async (bruto: unknown) => ({
    id: null,
    idErp:
      bruto === null || bruto === undefined || String(bruto).trim() === ''
        ? null
        : String(bruto).trim().replace(/^0+(?=\d)/, ''),
  }));
  return {
    operacao: nada,
    empresa: nada,
    grupoEstoque: nada,
    cliente: nada,
    vendedora: nada,
    produto: nada,
    formaPagamento: nada,
  } as unknown as ResolverReferenciasErpService;
}

function resolverQueAcha(id: string): ResolverReferenciasErpService {
  const acha = jest.fn(async (bruto: unknown) => ({
    id: bruto ? id : null,
    idErp: bruto ? String(bruto).trim() : null,
  }));
  return {
    operacao: acha,
    empresa: acha,
    grupoEstoque: acha,
    cliente: acha,
    vendedora: acha,
    produto: acha,
    formaPagamento: acha,
  } as unknown as ResolverReferenciasErpService;
}

/** A movimentacao 1300775 do dump: VENDA de R$ 20.930, um item, uma parcela. */
function vendaDoDump(
  over: Partial<SincronizarMovimentacaoInput> = {},
): SincronizarMovimentacaoInput {
  return {
    idErpMovimentacao: '     1300775',
    numero: 1120,
    dataMovimentacao: '2026-08-05T12:51:22',
    idErpOperacao: 9000000323,
    idErpEmpresa: 9000000002,
    idErpGrupoOrigem: 9000000458,
    idErpGrupoDestino: 9000000456,
    idErpEntidadeOrigem: 9000000018,
    idErpEntidadeDestino: 2397,
    idErpVendedora: 9602,
    valor: 20930,
    entrada: false,
    saida: true,
    itens: [
      { nItem: 1, idErpItem: '1300775', idErpProduto: 1221572, quantidade: 1, valorUnitario: 20930 },
    ],
    // O ERP mandou UMA parcela de 10.465 para uma venda de 20.930 — metade.
    pagamentos: [
      { idErpPagamento: '1300775', idErpFormaPagamento: 9000000516, valor: 10465 },
    ],
    ...over,
  };
}

describe('SincronizarMovimentacaoUseCase', () => {
  let repo: jest.Mocked<IMovimentacaoRepository>;

  /** Devolve a movimentacao que o use case MANDOU gravar. */
  function gravada(): Movimentacao {
    expect(repo.sincronizar).toHaveBeenCalledTimes(1);
    return repo.sincronizar.mock.calls[0][0];
  }

  function comResolver(
    resolver: ResolverReferenciasErpService,
  ): SincronizarMovimentacaoUseCase {
    return new SincronizarMovimentacaoUseCase(repo, resolver);
  }

  beforeEach(() => {
    repo = makeRepoMock();
    repo.sincronizar.mockImplementation(async (mov) => ({ mov, criada: true }));
  });

  describe('o documento e espelho: nada e recusado por regra de negocio', () => {
    // A entidade `Venda` exige SUM(pagamentos) = valor_total. Nas 24
    // movimentacoes do dump isso e falso em 14 de 18 vendas. Se o invariante
    // valesse aqui, a maior parte do que o ERP manda seria recusada.
    it('deve aceitar venda cujos pagamentos nao fecham o total', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      const mov = gravada();
      expect(mov.valor).toBe(20930);
      expect(mov.totalDosPagamentos).toBe(10465);
    });

    // Oito das 24 movimentacoes do dump nao tem pagamento nenhum: as 6
    // devolucoes e as vendas 1311720 e 1323919.
    it('deve aceitar documento sem pagamento nenhum', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump({ pagamentos: [] }));

      expect(gravada().pagamentos).toHaveLength(0);
    });

    it('deve aceitar documento sem item nenhum', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump({ itens: undefined }));

      expect(gravada().itens).toHaveLength(0);
    });

    it('deve aceitar valor negativo, que e estorno e nao erro', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump({ valor: -20930 }));

      expect(gravada().valor).toBe(-20930);
    });
  });

  describe('colunas-sombra: o id do ERP nunca se perde', () => {
    // O defeito que `/erp/vendas` tem hoje: nao acha o cadastro, grava FK
    // nula, loga um warning e devolve 200 — o id some e so um reenvio traz de
    // volta.
    it('deve gravar o id do ERP mesmo sem conseguir resolver a FK', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      const mov = gravada();
      expect(mov.operacaoId).toBeNull();
      expect(mov.operacaoIdErp).toBe('9000000323');
      expect(mov.vendedoraId).toBeNull();
      expect(mov.vendedoraIdErp).toBe('9602');
      expect(mov.empresaIdErp).toBe('9000000002');
      expect(mov.grupoOrigemIdErp).toBe('9000000458');
      expect(mov.grupoDestinoIdErp).toBe('9000000456');
    });

    it('deve gravar o id do ERP do produto no item que nao resolveu', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      const item = gravada().itens[0];
      expect(item.produtoId).toBeNull();
      expect(item.produtoIdErp).toBe('1221572');
    });

    it('deve preencher a FK quando o cadastro existe', async () => {
      const useCase = comResolver(resolverQueAcha('uuid-resolvido'));
      await useCase.execute(vendaDoDump());

      const mov = gravada();
      expect(mov.operacaoId).toBe('uuid-resolvido');
      expect(mov.vendedoraId).toBe('uuid-resolvido');
      expect(mov.itens[0].produtoId).toBe('uuid-resolvido');
    });

    // `id_mesti` e `id_recf` repetem dentro do documento — sao o id do
    // documento, nao o da linha. Guardados como atributo, nunca como chave.
    it('deve guardar o id repetido do ERP como atributo da linha', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      const mov = gravada();
      expect(mov.itens[0].idErp).toBe('1300775');
      expect(mov.pagamentos[0].idErp).toBe('1300775');
      expect(mov.itens[0].nItem).toBe(1);
    });
  });

  describe('qual das pontas e o cliente', () => {
    // Saida: a peca sai da casa, entao o terceiro esta no DESTINO.
    it('deve tomar o destino como cliente numa venda', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      const mov = gravada();
      expect(mov.clienteIdErp).toBe('2397');
      expect(mov.entidadeOrigemIdErp).toBe('9000000018');
      expect(mov.entidadeDestinoIdErp).toBe('2397');
    });

    // Entrada: a peca volta, entao o terceiro esta na ORIGEM. E a DVE 1300778
    // do dump: origem 2391, destino 9000000018 (a loja).
    it('deve tomar a origem como cliente numa devolucao', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(
        vendaDoDump({
          entrada: true,
          saida: false,
          idErpEntidadeOrigem: 2391,
          idErpEntidadeDestino: 9000000018,
        }),
      );

      expect(gravada().clienteIdErp).toBe('2391');
    });

    // Transferencia entre empresas nao tem terceiro. Adivinhar uma ponta poria
    // o codigo de outra empresa do grupo no campo de cliente.
    it('deve deixar o cliente vazio quando o sentido nao esta definido', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump({ entrada: false, saida: false }));

      const mov = gravada();
      expect(mov.clienteIdErp).toBeNull();
      // As duas pontas continuam gravadas cruas.
      expect(mov.entidadeOrigemIdErp).toBe('9000000018');
      expect(mov.entidadeDestinoIdErp).toBe('2397');
    });
  });

  describe('normalizacao da entrada', () => {
    it('deve canonicalizar o id do documento, tirando o padding de espacos', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      expect(gravada().idErp).toBe('1300775');
    });

    // A data chega sem fuso. Lida como UTC pelo container, a venda anda 3h.
    it('deve ler a data como hora de parede da loja', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await useCase.execute(vendaDoDump());

      expect(gravada().dataMovimentacao.toISOString()).toBe(
        '2026-08-05T15:51:22.000Z',
      );
    });
  });

  describe('recusa — os dois unicos casos, ambos por impossibilidade', () => {
    it('deve recusar sem id do ERP: nao ha chave de idempotencia', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await expect(
        useCase.execute(vendaDoDump({ idErpMovimentacao: '   ' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.sincronizar).not.toHaveBeenCalled();
    });

    it('deve recusar sem data valida: a coluna e NOT NULL', async () => {
      const useCase = comResolver(resolverQueNaoAcha());
      await expect(
        useCase.execute(vendaDoDump({ dataMovimentacao: 'ontem' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.sincronizar).not.toHaveBeenCalled();
    });
  });
});
