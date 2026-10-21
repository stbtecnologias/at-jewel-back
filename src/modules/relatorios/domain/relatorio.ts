/**
 * O MOLDE DO RELATÓRIO — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * UM CONTRATO, DOIS RENDERIZADORES. É ISTO QUE FAZ "MESMO PADRÃO, DADOS
 * DIFERENTES" SER VERDADE DE CONSTRUÇÃO, E NÃO DE DISCIPLINA.
 *
 * O pedido do Lucas em 21/10, com o desenho na mão: *"o que ela pedisse
 * poderia ter a opção de PDF — vendas, vendedoras e produtos —, podendo ser
 * em PDF ou xls, e o mesmo padrão do relatório, apenas os dados diferentes."*
 *
 * A tentação era escrever um gerador de PDF de produtos e depois copiá-lo
 * para vendas. Dois geradores divergem na primeira mudança de cabeçalho, e aí
 * "o mesmo padrão" vira uma promessa que ninguém consegue cumprir.
 *
 * Então o relatório NÃO É UM PDF: é esta estrutura. O `pdfkit` desenha, o
 * `exceljs` escreve, e os dois leem daqui. Conteúdo novo é preencher o
 * contrato; formato novo é um renderizador, e nenhum conteúdo muda.
 * ==========================================================================
 *
 * E OS NÚMEROS NÃO PASSAM PELO MODELO. Foi a decisão do desenho (b), de
 * 24/09: quem monta esta estrutura é a mesma ferramenta que responde na tela.
 * O modelo escolhe O QUE pedir, nunca o que escrever dentro.
 */

/** Um chip de filtro no alto — "EMPRESA Todas", "ORDEM Valor ↓". */
export interface FiltroDoRelatorio {
  rotulo: string;
  valor: string;
}

export type AlinhamentoColuna = 'esquerda' | 'direita' | 'centro';

export interface ColunaDoRelatorio {
  /** A chave da coluna dentro de cada linha. */
  chave: string;
  titulo: string;
  /**
   * Peso da largura. A soma não precisa dar nada — a largura é proporcional,
   * e assim acrescentar coluna não exige recalcular as outras.
   */
  peso?: number;
  alinhamento?: AlinhamentoColuna;
  /** Fonte monoespaçada — para código de peça e valor, que se comparam na vertical. */
  mono?: boolean;
}

/** Uma linha da tabela: `chave da coluna -> o que já está escrito`. */
export type LinhaDoRelatorio = Record<string, string>;

export interface Relatorio {
  /** "Lista de Produtos". Vai no título grande e no cabeçalho de cada página. */
  titulo: string;
  /** Uma frase: o que é, e de onde vieram os dados. */
  subtitulo?: string;
  /**
   * A POSIÇÃO: "Posição em 16/09/2026 11:29".
   *
   * Não é enfeite. Relatório de estoque e de venda envelhece em horas, e sem a
   * data ninguém sabe se está olhando hoje ou a semana passada — foi
   * exatamente o defeito que a timeline tinha até ontem.
   */
  posicao?: string;
  filtros?: FiltroDoRelatorio[];
  /**
   * NÃO HÁ CARTÕES DE RESUMO, e isso foi decidido — 21/10/2026.
   *
   * ========================================================================
   * O molde nasceu com uma faixa de quatro números no alto, copiada do
   * mockup. O Lucas mandou tirar de todos: produtos, vendas e vendedoras.
   *
   * E o motivo aparece quando se olha o que eles diziam. "VALOR TOTAL
   * R$ 21.690.148,00" é a soma do recorte — que a linha de TOTAL da tabela
   * já dá, e dá embaixo da coluna que ela soma. "PEÇAS 481" é a contagem de
   * linhas. Resumo que repete a tabela não resume: ocupa o alto da folha
   * com número que a pessoa vai reconferir embaixo.
   *
   * O que não estava na tabela — "7.304 cadastradas", "com foto 91%" —
   * também não era do relatório: era de outra pergunta, respondida de
   * passagem num papel que alguém pediu para ver estoque.
   *
   * Fica como ausência DECLARADA, e não como campo opcional que ninguém
   * preenche: campo opcional volta sozinho no relatório seguinte.
   * ========================================================================
   */
  /**
   * FOLHA DEITADA — para tabela larga.
   *
   * Quem monta o conteúdo é quem sabe quantas colunas vai ter, e por isso a
   * escolha é dele e não do renderizador. Regra prática: a partir de seis
   * colunas, deitada; abaixo disso a folha em pé lê melhor e imprime melhor.
   *
   * O xlsx ignora — planilha não tem página.
   */
  paisagem?: boolean;
  colunas: ColunaDoRelatorio[];
  linhas: LinhaDoRelatorio[];
  /**
   * A linha de total, com as mesmas chaves das colunas. O rótulo da primeira
   * coluna entra junto: "Total do recorte".
   */
  total?: LinhaDoRelatorio;
  /**
   * O RECORTE QUE ESCONDE DIZ QUE ESCONDEU — a mesma regra da régua e das
   * fotos. Quando a tabela mostra 14 de 865, isto é o "Exibindo 14 de 865".
   */
  exibindo?: { mostradas: number; total: number };
  /** A letra miúda embaixo da tabela: o que o número significa. */
  nota?: string;
  /** Quem pediu. Vai no rodapé, junto da hora de geração. */
  geradoPor?: string;
}

/**
 * O AVISO DO RODAPÉ, EM TODAS AS PÁGINAS DE TODO RELATÓRIO.
 *
 * ==========================================================================
 * NÃO É DECORAÇÃO, E NÃO É OPCIONAL.
 *
 * Relatório de vendas leva NOME DE CLIENTE, e relatório de produtos leva
 * preço de tabela da loja inteira. O arquivo sai do nosso controle no
 * segundo em que chega no WhatsApp de alguém — a única coisa que ainda dá
 * para fazer é dizer, no próprio papel, que ele não é para repassar.
 *
 * Por isso não é um campo do contrato: campo opcional é campo que alguém
 * esquece de preencher no relatório novo.
 * ==========================================================================
 */
export const AVISO_INTERNO =
  'Documento interno · contém dados de clientes — não compartilhar';

export const MARCA = 'A.T. JEWEL';
export const SUBMARCA = 'CRM · RELATÓRIO';

/**
 * O nome do arquivo que a pessoa vê — e procura depois.
 *
 * "produtos-21-10-2026.pdf" se acha no celular; "relatorio.pdf" não. Sem
 * acento e sem espaço, porque o nome viaja por três sistemas até virar ícone
 * na conversa dela.
 */
export function nomeDoArquivo(titulo: string, extensao: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${base}-${dia}-${mes}-${hoje.getFullYear()}.${extensao}`;
}
