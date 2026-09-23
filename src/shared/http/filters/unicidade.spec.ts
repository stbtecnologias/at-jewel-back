import { ehViolacaoDeUnicidade, mensagemDeUnicidade, ErroDoDriver } from './unicidade';

/**
 * O CASO REAL QUE ORIGINOU ISTO — 23/09/2026.
 *
 * O Lucas cadastrou a peca C025109, que ja existia, e a tela mostrou:
 *
 *   duplicate key value violates unique constraint "produtos_codigo_erp_key"
 *
 * Em PRODUCAO seria pior: o filtro mascara erro desconhecido, entao a frase
 * viraria "Erro interno do servidor" — sem nenhuma pista de que bastava trocar
 * o codigo.
 */
function erro(constraint: string, detail?: string): ErroDoDriver {
  const e = new Error('duplicate key value violates unique constraint') as ErroDoDriver;
  e.code = '23505';
  e.constraint = constraint;
  e.detail = detail;
  return e;
}

/** Como o TypeORM entrega quando NAO copia os campos para cima. */
function erroEmbrulhado(constraint: string, detail?: string): ErroDoDriver {
  const e = new Error('QueryFailedError') as ErroDoDriver;
  e.driverError = { code: '23505', constraint, detail };
  return e;
}

describe('ehViolacaoDeUnicidade', () => {
  it('reconhece o 23505 no proprio erro', () => {
    expect(ehViolacaoDeUnicidade(erro('produtos_codigo_erp_key'))).toBe(true);
  });

  it('reconhece o 23505 dentro do driverError', () => {
    expect(ehViolacaoDeUnicidade(erroEmbrulhado('produtos_codigo_erp_key'))).toBe(true);
  });

  /** 23503 e chave estrangeira — outro assunto, e segue como esta. */
  it('nao confunde com outro erro de banco', () => {
    const e = new Error('violates foreign key') as ErroDoDriver;
    e.code = '23503';
    expect(ehViolacaoDeUnicidade(e)).toBe(false);
  });

  it('nao quebra com o que nao e Error', () => {
    expect(ehViolacaoDeUnicidade(null)).toBe(false);
    expect(ehViolacaoDeUnicidade('23505')).toBe(false);
    expect(ehViolacaoDeUnicidade(undefined)).toBe(false);
  });
});

describe('mensagemDeUnicidade', () => {
  it('o caso do Lucas: diz a peca E o codigo que colidiu', () => {
    const e = erro('produtos_codigo_erp_key', 'Key (codigo_erp)=(C025109) already exists.');
    expect(mensagemDeUnicidade(e)).toBe('Já existe uma peça com o código C025109.');
  });

  it('le o valor tambem quando vem embrulhado', () => {
    const e = erroEmbrulhado('produtos_codigo_erp_key', 'Key (codigo_erp)=(C025109) already exists.');
    expect(mensagemDeUnicidade(e)).toBe('Já existe uma peça com o código C025109.');
  });

  /**
   * O `detail` pode vir traduzido conforme o `lc_messages` do servidor, ou nem
   * vir. A frase continua util sem ele — o que nao pode e virar 500.
   */
  it('sem o detail, a frase sobrevive', () => {
    expect(mensagemDeUnicidade(erro('produtos_codigo_erp_key'))).toBe(
      'Já existe uma peça com o código informado.',
    );
    expect(mensagemDeUnicidade(erro('produtos_codigo_erp_key', 'Chave (codigo_erp)=(X) já existe.'))).toBe(
      'Já existe uma peça com o código informado.',
    );
  });

  /**
   * O VALOR DESTAS E UM HASH. Mostra-lo seria despejar dado de banco na tela —
   * exatamente o que este arquivo existe para impedir.
   */
  it('campo cifrado nunca mostra o valor', () => {
    const e = erro(
      'clientes_perfil_whatsapp_hash_key',
      'Key (whatsapp_hash)=(9f8a2c1b4e7d6a5f0b3c8e1d2a4f6b9c) already exists.',
    );
    const frase = mensagemDeUnicidade(e);

    expect(frase).toBe('Já existe um cliente com o WhatsApp.');
    expect(frase).not.toContain('9f8a2c1b');
    expect(frase).not.toContain('hash');
  });

  it('chave composta nao despeja os quatro UUIDs', () => {
    const e = erro(
      'uq_estoque_chave',
      'Key (empresa_id, grupo_estoque_id, produto_id, local_estoque_id)=' +
        '(9ee6f101-31c7-4152-955c-c692972bd196, d50433dd-dcbe-46f9-89ce-f908423a4244, ' +
        '77822b49-e1fd-4fe0-ab05-1bfee9d37117, 8d55f505-fe18-41cd-893f-6bb2130b501f) already exists.',
    );
    const frase = mensagemDeUnicidade(e);

    expect(frase).toBe(
      'Já existe uma linha de estoque com essa combinação de empresa, grupo, peça e local.',
    );
    expect(frase).not.toContain('-');
  });

  /**
   * A REGRA DO LUCAS, 23/09: "o usuario nao precisa ver os erro de banco".
   * Restricao fora do mapa nao vira 500 nem expoe nome de coluna.
   */
  it('restricao desconhecida cai na generica, sem coluna e sem valor', () => {
    const e = erro('uq_alguma_coisa_nova', 'Key (coluna_secreta)=(valor) already exists.');
    const frase = mensagemDeUnicidade(e);

    expect(frase).toBe('Já existe um registro com esse valor.');
    expect(frase).not.toContain('coluna_secreta');
    expect(frase).not.toContain('uq_');
  });

  it('sem constraint nenhuma tambem cai na generica', () => {
    const e = new Error('x') as ErroDoDriver;
    e.code = '23505';
    expect(mensagemDeUnicidade(e)).toBe('Já existe um registro com esse valor.');
  });

  /** Um por cadastro, para o mapa nao envelhecer calado. */
  it.each([
    ['clientes_codigo_erp_key', 'Já existe um cliente com o código C1042.', 'Key (codigo_erp)=(C1042) already exists.'],
    ['uq_vendedoras_id_erp', 'Já existe uma vendedora com o id do ERP 9602.', 'Key (id_erp)=(9602) already exists.'],
    ['fornecedores_codigo_erp_key', 'Já existe um fornecedor com o código F01.', 'Key (codigo_erp)=(F01) already exists.'],
    ['empresas_codigo_erp_key', 'Já existe uma empresa com o código E02.', 'Key (codigo_erp)=(E02) already exists.'],
    ['formas_pagamento_codigo_erp_key', 'Já existe uma forma de pagamento com o código PIX.', 'Key (codigo_erp)=(PIX) already exists.'],
    ['grupos_estoque_codigo_erp_key', 'Já existe um grupo de estoque com o código G01.', 'Key (codigo_erp)=(G01) already exists.'],
    ['locais_estoque_codigo_erp_key', 'Já existe um local de estoque com o código L01.', 'Key (codigo_erp)=(L01) already exists.'],
    ['operacoes_codigo_erp_key', 'Já existe uma operação com o código 9000000323.', 'Key (codigo_erp)=(9000000323) already exists.'],
    ['uq_produtos_id_erp', 'Já existe uma peça com o id do ERP 1221572.', 'Key (id_erp)=(1221572) already exists.'],
  ])('%s', (constraint, esperado, detail) => {
    expect(mensagemDeUnicidade(erro(constraint, detail))).toBe(esperado);
  });
});
