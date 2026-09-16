import { MovimentacaoItem } from './movimentacao-item.entity';
import { MovimentacaoPagamento } from './movimentacao-pagamento.entity';
import { Movimentacao } from './movimentacao.entity';

/**
 * O FORMATO DA RESPOSTA — decisão do Lucas em 16/09/2026.
 *
 * Os `*IdErp` de relacionamento (empresa, vendedora, produto…) saíram do
 * retorno: com o nosso UUID ali, eram repetição, e vinham com os zeros à
 * esquerda do cadastro. Eles CONTINUAM gravados — só deixaram de ser contrato.
 *
 * O que fica são os ids do PRÓPRIO documento, com que o integrador reenvia e
 * confere a linha dele.
 */
describe('Movimentacao.toPublic — o que a API devolve', () => {
  const movimentacao = Movimentacao.create({
    id: 'mov-1',
    idErp: '1300775',
    dataMovimentacao: new Date('2026-08-05T15:51:22Z'),
    operacaoId: 'op-uuid',
    operacaoIdErp: '9000000323',
    empresaId: 'emp-uuid',
    empresaIdErp: '009000000002',
    grupoOrigemId: 'go-uuid',
    grupoOrigemIdErp: '009000000458',
    grupoDestinoId: 'gd-uuid',
    grupoDestinoIdErp: '009000000456',
    entidadeOrigemIdErp: '9000000018',
    entidadeDestinoIdErp: '2397',
    entidadeOrigemId: 'eo-uuid',
    entidadeDestinoId: 'ed-uuid',
    clienteId: 'cli-uuid',
    clienteIdErp: '2397',
    vendedoraId: 'vend-uuid',
    vendedoraIdErp: '000000009602',
    valor: 20930,
    itens: [
      MovimentacaoItem.create({
        nItem: 1,
        idErp: '1300775',
        produtoId: 'prod-uuid',
        produtoIdErp: '000001221572',
        quantidade: 1,
        valorUnitario: 20930,
      }),
    ],
    pagamentos: [
      MovimentacaoPagamento.create({
        idErp: '1300775',
        formaPagamentoId: 'fp-uuid',
        formaPagamentoIdErp: '009000000516',
        valor: 10465,
        debitoCredito: 'D',
      }),
    ],
  });

  const publico = movimentacao.toPublic();
  const item = (publico.itens as Record<string, unknown>[])[0];
  const pagamento = (publico.pagamentos as Record<string, unknown>[])[0];

  it('NAO devolve os id do ERP dos relacionamentos', () => {
    for (const campo of [
      'operacaoIdErp',
      'empresaIdErp',
      'grupoOrigemIdErp',
      'grupoDestinoIdErp',
      'entidadeOrigemIdErp',
      'entidadeDestinoIdErp',
      'clienteIdErp',
      'vendedoraIdErp',
    ]) {
      expect(publico).not.toHaveProperty(campo);
    }
    expect(item).not.toHaveProperty('produtoIdErp');
    expect(pagamento).not.toHaveProperty('formaPagamentoIdErp');
  });

  it('devolve os nossos UUIDs dos relacionamentos', () => {
    expect(publico).toMatchObject({
      operacaoId: 'op-uuid',
      empresaId: 'emp-uuid',
      grupoOrigemId: 'go-uuid',
      grupoDestinoId: 'gd-uuid',
      clienteId: 'cli-uuid',
      vendedoraId: 'vend-uuid',
      entidadeOrigemId: 'eo-uuid',
      entidadeDestinoId: 'ed-uuid',
    });
    expect(item.produtoId).toBe('prod-uuid');
    expect(pagamento.formaPagamentoId).toBe('fp-uuid');
  });

  it('MANTEM os ids do proprio documento, com que o integrador reenvia', () => {
    expect(publico.idErpMovimentacao).toBe('1300775');
    expect(item.idErpItem).toBe('1300775');
    expect(pagamento.idErpPagamento).toBe('1300775');
  });
});
