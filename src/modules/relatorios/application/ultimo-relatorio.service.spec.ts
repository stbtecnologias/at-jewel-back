import { UltimoRelatorioService } from './ultimo-relatorio.service';
import type { Relatorio } from '../domain/relatorio';

const TABELA: Relatorio = {
  titulo: 'Vendas da Camila',
  colunas: [{ chave: 'a', titulo: 'A' }],
  linhas: [{ a: '1' }],
};

/**
 * O FRESCOR DO QUE VIRA ARQUIVO — RF36 e RF37.
 *
 * ============================================================================
 * ESTE SPEC EXISTE POR CAUSA DE UM DOCUMENTO ERRADO QUE SAIU DE VERDADE.
 *
 * 21/10/2026, 14:14. O Lucas perguntou as vendas da Camila, depois perguntou o
 * FATURAMENTO POR EMPRESA de setembro, e então pediu "pode gerar o pdf disso".
 * Saiu um arquivo chamado "faturamento-por-empresa-setembro.pdf" com as dez
 * linhas das vendas da Camila dentro — e a agente disse "pronto, mandei".
 *
 * Um documento que parece certo e está errado é pior que nenhum documento.
 * ============================================================================
 */
describe('UltimoRelatorioService', () => {
  let s: UltimoRelatorioService;
  const chave = 'gestao:1';

  beforeEach(() => {
    s = new UltimoRelatorioService();
  });

  it('guarda e devolve o que acabou de sair', () => {
    s.guardar(chave, TABELA);
    expect(s.pegar(chave)?.titulo).toBe('Vendas da Camila');
  });

  // A consulta e o pedido na MESMA frase: "me manda as vendas da Camila em PDF".
  it('vale na mesma mensagem — idade zero', () => {
    s.envelhecer(chave);
    s.guardar(chave, TABELA);
    expect(s.pegar(chave)).not.toBeNull();
  });

  // O caso normal: ela perguntou, leu, e agora pede o arquivo.
  it('vale na mensagem seguinte — idade um', () => {
    s.guardar(chave, TABELA);
    s.envelhecer(chave);
    expect(s.pegar(chave)).not.toBeNull();
  });

  // ==========================================================================
  // E ESTE É O CASO DE 21/10: uma pergunta passou no meio.
  // ==========================================================================
  it('NÃO vale depois de outra pergunta no meio', () => {
    s.guardar(chave, TABELA);
    s.envelhecer(chave); // a pergunta do faturamento
    s.envelhecer(chave); // o "pode gerar o pdf disso"
    expect(s.pegar(chave)).toBeNull();
  });

  it('a chave separa as conversas — o arquivo é do que AQUELA pessoa perguntou', () => {
    s.guardar('gestao:1', TABELA);
    expect(s.pegar('vendedora:9')).toBeNull();
  });

  it('sem chave não guarda e não devolve', () => {
    s.guardar(null, TABELA);
    expect(s.pegar(null)).toBeNull();
    expect(s.pegar(undefined)).toBeNull();
  });

  // ==========================================================================
  // TODA CONSULTA VIRA ARQUIVO — pedido do Lucas em 21/10.
  //
  // O funil guarda o TEXTO que a ferramenta escreveu. Uma coluna so, e isso e
  // honesto em vez de esperto: separar aquelas linhas em colunas exigiria
  // adivinhar onde um campo acaba — e coluna errada e pior que coluna unica.
  // ==========================================================================
  describe('o texto de qualquer consulta', () => {
    it('so as linhas marcadas com "- " entram — o resto e recado ao modelo', () => {
      s.guardarTexto(
        chave,
        'Itens mais vendidos',
        'Pecas que mais faturaram:\n- BRINCO — R$ 207.269\n- COLAR — R$ 147.626\n\nRepasse os numeros exatamente como estao.',
      );
      const r = s.pegar(chave);
      expect(r?.linhas).toHaveLength(2);
      expect(JSON.stringify(r)).not.toContain('Repasse');
    });

    it('o travessao vira coluna de valor', () => {
      s.guardarTexto(
        chave,
        'Itens',
        '- BRINCO — R$ 207.269\n- COLAR — R$ 147.626',
      );
      const r = s.pegar(chave);
      expect(r?.colunas).toHaveLength(2);
      expect(r?.linhas[0]).toEqual({ o: 'BRINCO', q: 'R$ 207.269' });
    });

    it('uma linha fora do padrao e a tabela fica de uma coluna', () => {
      s.guardarTexto(
        chave,
        'Itens',
        '- BRINCO — R$ 207.269\n- COLAR sem valor',
      );
      expect(s.pegar(chave)?.colunas).toHaveLength(1);
    });

    it('resposta em prosa nao vira tabela', () => {
      s.guardarTexto(
        chave,
        'Consulta',
        'A Camila fez 2 vendas, R$ 195.644 no total.',
      );
      expect(s.pegar(chave)).toBeNull();
    });

    // ======================================================================
    // E A PROSA DERRUBA A TABELA DE ANTES — o caminho exato das 14:14.
    //
    // Era so `return`, e a tabela anterior ficava no lugar: ela pergunta
    // outra coisa, a resposta vem em frase, e o "manda em PDF" seguinte
    // sairia com a tabela de duas perguntas atras.
    // ======================================================================
    it('a prosa de uma mensagem NOVA invalida a tabela anterior', () => {
      s.guardar(chave, TABELA);
      s.envelhecer(chave);
      s.guardarTexto(
        chave,
        'Faturamento por empresa',
        'Nenhuma empresa do grupo teve movimento nesse periodo.',
      );
      expect(s.pegar(chave)).toBeNull();
    });

    it('mas a prosa da MESMA mensagem nao derruba a tabela de agora', () => {
      // Um turno pode rodar duas ferramentas: uma monta a tabela, a outra
      // responde em frase. A tabela e da pergunta de agora.
      s.guardar(chave, TABELA);
      s.guardarTexto(chave, 'Metas', 'Ela bateu a meta do mes.');
      expect(s.pegar(chave)?.titulo).toBe('Vendas da Camila');
    });

    // A ferramenta de vendas monta sete colunas. O texto dela chega DEPOIS no
    // funil, e nao pode atropelar o que ela fez melhor.
    it('NAO atropela a tabela rica da mesma mensagem', () => {
      s.guardar(chave, TABELA);
      s.guardarTexto(chave, 'Consulta', '- linha solta');
      expect(s.pegar(chave)?.titulo).toBe('Vendas da Camila');
    });

    // Mas numa mensagem NOVA ele manda: a pergunta mudou.
    it('na mensagem seguinte, o texto novo manda', () => {
      s.guardar(chave, TABELA);
      s.envelhecer(chave);
      s.guardarTexto(chave, 'Leads', '- Fulana');
      expect(s.pegar(chave)?.titulo).toBe('Leads');
    });
  });

  // ==========================================================================
  // "E EM PLANILHA TAMBEM?" — servir rejuvenesce o guardado.
  //
  // Sem isto, o segundo formato da MESMA tabela chegaria com idade dois e
  // seria recusado: ela pediu o PDF, leu, e pede a planilha do mesmo recorte.
  // Nao passou outra pergunta no meio — passou a resposta desta.
  // ==========================================================================
  it('depois de servir, o mesmo recorte ainda vale no formato seguinte', () => {
    s.guardar(chave, TABELA);
    s.envelhecer(chave); // "gera o pdf"
    expect(s.pegar(chave)).not.toBeNull();
    s.envelhecer(chave); // "e em planilha tambem?"
    expect(s.pegar(chave)).not.toBeNull();
  });

  /**
   * ======================================================================
   * DUAS CHAMADAS NA MESMA MENSAGEM — produção, 27/10/2026, 10:12.
   *
   * "As vendas da Ylka em 2025 e 2026" viram DUAS consultas, uma por ano —
   * é o que a instrução de `de`/`ate` manda, e ela está certa: numa janela
   * só o ranking sairia da soma dos dois anos. O que estava errado era
   * daqui para baixo: a segunda tabela apagava a primeira, e o PDF saiu
   * *"só com as vendas de 2026"*.
   * ======================================================================
   */
  describe('duas tabelas na mesma mensagem', () => {
    const DE_2025: Relatorio = {
      titulo: 'Vendas da Ylka · 2025',
      colunas: [{ chave: 'a', titulo: 'A' }],
      linhas: [{ a: '2025-1' }, { a: '2025-2' }],
    };
    const DE_2026: Relatorio = {
      titulo: 'Vendas da Ylka · 2026',
      colunas: [{ chave: 'a', titulo: 'A' }],
      linhas: [{ a: '2026-1' }],
    };

    /* ESTE É O TESTE. */
    it('somam, em vez de a segunda apagar a primeira', () => {
      s.guardar(chave, DE_2025);
      s.guardar(chave, DE_2026);

      const r = s.pegar(chave);
      expect(r?.linhas).toHaveLength(3);
      expect(r?.titulo).toBe('Vendas da Ylka · 2025 e 2026');
    });

    it('na mensagem SEGUINTE a nova manda — são duas perguntas', () => {
      s.guardar(chave, DE_2025);
      s.envelhecer(chave);
      s.guardar(chave, DE_2026);

      const r = s.pegar(chave);
      expect(r?.linhas).toHaveLength(1);
      expect(r?.titulo).toBe('Vendas da Ylka · 2026');
    });

    it('tabela de OUTRA FORMA substitui, como sempre fez', () => {
      // Colunas diferentes sao perguntas diferentes: juntar "vendas uma a
      // uma" com "compras por ano" daria metade das celulas vazias.
      s.guardar(chave, DE_2025);
      s.guardar(chave, {
        titulo: 'Compras por cliente',
        colunas: [
          { chave: 'cliente', titulo: 'Cliente' },
          { chave: 'pecas', titulo: 'Peças' },
        ],
        linhas: [{ cliente: 'Maria A.', pecas: '7' }],
      });

      expect(s.pegar(chave)?.titulo).toBe('Compras por cliente');
      expect(s.pegar(chave)?.linhas).toHaveLength(1);
    });
  });

  it('esquecer zera', () => {
    s.guardar(chave, TABELA);
    s.esquecer(chave);
    expect(s.pegar(chave)).toBeNull();
  });
// ==========================================================================
  // O RECORTE DA PERGUNTA NO TÍTULO — 26/10/2026.
  //
  // *"Sinta falta dos dados, pq são os itens mais vendidos da Camila em
  // Agosto de 2026 e no documento não consta nada disso."*
  // ==========================================================================
  describe('o recorte no título e no carimbo', () => {
    // Duas linhas marcadas, como toda ferramenta de lista escreve. A quebra
    // vai por código, igual ao próprio serviço faz — e pelo mesmo motivo de
    // sempre: heredoc come barra invertida.
    const LISTA = [
      '- BR26278 Brinco DTS — R$ 52.500',
      '- AN26191 Anel DTS — R$ 30.000',
    ].join(String.fromCharCode(10));

    it('o título leva quem e quando, e a coluna diz o que é a linha', () => {
      const s = new UltimoRelatorioService();

      s.guardarTexto('c-1', 'Itens mais vendidos', LISTA, {
        coluna: 'Peça',
        recorte: { titulo: 'Camila · agosto de 2026', periodo: 'agosto de 2026' },
      });

      const r = s.pegar('c-1');
      expect(r?.titulo).toBe('Itens mais vendidos — Camila · agosto de 2026');
      expect(r?.colunas[0].titulo).toBe('Peça');
    });

    /* "Posição em" é a posição do DADO. Num relatório de agosto lido em
     * outubro essa frase mente: ali a hora só diz quando foi lido. */
    it('com período no título, o carimbo diz "Lido em"', () => {
      const s = new UltimoRelatorioService();

      s.guardarTexto('c-2', 'Itens mais vendidos', LISTA, {
        recorte: { titulo: 'agosto de 2026', periodo: 'agosto de 2026' },
      });

      expect(s.pegar('c-2')?.posicao).toMatch(/^Lido em /);
    });

    it('sem recorte, nada muda — título, coluna e "Posição em" como antes', () => {
      const s = new UltimoRelatorioService();

      s.guardarTexto('c-3', 'Leads', LISTA);

      const r = s.pegar('c-3');
      expect(r?.titulo).toBe('Leads');
      expect(r?.colunas[0].titulo).toBe('Leads');
      expect(r?.posicao).toMatch(/^Posição em /);
    });

    /* O ARQUIVO LEVA O TÍTULO NO NOME: dois meses da mesma consulta não podem
     * sair com o mesmo nome na pasta de downloads dela. */
    it('dois recortes da mesma consulta dão títulos diferentes', () => {
      const s = new UltimoRelatorioService();

      s.guardarTexto('c-4', 'Itens mais vendidos', LISTA, {
        recorte: { titulo: 'Camila · agosto de 2026', periodo: 'agosto de 2026' },
      });
      const agosto = s.pegar('c-4')?.titulo;

      s.guardarTexto('c-4', 'Itens mais vendidos', LISTA, {
        recorte: { titulo: 'Camila · setembro de 2026', periodo: 'setembro de 2026' },
      });
      const setembro = s.pegar('c-4')?.titulo;

      expect(agosto).not.toBe(setembro);
    });
  });
});

