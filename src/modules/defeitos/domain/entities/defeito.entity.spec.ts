import { Defeito } from './defeito.entity';

/**
 * OS NOMES NA LINHA DA OCORRENCIA — 23/09/2026.
 *
 * ==========================================================================
 * O CASO REAL: o Lucas registrou uma ocorrencia e a coluna Produto mostrou
 *
 *     36802054…
 *
 * Foi procurar a peca por isso e nao achou — porque nao e codigo de coisa
 * nenhuma: sao os 8 primeiros caracteres do UUID interno. A peca era a
 * CA25129, "ANEL OURO 24K YEAH".
 *
 * Doi mais aqui do que em outra tela: a ocorrencia existe para ser PROVA
 * meses depois, e um identificador que ninguem consegue pesquisar nem falar
 * derruba boa parte disso.
 * ==========================================================================
 */
describe('Defeito — os nomes de exibicao', () => {
  const base = {
    produtoId: '36802054-8e67-45f2-a34b-f32f8eae72be',
    tipo: 'RECLAMACAO' as const,
    descricao: 'Joia descascando',
    data: new Date(2026, 8, 22),
  };

  it('carrega codigo, descricao e nome quando a consulta os traz', () => {
    const d = Defeito.create({
      ...base,
      clienteId: 'uuid-cliente',
      produtoCodigo: 'CA25129',
      produtoDescricao: 'ANEL OURO 24K YEAH',
      clienteNome: 'Teste cod',
    });

    expect(d.produtoCodigo).toBe('CA25129');
    expect(d.produtoDescricao).toBe('ANEL OURO 24K YEAH');
    expect(d.clienteNome).toBe('Teste cod');
  });

  /**
   * SAO CAMPOS DE LEITURA: so a listagem os preenche. Criar, atualizar e
   * qualquer outro caminho seguem sem eles, e isso nao pode quebrar nada.
   */
  it('sem eles, nascem nulos — e a ocorrencia continua valida', () => {
    const d = Defeito.create(base);

    expect(d.produtoCodigo).toBeNull();
    expect(d.produtoDescricao).toBeNull();
    expect(d.clienteNome).toBeNull();
    expect(d.produtoId).toBe(base.produtoId);
  });

  /**
   * O JOIN e LEFT dos dois lados. Produto apagado deixa os nomes nulos e a
   * OCORRENCIA FICA — ela existe justamente para sobreviver a peca, e a foto
   * dela e a prova que atravessa o tempo. Com INNER, apagar a peca apagaria a
   * prova da tela.
   */
  it('peca apagada nao leva a ocorrencia junto', () => {
    const d = Defeito.create({ ...base, produtoCodigo: null, produtoDescricao: null });

    expect(d.produtoCodigo).toBeNull();
    expect(d.id).toBeUndefined();
    expect(d.descricao).toBe('Joia descascando');
  });

  /** Ocorrencia sem cliente e estado legitimo — a ESTOQUISTA registra assim. */
  it('sem cliente, nome nulo e clienteId nulo', () => {
    const d = Defeito.create(base);

    expect(d.clienteId).toBeNull();
    expect(d.clienteNome).toBeNull();
  });
});
