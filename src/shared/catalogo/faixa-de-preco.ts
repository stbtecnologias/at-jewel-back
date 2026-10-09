/**
 * A FAIXA DE PREÇO DA PERGUNTA — 07/10/2026.
 *
 * ==========================================================================
 * "QUERO PUXAR UMA TABELA DE PEÇAS ATÉ 20 MIL REAIS, COM FOTOS."
 *
 * A gestora pediu isso à Anastasia em 07/10 e ouviu que não dava. O relatório
 * do Safira que ela usa hoje — *Posição de estoque* — tem no cabeçalho
 * exatamente isto: "Valor de  a 25.000,00".
 *
 * E a faixa NÃO é fixa: decisão do Lucas no mesmo dia — "é o que ela definir;
 * se ela quiser até 75.985,25, você traz".
 *
 * Medido na base, o que existe COM SALDO:
 *
 *   até 1 mil     166        10 a 20 mil     48
 *   1 a 5 mil      60        acima de 20 mil 239   (a maior: R$ 999.000)
 *   5 a 10 mil     33
 * ==========================================================================
 */

export interface Faixa {
  de?: number;
  ate?: number;
}

/**
 * Lê os dois extremos como a pergunta mandou, e conserta o que dá para
 * consertar sem adivinhar.
 *
 * O MODELO MANDA TEXTO. Já chegou `"20000"`, `"20.000"` e `"R$ 20 mil"` em
 * campos numéricos de outras ferramentas; os dois primeiros viram número, o
 * terceiro é descartado — faixa errada filtra em silêncio, e silêncio aqui é
 * o defeito que este dia inteiro combateu.
 *
 * INVERTIDA, TROCA. "De 20 mil a 5 mil" é a mesma faixa dita ao contrário;
 * recusar devolveria zero peça para uma pergunta legítima.
 */
export function faixaDePreco(de?: unknown, ate?: unknown): Faixa {
  const umDeles = (v: unknown): number | undefined => {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined;
    if (typeof v !== 'string') return undefined;
    // Aceita "20000", "20.000" e "20000,50" — o ponto é separador de milhar
    // no que vem escrito em português, e a vírgula é o decimal.
    const limpo = v.trim().replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(limpo)) return undefined;
    const n = Number(limpo);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  let piso = umDeles(de);
  let teto = umDeles(ate);
  if (piso !== undefined && teto !== undefined && piso > teto) {
    [piso, teto] = [teto, piso];
  }
  return { de: piso, ate: teto };
}

/** Como a faixa aparece na frase da agente. */
export function faixaEmPalavras(faixa: Faixa): string {
  const real = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (faixa.de !== undefined && faixa.ate !== undefined) {
    return `de ${real(faixa.de)} a ${real(faixa.ate)}`;
  }
  if (faixa.ate !== undefined) return `ate ${real(faixa.ate)}`;
  if (faixa.de !== undefined) return `a partir de ${real(faixa.de)}`;
  return '';
}
