import type { Relatorio } from './relatorio';

/**
 * DUAS TABELAS DA MESMA MENSAGEM VIRAM UMA — 27/10/2026.
 *
 * ==========================================================================
 * NASCEU DE UMA CONVERSA REAL, e o arquivo saiu com metade do que pediram.
 *
 * *"As vendas da Ylka em 2025 e 2026"*. A instrução de `de`/`ate` manda
 * chamar a ferramenta UMA VEZ POR PERÍODO — e está certa, porque numa
 * janela só o ranking sai da SOMA dos dois anos e a comparação se perde.
 * Só que cada chamada guardava a tabela na mesma chave, e a segunda
 * escrevia por cima da primeira. O PDF saiu com as 43 de 2026 e sem as 90
 * de 2025 — e a agente, sem nada que lhe dissesse o contrário, concluiu que
 * *"o caminho é o painel"*.
 *
 * A GUARDA FICA NO FUNIL, e não na instrução de cada ferramenta. É a regra
 * de 29/09: basta uma tradutora esquecer. Doze ferramentas aceitam `de` e
 * `ate`, seis devolvem lista, e qualquer uma delas chamada duas vezes caía
 * no mesmo buraco — calada.
 * ==========================================================================
 *
 * SÓ SOMA O QUE TEM A MESMA FORMA. Colunas diferentes são perguntas
 * diferentes, e aí a segunda substitui a primeira como sempre fez.
 *
 * E A LINHA DE TOTAL SAI. Somar "R$ 3.780.158" com "R$ 2.137.211" exigiria
 * desmontar o que já está escrito como texto; e um rodapé que soma só
 * metade das linhas é pior que nenhum, porque ninguém reconfere rodapé.
 */
export function somarRelatorios(
  primeiro: Relatorio,
  segundo: Relatorio,
): Relatorio | null {
  if (!mesmasColunas(primeiro.colunas, segundo.colunas)) return null;

  const linhas = [...primeiro.linhas];
  const vistas = new Set(primeiro.linhas.map(assinatura));
  for (const linha of segundo.linhas) {
    const chave = assinatura(linha);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    linhas.push(linha);
  }

  // A MESMA CONSULTA DUAS VEZES NÃO É SOMA. O modelo repetir a chamada
  // acontece, e aí "90 de 180" seria mentira em vez de conserto.
  if (linhas.length === primeiro.linhas.length) return primeiro;

  const total =
    (primeiro.exibindo?.total ?? primeiro.linhas.length) +
    (segundo.exibindo?.total ?? segundo.linhas.length);

  return {
    titulo: tituloSomado(primeiro.titulo, segundo.titulo),
    posicao: primeiro.posicao,
    paisagem: primeiro.paisagem || segundo.paisagem,
    colunas: primeiro.colunas,
    linhas,
    exibindo:
      total > linhas.length ? { mostradas: linhas.length, total } : undefined,
    nota: notaSomada(primeiro, segundo),
    geradoPor: primeiro.geradoPor ?? segundo.geradoPor,
  };
}

function mesmasColunas(
  a: Relatorio['colunas'],
  b: Relatorio['colunas'],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.chave === b[i].chave && c.titulo === b[i].titulo);
}

/** A linha inteira, para não repetir a mesma venda vinda de duas janelas. */
function assinatura(linha: Record<string, string>): string {
  return Object.keys(linha)
    .sort()
    .map((k) => `${k}=${linha[k]}`)
    .join('\u0001');
}

/**
 * "Vendas da Ylka · 2025" + "Vendas da Ylka · 2026" = "… · 2025 e 2026".
 *
 * O TÍTULO NÃO PODE FALAR DE UM RECORTE SÓ quando a tabela leva dois: é no
 * título que quem lê procura o recorte — a decisão de 21/10.
 */
function tituloSomado(primeiro: string, segundo: string): string {
  if (primeiro === segundo) return primeiro;
  const resto = segundo.slice(fimDoPrefixoComum(primeiro, segundo)).trim();
  return resto ? `${primeiro} e ${resto}` : primeiro;
}

/**
 * Onde os dois títulos deixam de ser iguais, recuado até o começo da
 * palavra — senão "2025"/"2026" sobraria como "6".
 */
function fimDoPrefixoComum(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  while (i > 0 && !SEPARADORES.has(a[i - 1])) i -= 1;
  return i;
}

const SEPARADORES = new Set([' ', '·', '—', '-', '/', ',']);

function notaSomada(
  primeiro: Relatorio,
  segundo: Relatorio,
): string | undefined {
  const avisoDoTotal =
    primeiro.total || segundo.total
      ? 'Dois recortes no mesmo arquivo — sem linha de total.'
      : '';
  const notas = [
    primeiro.nota,
    segundo.nota === primeiro.nota ? '' : segundo.nota,
    avisoDoTotal,
  ].filter((n): n is string => !!n && n.length > 0);
  return notas.length > 0 ? notas.join(' ') : undefined;
}
