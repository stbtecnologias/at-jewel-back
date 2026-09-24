import {
  ReferenciaInexistenteError,
  ResolverReferenciasErpService,
} from './resolver-referencias-erp.service';

/**
 * OS DOIS FORMATOS DE REFERENCIA — pedido do integrador em 15/09/2026.
 *
 * Ele pediu para mandar o NOSSO UUID no lugar do id do ERP, como ja faz em
 * `/estoque`. Os dois passam a valer, e o que estes testes protegem é a
 * diferença de rigor entre eles:
 *
 * 1. **pelo id do ERP**: não achar é NORMAL — o documento chega antes do
 *    cadastro, e o id cru fica gravado para religar depois;
 * 2. **pelo nosso UUID**: não achar é ERRO (400), porque aquele id só pode ter
 *    saído de uma consulta a esta API;
 * 3. **o UUID vence** quando os dois vêm;
 * 4. o `id_erp` do registro achado pelo UUID **vai junto**, para a
 *    coluna-sombra continuar preenchida nas duas formas.
 */
const UUID = '11111111-1111-1111-1111-111111111111';

function servico(repos: {
  porId?: jest.Mock;
  porIdErp?: jest.Mock;
}): ResolverReferenciasErpService {
  const repo = {
    buscarPorId: repos.porId ?? jest.fn().mockResolvedValue(null),
    buscarPorIdErp: repos.porIdErp ?? jest.fn().mockResolvedValue(null),
    findById: repos.porId ?? jest.fn().mockResolvedValue(null),
    findByIdErp: repos.porIdErp ?? jest.fn().mockResolvedValue(null),
  };
  return new ResolverReferenciasErpService(
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
    repo as never,
  );
}

describe('ResolverReferenciasErpService', () => {
  describe('pelo id do ERP — best-effort, como sempre foi', () => {
    it('acha e devolve o par id + idErp', async () => {
      const r = await servico({
        porIdErp: jest.fn().mockResolvedValue({ id: 'op-1', idErp: '9000' }),
      }).operacao(9000);

      expect(r).toEqual({ id: 'op-1', idErp: '9000' });
    });

    it('NAO achar nao e erro: o id cru fica guardado', async () => {
      // O documento chega antes do cadastro o tempo todo — ver o cabecalho da
      // classe. A FK fica nula e o id cru permite religar depois.
      const r = await servico({}).vendedora(9602);

      expect(r).toEqual({ id: null, idErp: '9602' });
    });

    it('normaliza os zeros a esquerda antes de procurar', async () => {
      const porIdErp = jest.fn().mockResolvedValue(null);
      await servico({ porIdErp }).produto('0000009602');

      expect(porIdErp).toHaveBeenCalledWith('9602');
    });

    it('sem id nenhum, nao procura nada', async () => {
      const porIdErp = jest.fn();
      const r = await servico({ porIdErp }).empresa(null);

      expect(r).toEqual({ id: null, idErp: null });
      expect(porIdErp).not.toHaveBeenCalled();
    });
  });

  describe('pelo nosso UUID — tem de existir', () => {
    it('acha e traz o id_erp do registro junto', async () => {
      const r = await servico({
        porId: jest.fn().mockResolvedValue({ id: UUID, idErp: '9000000323' }),
      }).operacao(null, UUID);

      // A coluna-sombra continua preenchida: documento mandado por UUID fica
      // tao rastreavel quanto os outros.
      expect(r).toEqual({ id: UUID, idErp: '9000000323' });
    });

    it('registro sem id do ERP (cadastrado pela tela) tambem vale', async () => {
      const r = await servico({
        porId: jest.fn().mockResolvedValue({ id: UUID, idErp: null }),
      }).vendedora(null, UUID);

      expect(r).toEqual({ id: UUID, idErp: null });
    });

    it('UUID que NAO existe e erro 400, e nao pendencia', async () => {
      await expect(servico({}).produto(null, UUID)).rejects.toBeInstanceOf(
        ReferenciaInexistenteError,
      );
    });

    it('o erro diz o campo e o id, para o integrador achar o que corrigir', async () => {
      await expect(servico({}).formaPagamento(null, UUID)).rejects.toThrow(
        `forma_pagamento ${UUID} nao existe`,
      );
    });
  });

  describe('quando vem os dois', () => {
    it('o UUID vence, e o id do ERP nem e consultado', async () => {
      const porIdErp = jest.fn();
      const porId = jest.fn().mockResolvedValue({ id: UUID, idErp: '9000' });

      const r = await servico({ porId, porIdErp }).grupoEstoque(
        '9000000458',
        UUID,
      );

      expect(r.id).toBe(UUID);
      expect(porIdErp).not.toHaveBeenCalled();
    });
  });
});

