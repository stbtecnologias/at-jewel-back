import type { PecasNaFaixa } from '../../movimentacoes/domain/ports/repositories/vendas-movimentacao-repository.port';
import { datasDeRecorte } from '../../../shared/tempo/recorte-de-datas';

/**
 * O PERIODO E A FAIXA, MONTADOS UMA VEZ SO PARA OS DOIS CANAIS — 13/10/2026.
 *
 * ==========================================================================
 * A HELENA E A ANASTASIA RESPONDEM A MESMA PERGUNTA.
 *
 * "Quantas pecas acima de 100 mil eu vendi em 2025" e "quantas a loja vendeu"
 * sao o mesmo calculo com escopos diferentes. Se cada servico montasse a
 * janela e a frase do recorte, bastaria uma correcao feita de um lado para a
 * MESMA pergunta devolver periodos diferentes conforme quem pergunta — que e
 * o defeito que o `datasDeRecorte` foi criado para impedir em 28/09.
 * ==========================================================================
 */

/** Sem datas, o periodo e o ANO CORRENTE — o recorte mais pedido. */
export function janelaDaFaixa(
  de: string | undefined,
  ate: string | undefined,
  agora: Date = new Date(),
): { de: Date; ate: Date } {
  const livre = datasDeRecorte(de, ate);
  if (livre) {
    // O FIM E O DIA INTEIRO: "ate 31/08" sem isto perderia o dia 31.
    const fim = new Date(livre.ate);
    fim.setHours(23, 59, 59, 999);
    return { de: livre.de, ate: fim };
  }
  const inicio = new Date(agora.getFullYear(), 0, 1, 0, 0, 0, 0);
  const fim = new Date(agora.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { de: inicio, ate: fim };
}

/**
 * O recorte em palavras — a faixa e o periodo, para a resposta dizer.
 *
 * Sem isto "59 pecas" e um numero solto: quem compara com outro mes nao sabe
 * que o corte mudou. Montado aqui, e nao pelo modelo, porque e exatamente o
 * tipo de coisa que ele parafrasearia errado.
 */
export function recorteEmPalavras(
  faixa: { minimo?: number; maximo?: number },
  janela: { de: Date; ate: Date },
): string {
  const moeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const dia = (d: Date) => d.toLocaleDateString('pt-BR');

  let valor: string;
  if (faixa.minimo !== undefined && faixa.maximo !== undefined) {
    valor = `entre ${moeda(faixa.minimo)} e ${moeda(faixa.maximo)}`;
  } else if (faixa.minimo !== undefined) {
    valor = `acima de ${moeda(faixa.minimo)}`;
  } else {
    valor = `ate ${moeda(faixa.maximo ?? 0)}`;
  }
  return `${valor}, de ${dia(janela.de)} a ${dia(janela.ate)}`;
}

/** A linha de uma peca da faixa, igual nos dois canais. */
export function linhaDaPecaNaFaixa(p: {
  codigoErp: string | null;
  descricao: string | null;
  valorUnitario: number;
  quantidade: number;
  quando: Date;
  clienteNome: string | null;
  vendedoraNome: string | null;
}): string {
  const moeda = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const quantas = p.quantidade > 1 ? ` x${p.quantidade}` : '';
  const quem = p.clienteNome ? ` — ${p.clienteNome}` : '';
  const vend = p.vendedoraNome ? ` (${p.vendedoraNome})` : '';
  return (
    `${p.descricao ?? p.codigoErp ?? 'peca sem descricao'}${quantas} — ` +
    `${moeda(p.valorUnitario)} em ${p.quando.toLocaleDateString('pt-BR')}${quem}${vend}`
  );
}

/** A quebra por vendedora, numa linha cada. */
export function linhaDaVendedoraNaFaixa(v: {
  nome: string;
  pecas: number;
  valor: number;
}): string {
  const moeda = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `${v.nome} — ${v.pecas} peca(s), ${moeda(v.valor)}`;
}

/** O resultado do repositorio virando o que o modelo le. */
export function pecasParaOModelo(
  r: PecasNaFaixa & { deslocamento: number },
  recorte: string,
) {
  return {
    pecas: r.pecas,
    valor: r.valor,
    devolvidas: r.devolvidas,
    porVendedora: r.porVendedora.map(linhaDaVendedoraNaFaixa),
    linhas: r.linhas.map(linhaDaPecaNaFaixa),
    totalDeLinhas: r.totalDeLinhas,
    deslocamento: r.deslocamento,
    recorte,
  };
}

/** O que volta quando a faixa nao ficou de pe — nenhuma consulta rodou. */
export const FAIXA_INVALIDA = {
  pecas: 0,
  valor: 0,
  devolvidas: 0,
  porVendedora: [] as string[],
  linhas: [] as string[],
  totalDeLinhas: 0,
  deslocamento: 0,
  recorte: '',
  faixaInvalida: true as const,
};
