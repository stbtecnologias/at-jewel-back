import { MontarMensagensUseCase } from './montar-mensagens.use-case';
import type { Relatorio } from '../domain/relatorio';

/**
 * ==========================================================================
 * A LISTA INTEIRA NA CONVERSA, ESCRITA POR NÓS — 28/10/2026.
 *
 * *"Por padrão toda lista ou consulta deve listar tudo... se não tiver deve
 * vir tudo de uma vez no WhatsApp."* — Lucas, 27/10/2026.
 *
 * O QUE ESTE ARQUIVO PROTEGE, e cada item é um defeito diferente:
 *
 *   1. a lista sai INTEIRA, e numerada de 1 a N — sem número, uma linha que
 *      falte no meio de mil é invisível;
 *   2. a quebra NUNCA parte uma linha — linha partida em duas mensagens vira
 *      dois registros que não se leem;
 *   3. acima do teto de mensagens ela NÃO sai pela conversa, e quem chama
 *      manda o arquivo. O RF-12 limita 30 por destino/hora, e contas de
 *      WhatsApp já foram bloqueadas definitivamente por volume;
 *   4. o aviso de dado interno vai junto, pelo mesmo motivo que vai no PDF.
 * ==========================================================================
 */

function tabela(linhas: number, extra: Partial<Relatorio> = {}): Relatorio {
  return {
    titulo: 'Vendas de AT JEWEL LTDA — 2023 a 2026',
    posicao: 'Posição em 28/10/2026 09:12',
    colunas: [
      { chave: 'data', titulo: 'Data', peso: 1 },
      { chave: 'documento', titulo: 'Doc', peso: 1 },
      { chave: 'cliente', titulo: 'Cliente', peso: 2 },
      { chave: 'valor', titulo: 'Total', peso: 1 },
    ],
    linhas: Array.from({ length: linhas }, (_, i) => ({
      data: '11/08/2026',
      documento: String(1000 + i),
      cliente: 'CLIENTE ' + i,
      valor: 'R$ 52.500,00',
    })),
    ...extra,
  };
}

function montar(guardado: Relatorio | null) {
  const ultimo = { pegar: jest.fn().mockReturnValue(guardado) };
  return {
    uc: new MontarMensagensUseCase(ultimo as never),
    ultimo,
  };
}

