import * as fs from 'fs';
import * as path from 'path';
import { COPIE_OS_VALORES } from './anthropic.client';

/**
 * ==========================================================================
 * A AGENTE REESCREVEU UM NÚMERO QUE RECEBEU PRONTO — produção, 18/11, 15:17.
 *
 * Uma mensagem, dois valores para a mesma coisa:
 *
 *   a frase da agente:  "3 devoluções em novembro, somando R$ 31.566,00"
 *   a tabela, embaixo:  "Total | -R$ 32.966,00"
 *
 * A tabela é escrita pelo nosso código. A frase é escrita por ela. As três
 * devoluções de novembro são R$ 12.526,00, R$ 9.520,00 e R$ 10.920,00 —
 * medidas na cópia de produção, documento por documento, com o valor do
 * documento igual à soma dos itens nos três. Somam **R$ 32.966,00**, e é o
 * que a ferramenta devolveu.
 *
 * ELA ACERTOU TUDO O QUE CONSERTAMOS HOJE e errou numa frente nova: chamou a
 * ferramenta certa (a de "quantas"), não imprimiu tabela para quem pediu um
 * número, acertou documentos e peças — e corrompeu o valor.
 *
 * E na pergunta seguinte repetiu o próprio erro, copiando o R$ 31.566,00 da
 * mensagem anterior em vez de ler o número novo.
 *
 * O REMÉDIO É O QUE JÁ FUNCIONOU COM O PERÍODO. Antes ela inventava "últimos
 * 30 dias"; o texto passou a mandar dizer o período *"com essas palavras"*, e
 * parou — a conversa das 15:16 disse "de 01/11 a 18/11". Instrução branda
 * ("repasse como veio") não segurou; a nomeada segurou.
 *
 * NÃO É O CONSERTO DEFINITIVO. Enquanto o número falado passar pelo modelo,
 * isto é remendo — o conserto é a decisão de que número falado sai do nosso
 * código, como a lista de 27/10 já faz.
 * ==========================================================================
 */
describe('a ordem de copiar o valor', () => {
  it('proíbe refazer a conta, e nomeia o que não fazer', () => {
    expect(COPIE_OS_VALORES).toContain('nao refaca a conta');
    expect(COPIE_OS_VALORES).toContain('nao some');
    // E DIZ QUEM GANHA NO EMPATE: foi o caso das 15:17, em que o número dela
    // e o nosso apareceram na mesma mensagem.
    expect(COPIE_OS_VALORES.toLowerCase()).toContain('o de cima');
  });

  /* ESTE É O TESTE. */
  describe('toda ferramenta que devolve dinheiro carrega a ordem', () => {
    const arquivo = fs.readFileSync(
      path.join(__dirname, 'anthropic.client.ts'),
      'utf8',
    );

    /** O trecho do despacho de uma ferramenta, até o próximo ramo. */
    function despachoDe(nome: string): string {
      const i = arquivo.indexOf(`toolUse.name === '${nome}'`);
      expect(i).toBeGreaterThan(-1);
      const j = arquivo.indexOf('} else if (', i + 1);
      return arquivo.slice(i, j === -1 ? undefined : j);
    }

    it.each(['valor_das_vendas', 'consignacoes', 'devolucoes'])(
      'o despacho de "%s" manda copiar os valores',
      (nome) => {
        expect(despachoDe(nome)).toContain('COPIE_OS_VALORES');
      },
    );
  });
});