/**
 * A LISTA CURTA NÃO SAÍA — 17/11/2026.
 *
 * ==========================================================================
 * DUAS VENDAS, E NENHUMA LINHA CHEGOU À GESTÃO.
 *
 * Conversa de 17/11 às 11:02, em produção:
 *
 *   — "quais as vendas desse mes?"
 *   — "A lista completa sai logo abaixo. São 2 vendas em novembro, as duas
 *      de 09/11, cada uma de R$ 1.500,00 — somando R$ 3.000,00."
 *
 * E não saiu nada. Os dois lados calados, cada um porque o outro ia falar:
 *
 *   - a AGENTE não listou porque a descrição manda não repetir ("a lista
 *     completa sai sozinha... você não precisa repeti-la");
 *   - o SISTEMA não entregou porque achou que a conversa já tinha mostrado
 *     as duas.
 *
 * A PREMISSA DO PORTÃO É QUE O TEXTO DA FERRAMENTA É O QUE A PESSOA VÊ. Para
 * as outras ferramentas é verdade — o modelo relata as linhas. Para o
 * `vendas_detalhadas` é falso por desenho, e o número 2 que decidiu "ela já
 * viu" veio de um texto que NINGUÉM viu.
 *
 * Com lista grande o acidente se escondia: a ferramenta manda 10 ao modelo, a
 * tabela tem 25, sobram 15 e ela saía inteira. Com 10 ou menos, para de sair.
 * ==========================================================================
 */