describe('MontarMensagensUseCase', () => {
  /* ESTE É O TESTE. */
  it('escreve TODAS as linhas, numeradas de 1 a N', () => {
    const { uc } = montar(tabela(120));

    const r = uc.execute('gestao:ad-1');

    expect(r).not.toBeNull();
    expect(r!.linhas).toBe(120);
    const texto = r!.mensagens.join(String.fromCharCode(10));
    expect(texto).toContain('1. 11/08/2026');
    expect(texto).toContain('120. 11/08/2026');
    // A numeração é o que deixa conferir que nada foi pulado.
    for (const n of [1, 2, 59, 60, 119, 120]) {
      expect(texto).toContain(String(n) + '. ');
    }
  });

  it('o cabeçalho diz o título, quantas linhas e a posição', () => {
    const { uc } = montar(tabela(3));

    const r = uc.execute('gestao:ad-1');

    expect(r!.mensagens[0]).toContain('Vendas de AT JEWEL LTDA — 2023 a 2026');
    expect(r!.mensagens[0]).toContain('3 linhas');
    expect(r!.mensagens[0]).toContain('Posição em 28/10/2026 09:12');
  });

  /**
   * ========================================================================
   * A POSIÇÃO TEM DE SIGNIFICAR, E ISSO CUSTA O TRAÇO — 28/10/2026.
   *
   * A primeira versão tirava as células vazias, para economizar caracteres.
   * O teste do Lucas mostrou o preço: na tabela de compras por ano, quem
   * comprou só em 2026 perdia as duas células de 2025 e a linha saía
   *
   *   36. ANA MARIA | 3 | R$ 76.790,00 | R$ 76.790,00
   *
   * Três peças de qual ano? Cada linha passava a ter um significado
   * diferente conforme o que faltava nela.
   * ========================================================================
   */
  it('nenhuma célula falta — e o cabeçalho das colunas vai junto', () => {
    const { uc } = montar(
      tabela(1, {
        colunas: [
          { chave: 'cliente', titulo: 'Cliente', peso: 2 },
          { chave: 'pecas2025', titulo: 'Peças 2025', peso: 1 },
          { chave: 'pecas2026', titulo: 'Peças 2026', peso: 1 },
          { chave: 'total', titulo: 'Total', peso: 1 },
        ],
        linhas: [
          { cliente: 'ANA MARIA', pecas2026: '3', total: 'R$ 76.790,00' },
        ],
      }),
    );

    const r = uc.execute('gestao:ad-1');

    const linha = r!.mensagens[0]
      .split(String.fromCharCode(10))
      .find((l) => l.startsWith('1. '));
    expect(linha).toBe('1. ANA MARIA | — | 3 | R$ 76.790,00');
    // E o cabeçalho, sem o qual a posição não significa nada.
    expect(r!.mensagens[0]).toContain(
      'Cliente | Peças 2025 | Peças 2026 | Total',
    );
  });

  it('cabe numa mensagem só: não há "parte 1 de 1"', () => {
    const { uc } = montar(tabela(10));

    const r = uc.execute('gestao:ad-1');

    expect(r!.mensagens).toHaveLength(1);
    expect(r!.mensagens[0]).not.toContain('parte');
  });

  it('quebra em partes numeradas, e NUNCA no meio de uma linha', () => {
    // 700 linhas de ~50 caracteres passam dos 20 mil de uma mensagem.
    const { uc } = montar(tabela(700));

    const r = uc.execute('gestao:ad-1');

    expect(r!.mensagens.length).toBeGreaterThan(1);
    expect(r!.mensagens[0]).toContain('parte 1 de ' + r!.mensagens.length);

    // Cada linha numerada aparece inteira em UMA das mensagens.
    const juntas = r!.mensagens.join(String.fromCharCode(10));
    for (const n of [1, 350, 700]) {
      expect(juntas).toContain(`${n}. 11/08/2026 | ${1000 + n - 1} | CLIENTE`);
    }
    // E nenhuma mensagem termina no meio de uma linha: a última linha de cada
    // parte tem o valor no fim, que é a última célula.
    for (const m of r!.mensagens) {
      const ultima = m
        .split(String.fromCharCode(10))
        .filter((l) => /^\d+\. /.test(l))
        .at(-1);
      expect(ultima).toMatch(/R\$ 52\.500,00$/);
    }
  });

  it('o rodapé só na ÚLTIMA parte, com o total e o aviso', () => {
    const { uc } = montar(
      tabela(700, { total: { data: 'Total', valor: 'R$ 36.750.000,00' } }),
    );

    const r = uc.execute('gestao:ad-1');

    const ultima = r!.mensagens.at(-1)!;
    expect(ultima).toContain('R$ 36.750.000,00');
    expect(ultima).toContain('não repassar');
    // Repetido em todas, o aviso vira ruído — e o total apareceria no meio da
    // lista como se fechasse ali.
    expect(r!.mensagens[0]).not.toContain('não repassar');
  });

  it('acima do teto de mensagens NÃO sai pela conversa', () => {
    // O catálogo inteiro são 7.423 peças. Dez mensagens numa resposta comem um
    // terço do orçamento de 30/hora do RF-12.
    const { uc } = montar(tabela(7423));

    const r = uc.execute('gestao:ad-1');

    expect(r!.preferirArquivo).toBe(true);
    expect(r!.mensagens).toEqual([]);
    // O número ainda é dito, para quem chama poder explicar a troca.
    expect(r!.mensagensNecessarias).toBeGreaterThan(3);
    expect(r!.linhas).toBe(7423);
  });

  it('o "exibindo" entra no cabeçalho — recorte que esconde diz que escondeu', () => {
    const { uc } = montar(
      tabela(500, { exibindo: { mostradas: 500, total: 1110 } }),
    );

    const r = uc.execute('gestao:ad-1');

    expect(r!.total).toBe(1110);
    expect(r!.mensagens[0]).toContain('500 de 1110');
  });

  it('sem nada guardado devolve null, e não uma lista vazia', () => {
    // A mesma regra do arquivo: "não tenho isso" é diferente de um papel em
    // branco, e papel em branco parece resposta.
    const { uc } = montar(null);

    expect(uc.execute('gestao:ad-1')).toBeNull();
  });

  it('tabela sem linha nenhuma também devolve null', () => {
    const { uc } = montar(tabela(0));

    expect(uc.execute('gestao:ad-1')).toBeNull();
  });
});
