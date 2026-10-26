import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLUNA_POR_FERRAMENTA,
  TITULOS_POR_FERRAMENTA,
  colunaDaFerramenta,
  tituloDaFerramenta,
} from './titulo-da-ferramenta';

/**
 * O NOME QUE O ARQUIVO LEVA — RF36 e RF37.
 *
 * ============================================================================
 * ESTE SPEC EXISTE PORQUE QUATRO CHAVES ESTAVAM ERRADAS, E NADA RECLAMAVA.
 *
 * Eu escrevi `gestao_vendas`, `gestao_metas`, `gestao_agenda` e
 * `leads_da_gestao` — que são os nomes dos HANDLERS (`params.gestaoVendas`) e
 * não das FERRAMENTAS (`vendas_de_vendedora`, `listar_leads`). As quatro
 * consultas mais pedidas da gestão caíam em "Consulta", e o arquivo chegava no
 * celular dela chamado "consulta-21-10-2026.pdf".
 *
 * Chave que não casa não dá erro: devolve o vazio com cara de resposta. É a
 * mesma pegadinha de `formas_pagamento.id_erp` em 20/10, e foi assim que o
 * `envelhecer` sem chamador passou — eu provei pela existência do mapa, não
 * pelo conteúdo dele.
 *
 * Por isso o teste principal aqui não olha um título: ele confere TODA chave
 * contra os nomes de ferramenta declarados no cliente do LLM. Uma chave
 * inventada passa a falhar na hora.
 * ============================================================================
 */
describe('o título que a ferramenta dá ao arquivo', () => {
  /** Os nomes de ferramenta declarados de verdade, lidos da fonte. */
  const nomesDeFerramenta = (): Set<string> => {
    const fonte = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'agentes',
        'infrastructure',
        'llm',
        'anthropic.client.ts',
      ),
      'utf8',
    );
    const achados = fonte.match(/^ {2}name: '[a-z_]+'/gm) ?? [];
    return new Set(achados.map((l) => l.replace(/^ {2}name: '|'$/g, '')));
  };

  /* ESTE É O TESTE. O resto é contorno. */
  it('toda chave do mapa é uma ferramenta que EXISTE', () => {
    const existem = nomesDeFerramenta();
    const inventadas = Object.keys(TITULOS_POR_FERRAMENTA).filter(
      (k) => !existem.has(k),
    );

    expect(inventadas).toEqual([]);
  });

  it('o mapa não está vazio — senão o teste acima passa por nada', () => {
    // A guarda do guarda: se a leitura da fonte falhasse e o `Set` viesse
    // vazio, o teste de cima passaria com o mapa inteiro errado.
    expect(nomesDeFerramenta().size).toBeGreaterThan(40);
    expect(Object.keys(TITULOS_POR_FERRAMENTA).length).toBeGreaterThan(30);
  });

  it('as quatro que estavam erradas agora têm nome', () => {
    expect(tituloDaFerramenta('vendas_de_vendedora')).toBe(
      'Vendas da vendedora',
    );
    expect(tituloDaFerramenta('metas_de_vendedora')).toBe(
      'Metas da vendedora',
    );
    expect(tituloDaFerramenta('agenda_de_vendedora')).toBe(
      'Agenda da vendedora',
    );
    expect(tituloDaFerramenta('listar_leads')).toBe('Leads');
  });

  it('ferramenta desconhecida cai em "Consulta" — feio e honesto', () => {
    expect(tituloDaFerramenta('ferramenta_que_nao_existe')).toBe('Consulta');
    expect(tituloDaFerramenta('')).toBe('Consulta');
  });

  // ==========================================================================
  // DOIS TÍTULOS IGUAIS SÃO DOIS ARQUIVOS COM O MESMO NOME NO CELULAR DELA.
  //
  // E aí "qual é o de setembro?" não se responde olhando a lista de arquivos.
  // ==========================================================================
  it('nenhum título se repete', () => {
    const titulos = Object.values(TITULOS_POR_FERRAMENTA);

    expect(new Set(titulos).size).toBe(titulos.length);
  });

  it('nenhum título é "Consulta" — isso é o que o desconhecido recebe', () => {
    expect(Object.values(TITULOS_POR_FERRAMENTA)).not.toContain('Consulta');
  });
// ==========================================================================
  // O CABEÇALHO DA COLUNA DIZ O QUE É CADA LINHA — 26/10/2026.
  //
  // O PDF das peças da Camila saiu com "Itens mais vendidos" no título e
  // "ITENS MAIS VENDIDOS" no cabeçalho da coluna: a mesma frase duas vezes, e
  // nenhuma delas dizendo que cada linha é uma peça.
  // ==========================================================================
  it('toda ferramenta com título tem coluna — a lista não fica pela metade', () => {
    const semColuna = Object.keys(TITULOS_POR_FERRAMENTA).filter(
      (nome) => !COLUNA_POR_FERRAMENTA[nome],
    );

    expect(semColuna).toEqual([]);
  });

  it('nenhuma coluna repete o título da própria ferramenta', () => {
    const repetidas = Object.keys(COLUNA_POR_FERRAMENTA).filter(
      (nome) => COLUNA_POR_FERRAMENTA[nome] === TITULOS_POR_FERRAMENTA[nome],
    );

    expect(repetidas).toEqual([]);
  });

  it('a coluna é uma palavra no singular, e não uma frase', () => {
    for (const [nome, coluna] of Object.entries(COLUNA_POR_FERRAMENTA)) {
      expect(`${nome}: ${coluna.split(' ').length}`).toBe(`${nome}: 1`);
      expect(coluna.endsWith('s')).toBe(false);
    }
  });

  it('ferramenta desconhecida cai em "Item"', () => {
    expect(colunaDaFerramenta('ferramenta_que_nao_existe')).toBe('Item');
    expect(colunaDaFerramenta('itens_mais_vendidos')).toBe('Peça');
  });
});
