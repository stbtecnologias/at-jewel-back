import { somarRelatorios } from './somar-relatorios';
import type { Relatorio } from './relatorio';

const COLUNAS = [
  { chave: 'data', titulo: 'Data' },
  { chave: 'cliente', titulo: 'Cliente' },
  { chave: 'valor', titulo: 'Total' },
];

function vendas(
  titulo: string,
  linhas: Array<[string, string, string]>,
  extra: Partial<Relatorio> = {},
): Relatorio {
  return {
    titulo,
    posicao: 'Posição em 27/10/2026 10:11',
    colunas: COLUNAS,
    linhas: linhas.map(([data, cliente, valor]) => ({ data, cliente, valor })),
    ...extra,
  };
}

/**
 * ==========================================================================
 * O PDF SAIU COM METADE DO QUE PEDIRAM — produção, 27/10/2026, 10:12.
 *
 * *"A Ylka teve 90 vendas em 2025 e 43 em 2026"*, respondeu a agente — duas
 * chamadas, uma por ano, como a instrução de `de`/`ate` manda. A gestora
 * pediu o PDF, e veio: *"O PDF saiu só com as vendas de 2026 — a lista de
 * 2025 não ficou guardada junto."*
 *
 * Não ficou porque a segunda chamada escreveu por cima da primeira, calada.
 * Daí em diante a conversa afundou sozinha: *"não consigo reunir a lista
 * inteira de 2025 aqui"*, *"o caminho é o painel"*, *"essa lista acabou
 * saindo do buffer"* — quatro mensagens para não entregar o que estava
 * pronto.
 * ==========================================================================
 */
describe('somarRelatorios — duas tabelas da mesma mensagem viram uma', () => {
  /* ESTE É O TESTE. */
  it('soma as linhas das duas, na ordem em que chegaram', () => {
    const r = somarRelatorios(
      vendas('Vendas da Ylka · 2025', [
        ['23/12/2025', 'Maria A.', 'R$ 1.797'],
        ['22/12/2025', 'Camile Q.', 'R$ 599'],
      ]),
      vendas('Vendas da Ylka · 2026', [
        ['20/10/2026', 'Giordana M.', 'R$ 5.000'],
      ]),
    );

    expect(r).not.toBeNull();
    expect(r!.linhas).toHaveLength(3);
    expect(r!.linhas.map((l) => l.data)).toEqual([
      '23/12/2025',
      '22/12/2025',
      '20/10/2026',
    ]);
  });

  it('o TÍTULO fala dos dois recortes — é onde quem lê procura', () => {
    const r = somarRelatorios(
      vendas('Vendas da Ylka · 2025', [['23/12/2025', 'Maria A.', 'R$ 1']]),
      vendas('Vendas da Ylka · 2026', [['20/10/2026', 'Giordana M.', 'R$ 2']]),
    );

    // Um título que dissesse só "2026" seria a mesma mentira do PDF de
    // 10:12, agora com as linhas certas dentro.
    expect(r!.titulo).toBe('Vendas da Ylka · 2025 e 2026');
  });

  it('título igual nos dois fica igual — nada a acrescentar', () => {
    const r = somarRelatorios(
      vendas('Vendas da Ylka', [['23/12/2025', 'Maria A.', 'R$ 1']]),
      vendas('Vendas da Ylka', [['20/10/2026', 'Giordana M.', 'R$ 2']]),
    );

    expect(r!.titulo).toBe('Vendas da Ylka');
  });

  it('o "exibindo" soma os dois totais, e não as duas páginas', () => {
    // 90 de 2025 e 43 de 2026: a tabela leva 3 linhas de amostra aqui, mas
    // o que existe são 133 — e é esse número que o rodapé tem de dizer.
    const r = somarRelatorios(
      vendas(
        'Vendas da Ylka · 2025',
        [
          ['23/12/2025', 'Maria A.', 'R$ 1'],
          ['22/12/2025', 'Camile Q.', 'R$ 2'],
        ],
        { exibindo: { mostradas: 2, total: 90 } },
      ),
      vendas('Vendas da Ylka · 2026', [['20/10/2026', 'Giordana M.', 'R$ 3']], {
        exibindo: { mostradas: 1, total: 43 },
      }),
    );

    expect(r!.exibindo).toEqual({ mostradas: 3, total: 133 });
  });

  it('A LINHA DE TOTAL SAI, e o rodapé diz por quê', () => {
    // Somar "R$ 3.780.158" com "R$ 2.137.211" exigiria desmontar texto já
    // escrito; e um total que cobre metade das linhas é pior que nenhum,
    // porque ninguém reconfere rodapé.
    const r = somarRelatorios(
      vendas('Vendas · 2025', [['23/12/2025', 'Maria A.', 'R$ 1']], {
        total: { data: 'Total', cliente: '', valor: 'R$ 1' },
      }),
      vendas('Vendas · 2026', [['20/10/2026', 'Giordana M.', 'R$ 2']], {
        total: { data: 'Total', cliente: '', valor: 'R$ 2' },
      }),
    );

    expect(r!.total).toBeUndefined();
    expect(r!.nota).toContain('sem linha de total');
  });

  it('colunas diferentes NÃO somam — são perguntas diferentes', () => {
    // Aqui a segunda tem de substituir a primeira, como sempre fez: juntar
    // "clientes por ano" com "vendas uma a uma" daria uma tabela com
    // metade das células vazias.
    const r = somarRelatorios(
      vendas('Vendas da Ylka', [['23/12/2025', 'Maria A.', 'R$ 1']]),
      {
        titulo: 'Compras por cliente',
        colunas: [
          { chave: 'cliente', titulo: 'Cliente' },
          { chave: 'pecas', titulo: 'Peças' },
        ],
        linhas: [{ cliente: 'Maria A.', pecas: '7' }],
      },
    );

    expect(r).toBeNull();
  });

  it('a MESMA consulta duas vezes não vira soma', () => {
    // O modelo repetir a chamada acontece. Somando, "3 de 6" seria mentira
    // em vez de conserto.
    const linhas: Array<[string, string, string]> = [
      ['23/12/2025', 'Maria A.', 'R$ 1'],
      ['22/12/2025', 'Camile Q.', 'R$ 2'],
    ];
    const r = somarRelatorios(
      vendas('Vendas da Ylka', linhas, {
        exibindo: { mostradas: 2, total: 9 },
      }),
      vendas('Vendas da Ylka', linhas, {
        exibindo: { mostradas: 2, total: 9 },
      }),
    );

    expect(r!.linhas).toHaveLength(2);
    expect(r!.exibindo).toEqual({ mostradas: 2, total: 9 });
  });

  it('a linha repetida entre as duas janelas entra uma vez só', () => {
    const r = somarRelatorios(
      vendas('Vendas · dezembro', [
        ['23/12/2025', 'Maria A.', 'R$ 1'],
        ['22/12/2025', 'Camile Q.', 'R$ 2'],
      ]),
      vendas('Vendas · 2025', [
        ['22/12/2025', 'Camile Q.', 'R$ 2'],
        ['19/11/2025', 'Isabelle F.', 'R$ 3'],
      ]),
    );

    expect(r!.linhas).toHaveLength(3);
  });

  it('a folha deitada de uma das duas vale para a soma', () => {
    const r = somarRelatorios(
      vendas('Vendas · 2025', [['23/12/2025', 'Maria A.', 'R$ 1']]),
      vendas('Vendas · 2026', [['20/10/2026', 'Giordana M.', 'R$ 2']], {
        paisagem: true,
      }),
    );

    expect(r!.paisagem).toBe(true);
  });
});