describe('a lista que não aparece na conversa', () => {
  const TABELA = (quantas: number) => ({
    titulo: 'Listagem de Vendas',
    colunas: [{ chave: 'valor', titulo: 'Total', peso: 1 }],
    linhas: Array.from({ length: quantas }, (_, i) => ({
      valor: `R$ ${i + 1},00`,
    })),
  });

  /** O texto que a FERRAMENTA devolve: uma linha marcada por venda. */
  const TEXTO = (quantas: number) =>
    Array.from({ length: quantas }, (_, i) => `- venda ${i + 1}`).join('\n');

  it('com a marca, duas vendas continuam valendo entrega', () => {
    const s = new UltimoRelatorioService();

    s.guardar('c1', TABELA(2) as never, { listaNaoAparece: true });
    s.guardarTexto('c1', 'Listagem de Vendas', TEXTO(2));

    expect(s.quantasNaoForamMostradas('c1')).toBe(2);
  });

  /**
   * O COMPORTAMENTO ANTIGO FICA INTACTO para quem não marca: as ferramentas
   * que escrevem na conversa continuam descontando o que já mostraram.
   */
  it('sem a marca, duas vendas continuam valendo zero', () => {
    const s = new UltimoRelatorioService();

    s.guardar('c2', TABELA(2) as never);
    s.guardarTexto('c2', 'Listagem de Vendas', TEXTO(2));

    expect(s.quantasNaoForamMostradas('c2')).toBe(0);
  });

  /**
   * A LISTA DO ANO CONTINUA SAINDO INTEIRA — pedido do Lucas em 17/11:
   * *"quando ela pedir a lista do ano de vendas, sai na tabela completa"*.
   *
   * Antes dava 25 − 10 = 15; agora dá 25. Os dois são maiores que zero, então
   * a entrega é a MESMA — e a tabela sempre levou a lista inteira.
   */
  it('a lista grande sai igual, com a marca ou sem ela', () => {
    const comMarca = new UltimoRelatorioService();
    comMarca.guardar('c3', TABELA(25) as never, { listaNaoAparece: true });
    comMarca.guardarTexto('c3', 'Listagem de Vendas', TEXTO(10));

    const semMarca = new UltimoRelatorioService();
    semMarca.guardar('c4', TABELA(25) as never);
    semMarca.guardarTexto('c4', 'Listagem de Vendas', TEXTO(10));

    expect(comMarca.quantasNaoForamMostradas('c3')).toBe(25);
    expect(semMarca.quantasNaoForamMostradas('c4')).toBe(15);
    // O QUE IMPORTA É O PORTÃO, e ele é o mesmo nos dois.
    expect(comMarca.quantasNaoForamMostradas('c3')).toBeGreaterThan(0);
    expect(semMarca.quantasNaoForamMostradas('c4')).toBeGreaterThan(0);
  });

  it('uma venda só também sai', () => {
    const s = new UltimoRelatorioService();

    s.guardar('c5', TABELA(1) as never, { listaNaoAparece: true });
    s.guardarTexto('c5', 'Listagem de Vendas', TEXTO(1));

    expect(s.quantasNaoForamMostradas('c5')).toBe(1);
  });

  /** Duas tabelas na mesma mensagem se somam, e a marca não se perde. */
  it('a marca sobrevive à soma de duas tabelas', () => {
    const s = new UltimoRelatorioService();

    s.guardar('c6', TABELA(2) as never, { listaNaoAparece: true });
    s.guardar('c6', TABELA(3) as never, { listaNaoAparece: true });
    s.guardarTexto('c6', 'Listagem de Vendas', TEXTO(5));

    expect(s.quantasNaoForamMostradas('c6')).toBeGreaterThan(0);
  });
});