/**
 * A PONTA POLIMORFICA — 16/09/2026, com o local de estoque desde 24/09/2026.
 *
 * O UUID e procurado em clientes, fornecedores, empresas e LOCAIS DE ESTOQUE.
 * Cada teste deixa so uma das quatro achar, para provar que o TIPO devolvido e
 * o da tabela certa.
 *
 * O LOCAL ENTROU PORQUE O SAFIRA NAO SEPARA: o `entidadeidorigem` da loja e
 * `9000000018`, o mesmo numero do `id_erp` do local `ESTOQUE`. O integrador
 * mandava o UUID do local e tomava 400.
 */
describe('ResolverReferenciasErpService — entidade (a ponta pelo UUID)', () => {
  const ID = '22222222-2222-2222-2222-222222222222';

  function servicoComTres(achados: {
    cliente?: object;
    fornecedor?: object;
    empresa?: object;
    local?: object;
  }) {
    const vazio = { buscarPorId: jest.fn().mockResolvedValue(null) };
    const repo = (registro?: object) => ({
      buscarPorId: jest.fn().mockResolvedValue(registro ?? null),
    });
    // Ordem do construtor: operacoes, empresas, grupos, clientes, vendedoras,
    // produtos, formasPagamento, fornecedores, locais.
    return new ResolverReferenciasErpService(
      vazio as never,
      repo(achados.empresa) as never,
      vazio as never,
      repo(achados.cliente) as never,
      vazio as never,
      vazio as never,
      vazio as never,
      repo(achados.fornecedor) as never,
      repo(achados.local) as never,
    );
  }

  it('sem UUID devolve null — a ponta segue pelo id do ERP', async () => {
    expect(await servicoComTres({}).entidade(null)).toBeNull();
    expect(await servicoComTres({}).entidade(undefined)).toBeNull();
  });

  it.each([
    ['cliente', { cliente: { id: ID, idErp: '2397' } }],
    ['fornecedor', { fornecedor: { id: ID, idErp: '555' } }],
    ['empresa', { empresa: { id: ID, idErp: '9000000018' } }],
    ['local', { local: { id: ID, idErp: '9000000018' } }],
  ])('achado em %s, devolve o tipo certo e o id do ERP', async (tipo, achados) => {
    const r = await servicoComTres(achados).entidade(ID);

    expect(r).toEqual({
      id: ID,
      idErp: Object.values(achados)[0].idErp,
      tipo,
    });
  });

  /**
   * O CASO QUE MOTIVOU A MUDANCA, em 24/09/2026: o UUID do local `ESTOQUE`
   * chegando na ponta de ORIGEM de uma venda. Antes disto, 400.
   */
  it('o local de estoque resolve, e serve as DUAS pontas', async () => {
    const servico = servicoComTres({
      local: { id: ID, idErp: '9000000018' },
    });

    // E o mesmo metodo para origem e destino — a prova e que a chamada nao
    // sabe de qual ponta veio.
    await expect(servico.entidade(ID)).resolves.toMatchObject({ tipo: 'local' });
    await expect(servico.entidade(ID)).resolves.toMatchObject({ tipo: 'local' });
  });

  it('nao achado em nenhuma das quatro: 400, com o UUID na mensagem', async () => {
    await expect(servicoComTres({}).entidade(ID)).rejects.toThrow(
      `entidade ${ID} nao existe`,
    );
  });
});
