import { palavrasDoNome } from './cliente.repository';

/**
 * "RAFAELA SANTOS" NAO ACHAVA "RAFAELA FAVORITO SANTOS" — 02/10/2026.
 *
 * ==========================================================================
 * O DEFEITO MAIS CARO E O QUE RESPONDE COM CONFIANCA.
 *
 * A busca era um pedaco so: `nome ILIKE %Rafaela Santos%`. A cliente existe,
 * esta ativa, aparece na tela de Clientes — e a agente respondia "nao
 * encontrei nenhuma cliente com esse nome". Nao e erro, nao e timeout, nao
 * aparece em log nenhum: e uma frase definitiva e falsa, e quem pergunta
 * desiste ali.
 *
 * Em joalheria a maioria tem nome do meio, entao isso falhava quase sempre que
 * alguem dizia nome e sobrenome.
 * ==========================================================================
 */
describe('palavrasDoNome — a busca de cliente por nome', () => {
  /* ESTE E O TESTE. O resto e contorno. */
  it('quebra em palavras, para o nome do meio não atrapalhar', () => {
    expect(palavrasDoNome('Rafaela Santos')).toEqual(['Rafaela', 'Santos']);
  });

  it('uma palavra continua sendo uma palavra', () => {
    expect(palavrasDoNome('Mariana')).toEqual(['Mariana']);
  });

  it('espaço a mais não vira palavra vazia', () => {
    // Uma palavra vazia viraria `ILIKE '%%'`, que casa com TODO MUNDO — e a
    // busca por "Mariana  Mota" traria a base inteira.
    expect(palavrasDoNome('  Mariana   Mota  ')).toEqual(['Mariana', 'Mota']);
  });

  it('termo vazio devolve NENHUMA palavra — e não a base inteira', () => {
    // Quem chama tem de tratar isto como "não procurei", e não como "procurei
    // e não achei". Sem condição nenhuma, a consulta traria todos os 1.096.
    expect(palavrasDoNome('')).toEqual([]);
    expect(palavrasDoNome('   ')).toEqual([]);
  });

  it('o curinga do LIKE continua escapado', () => {
    // "%" digitado por quem pergunta nao pode virar "traga todo mundo".
    const r = palavrasDoNome('100% ouro');

    expect(r[0]).not.toBe('100%');
    expect(r[0]).toContain('\\');
  });

  it('para em CINCO palavras', () => {
    // Nome completo tem seis ou sete, e cada palavra e um ILIKE sem indice.
    // Cinco ja identifica qualquer pessoa.
    const r = palavrasDoNome('Maria da Silva Pereira dos Santos Costa');

    expect(r).toHaveLength(5);
    expect(r[0]).toBe('Maria');
  });

  it('a ordem das palavras não importa para quem procura', () => {
    // As duas dao o mesmo conjunto de condicoes, e `AND` nao tem ordem: quem
    // digita "Santos Rafaela" acha a mesma pessoa.
    expect(palavrasDoNome('Santos Rafaela').sort()).toEqual(
      palavrasDoNome('Rafaela Santos').sort(),
    );
  });
});
