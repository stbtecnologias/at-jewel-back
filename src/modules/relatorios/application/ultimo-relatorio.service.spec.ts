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

  it('esquecer zera', () => {
    s.guardar(chave, TABELA);
    s.esquecer(chave);
    expect(s.pegar(chave)).toBeNull();
  });
});
