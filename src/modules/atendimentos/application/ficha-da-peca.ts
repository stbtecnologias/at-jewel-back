import { palavraDaSigla, PEDRAS } from '../../../shared/catalogo/sinonimos';
import type { Produto } from '../../erp/domain/entities/produto.entity';

/**
 * A FICHA DA PECA PARA O PROMPT DE IMAGEM — 29/10/2026, pedido do Lucas.
 *
 * ==========================================================================
 * *"Eu posso colocar também a referência dela. Assim, com a referência, você
 *   tem acesso à descrição do produto e pode até fazer o prompt melhor."*
 *
 * Pode — e o ganho e maior do que a descricao. Medido nas 7.423 pecas em
 * 29/10:
 *
 *   descricao_etiqueta   100% preenchida, e e rica
 *   cor                   85%, e e O METAL — `OB 18K`, `OA 18K`, `OR 18K`
 *   tipo_pedra            20%, preciso quando existe
 *
 * A etiqueta da casa carrega o que a foto nao diz:
 *
 *   BRINCO 222 DIAM 4.08 CTS 236 SAF AZ 10.90 CTS
 *
 * Sao 222 diamantes e 236 safiras azuis. E a CONTAGEM DAS PEDRAS — exatamente
 * o que a trava `same number of stones` pede e que, sem isto, o modelo tem de
 * adivinhar contando pelo olho numa foto.
 *
 * E O `cor` E O MAIOR GANHO DE TODOS: metal trocado e o erro que o molde mais
 * teme — ouro branco virando amarelo, rose virando cobre. Com o cadastro, nao
 * se chuta.
 * ==========================================================================
 *
 * O CRITERIO, DECIDIDO POR ELE:
 *
 *   A FOTO manda na FORMA     — angulo, composicao, o que esta no quadro.
 *   O CADASTRO manda nos NOMES — pedra, metal, contagem, quilates.
 *
 * Porque e ai que cada um e melhor: a foto nao diz se e esmeralda ou
 * turmalina; o cadastro nao diz que o colar esta em U.
 */

/** `OB 18K` -> `ouro branco 18K`. A sigla desconhecida fica como veio. */
function metalPorExtenso(cor: string): string {
  // O METAL VEM COLADO AO TEOR — `OB 18K`, `OA 14K`. So a primeira parte e
  // sigla; o `18K` ja se le em qualquer idioma.
  const partes = cor.trim().split(/\s+/);
  const palavra = palavraDaSigla(partes[0]);
  if (!palavra) return cor.trim();
  return [palavra, ...partes.slice(1)].join(' ');
}

/**
 * As siglas de PEDRA que aparecem na etiqueta, por extenso.
 *
 * ==========================================================================
 * SO AS QUE `PEDRAS` LISTA, e isto nasceu de um defeito que o teste pegou.
 *
 * A primeira versao excluia so metal, e devolveu `Pedras: quilate, safira` —
 * porque `CTS` esta no mapa, por um motivo legitimo da BUSCA, e vira
 * "quilate". `quilate` viajaria para o prompt como se fosse nome de pedra.
 *
 * UMA SIGLA QUE NINGUEM MAPEOU TAMBEM NAO VIRA PALAVRA. Nomear errado e o
 * que faz o modelo de imagem TROCAR a pedra — a trava do molde.
 * ==========================================================================
 */
function pedrasDaEtiqueta(etiqueta: string): string[] {
  const achadas = new Set<string>();
  for (const bruta of etiqueta.toUpperCase().split(/[^A-Z0-9]+/)) {
    if (bruta.length < 2) continue;
    const palavra = palavraDaSigla(bruta);
    if (palavra && PEDRAS.has(palavra)) achadas.add(palavra);
  }
  return [...achadas];
}

/**
 * O que o cadastro sabe desta peca, em texto, para viajar na chamada.
 *
 * `null` quando nao ha nada util — e `null` e resposta: sem ficha, o prompt
 * sai da foto sozinha, como saia antes.
 */
export function fichaDaPeca(produto: Produto): string | null {
  const linhas: string[] = [];

  if (produto.codigoErp) linhas.push(`Referencia: ${produto.codigoErp}`);
  if (produto.descricaoEtiqueta) {
    linhas.push(`Etiqueta da casa: ${produto.descricaoEtiqueta}`);
  }
  if (produto.cor) linhas.push(`Metal: ${metalPorExtenso(produto.cor)}`);

  // A PEDRA VEM DE DOIS LUGARES, e os dois sao parciais: `tipo_pedra` esta em
  // 20% das pecas, e a etiqueta nomeia pedra que o campo nao tem. Juntar as
  // duas cobre mais do que qualquer uma sozinha.
  const pedras = new Set<string>();
  if (produto.tipoPedra) {
    // SO SE A SIGLA FOR CONHECIDA. `tipo_pedra` e campo de pedra, entao o
    // valor E uma pedra — mas `SAFAM` nao e palavra, e o prompt em ingles
    // carregaria a sigla como se fosse nome. Melhor calar.
    const palavra = palavraDaSigla(produto.tipoPedra);
    if (palavra) pedras.add(palavra);
  }
  if (produto.descricaoEtiqueta) {
    for (const p of pedrasDaEtiqueta(produto.descricaoEtiqueta)) pedras.add(p);
  }
  if (pedras.size > 0) linhas.push(`Pedras: ${[...pedras].join(', ')}`);

  if (produto.familia) linhas.push(`Familia: ${produto.familia}`);
  if (produto.pesoGramas) linhas.push(`Peso: ${produto.pesoGramas} g`);

  // PRECO, CUSTO E MARGEM NAO ENTRAM. O prompt descreve a peca para uma IA de
  // imagem; dinheiro nao melhora descricao nenhuma e e dado sensivel da casa
  // — as tres chaves de 28/09 existem por isso.
  return linhas.length > 0 ? linhas.join('\n') : null;
}
