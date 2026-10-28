import type { PecasNaFaixa } from '../../movimentacoes/domain/ports/repositories/vendas-movimentacao-repository.port';
import { datasDeRecorte } from '../../../shared/tempo/recorte-de-datas';
import { moeda } from '../../../shared/formato/moeda';

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
  // ESTE ARQUIVO TINHA TRÊS `moeda` LOCAIS, e um deles cortava o centavo — o
  // deste recorte. Então o título dizia "acima de R$ 100.000" e a linha da
  // peça, dez linhas abaixo, dizia "R$ 52.500,00": dois desenhos de dinheiro
  // na MESMA mensagem. Um formatador só, em 28/10/2026.
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
  return `${v.nome} — ${v.pecas} peca(s), ${moeda(v.valor)}`;
}

/** Quantas pecas o MODELO recebe. A tabela, e o arquivo, levam todas. */
const PECAS_NA_CONVERSA = 10;

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
    // ====================================================================
    // A CONVERSA FICA COM DEZ, E A TABELA COM TUDO — 28/10/2026.
    //
    // Ao tirar o teto da consulta (582 pecas numa faixa ampla de 2026), a
    // lista inteira passou a ir TAMBEM para o modelo: uns 29 mil tokens de
    // resultado de ferramenta contra um teto de 1.500 na resposta. Ele
    // receberia tudo e nao teria como escrever.
    //
    // Dez e o que ele ja recebia (`LIMITE_PADRAO`); o corte agora e
    // DECLARADO em vez de ser efeito do limite da consulta. A lista inteira
    // sai pela tabela, escrita pelo nosso codigo.
    // ====================================================================
    linhas: r.linhas.slice(0, PECAS_NA_CONVERSA).map(linhaDaPecaNaFaixa),
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

/**
 * A TABELA DAS PEÇAS DA FAIXA — 28/10/2026.
 *
 * ==========================================================================
 * *"Não quero teto em nenhuma consulta. Ela quer ver o quadro completo."*
 * — Lucas, 28/10/2026.
 *
 * Esta era a ÚNICA lista da casa sem tabela rica em NENHUM dos dois canais —
 * nem a Anastasia nem a Helena. Sem tabela, o PDF era montado do texto da
 * conversa, e a conversa mostrava dez. Medido: uma faixa ampla em 2026 tem
 * **582 peças**.
 *
 * MORA AQUI, e não em cada serviço, pelo mesmo motivo que o `janelaDaFaixa` e
 * o `recorteEmPalavras` moram aqui desde 13/10: *"a Helena e a Anastasia
 * respondem a mesma pergunta"*, e uma correção feita de um lado só faria a
 * MESMA pergunta devolver tabelas diferentes conforme quem perguntou.
 * ==========================================================================
 *
 * SETE COLUNAS, então a folha vai deitada — a regra da casa. A `vendedora` é
 * a última porque no canal dela é sempre a mesma pessoa; na gestão é o que
 * diferencia as linhas.
 */
export function tabelaDasPecasNaFaixa(
  pecas: {
    codigoErp: string | null;
    descricao: string | null;
    valorUnitario: number;
    quantidade: number;
    quando: Date;
    clienteNome: string | null;
    vendedoraNome: string | null;
  }[],
  recorte: string,
  opcoes: { posicao: string; geradoPor?: string | null; total?: number },
) {
  return {
    titulo: `Peças vendidas — ${recorte}`,
    posicao: opcoes.posicao,
    paisagem: true,
    colunas: [
      { chave: 'data', titulo: 'Data', peso: 1, mono: true },
      { chave: 'codigo', titulo: 'Código', peso: 1, mono: true },
      { chave: 'peca', titulo: 'Peça', peso: 3.2 },
      { chave: 'quantidade', titulo: 'Qtd', peso: 0.5, alinhamento: 'direita' as const, mono: true },
      {
        // O MESMO 1.35 da listagem de vendas, pelo mesmo motivo: o centavo
        // pede 76,8pt e a coluna encolheria a fonte do número.
        chave: 'valor',
        titulo: 'Valor',
        peso: 1.35,
        alinhamento: 'direita' as const,
        mono: true,
      },
      { chave: 'cliente', titulo: 'Cliente', peso: 2 },
      { chave: 'vendedora', titulo: 'Vendedora', peso: 1.4 },
    ],
    linhas: pecas.map((p) => ({
      data: p.quando.toLocaleDateString('pt-BR'),
      codigo: p.codigoErp ?? '—',
      peca: p.descricao ?? p.codigoErp ?? 'peça sem descrição',
      quantidade: String(p.quantidade),
      valor: moeda(p.valorUnitario),
      cliente: p.clienteNome ?? '—',
      vendedora: p.vendedoraNome ?? '—',
    })),
    exibindo:
      opcoes.total !== undefined && opcoes.total > pecas.length
        ? { mostradas: pecas.length, total: opcoes.total }
        : undefined,
    nota: 'Valor UNITÁRIO da peça, que é o que a faixa filtra — não o valor do documento.',
    geradoPor: opcoes.geradoPor ?? undefined,
  };
}
