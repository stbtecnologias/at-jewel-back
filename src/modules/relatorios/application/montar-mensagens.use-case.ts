import { Injectable } from '@nestjs/common';
import type { Relatorio } from '../domain/relatorio';
import { UltimoRelatorioService } from './ultimo-relatorio.service';

/**
 * Quantos caracteres cabem numa mensagem nossa.
 *
 * ==========================================================================
 * O WhatsApp de consumidor — que é o que o WAHA fala — aceita 65.536. Vinte
 * mil é folga deliberada: a mesma lista pelo WhatsApp Business da Meta
 * esbarraria em 4.096, e uma mensagem de 65 mil caracteres é um bloco que o
 * aplicativo demora para desenhar no celular.
 *
 * E a quebra NUNCA parte uma linha no meio: linha cortada em duas mensagens é
 * um registro que ninguém consegue ler, e dois pedaços que parecem dois
 * registros.
 * ==========================================================================
 */
const CARACTERES_POR_MENSAGEM = 20_000;

/**
 * Quantas mensagens uma resposta pode mandar — e por que o teto existe.
 *
 * ==========================================================================
 * O RF-12 LIMITA 30 MENSAGENS POR DESTINO POR HORA, e o comentário do
 * `LimiteDeEnvioService` diz por quê: contas de WhatsApp já foram bloqueadas
 * DEFINITIVAMENTE por volume. Uma resposta que manda dez mensagens come um
 * terço do orçamento da hora de quem está conversando.
 *
 * As 1.412 vendas desde 2023 dão 2 mensagens; o catálogo inteiro daria umas
 * dez. Então acima de três a lista vira ARQUIVO — que leva o mesmo conteúdo,
 * numa mensagem só, e ainda abre melhor.
 *
 * Trocar este número é uma linha. O que não dá para desfazer é um bloqueio.
 * ==========================================================================
 */
const MAXIMO_DE_MENSAGENS = 3;

/** O separador entre as células de uma linha. */
const ENTRE_CELULAS = ' | ';

/**
 * O que a lista inteira virou: as mensagens prontas, ou o aviso de que não
 * cabe em mensagem.
 */
export interface ListaEmMensagens {
  /** Prontas para o `enviarTexto`, na ordem. Vazio quando não cabe. */
  mensagens: string[];
  /** Quantas linhas foram escritas. */
  linhas: number;
  /** Quantas existem — igual a `linhas` quando a tabela levou tudo. */
  total: number;
  /** Quantas mensagens seriam necessárias (mesmo acima do teto). */
  mensagensNecessarias: number;
  /** true = passou do teto de mensagens; quem chama manda o arquivo. */
  preferirArquivo: boolean;
}

/**
 * A LISTA INTEIRA NA CONVERSA, ESCRITA POR NÓS — 28/10/2026.
 *
 * ==========================================================================
 * *"Por padrão toda lista ou consulta deve listar tudo... se não tiver deve
 * vir tudo de uma vez no WhatsApp."* — Lucas, 27/10/2026.
 *
 * O QUE ESTE CASO DE USO EXISTE PARA NÃO FAZER: pedir ao modelo que repita a
 * lista. Medido com o tokenizador do `claude-opus-4-8` nas 1.412 vendas desde
 * 2023, se ele reescrevesse:
 *
 *   73.126 tokens de saída · ~20 minutos gerando · US$ 1,83 por resposta
 *
 * E o número não é o pior. Em 09/10 ele anunciou *"os 20 primeiros"* e listou
 * DEZ, com vinte linhas na mão. Com mil linhas ele vai perder linhas, e não
 * vai existir jeito de alguém perceber — é a regra de 21/10 (*"número cortado
 * ela lê e acredita"*) em escala.
 *
 * Então a agente escreve UMA FRASE e o envio da lista é nosso: formatado
 * aqui, direto da tabela que a consulta guardou. Zero reescrita, zero linha
 * perdida, zero token de saída pelas linhas.
 * ==========================================================================
 *
 * É O MESMO DESENHO DO ARQUIVO, de 24/09: *"o arquivo sai DAQUI, e não do que
 * o modelo escreveu"*. Uma consulta, uma tabela, três destinos — a conversa,
 * o PDF e a planilha —, e os três leem da mesma linha.
 *
 * A NUMERAÇÃO NÃO É ENFEITE: "1." a "1.110." é o que deixa quem lê conferir
 * que nada foi pulado. Num listão sem número, uma linha que falte no meio é
 * invisível.
 */
@Injectable()
export class MontarMensagensUseCase {
  constructor(private readonly ultimo: UltimoRelatorioService) {}

  /**
   * Quantas linhas da última tabela a conversa não mostrou.
   *
   * Fica aqui, e não no canal, porque é a mesma pergunta que o
   * `EntregarRelatorioUseCase` faz antes de mandar a lista sozinha — e os
   * dois canais passam por ele.
   */
  quantasNaoForamMostradas(chave: string | null | undefined): number {
    return this.ultimo.quantasNaoForamMostradas(chave);
  }

  execute(chave: string | null | undefined): ListaEmMensagens | null {
    const guardado = this.ultimo.pegar(chave);
    if (!guardado) return null;

    const linhas = linhasEmTexto(guardado);
    if (linhas.length === 0) return null;

    const total = guardado.exibindo?.total ?? linhas.length;
    const cabecalho = cabecalhoDe(guardado, linhas.length, total);
    const partes = quebrar(
      cabecalho,
      cabecalhoDasColunas(guardado),
      linhas,
      rodapeDe(guardado),
    );

    if (partes.length > MAXIMO_DE_MENSAGENS) {
      return {
        mensagens: [],
        linhas: linhas.length,
        total,
        mensagensNecessarias: partes.length,
        preferirArquivo: true,
      };
    }

    return {
      mensagens: numerarPartes(partes),
      linhas: linhas.length,
      total,
      mensagensNecessarias: partes.length,
      preferirArquivo: false,
    };
  }
}

/**
 * Cada linha da tabela numa linha de texto, numerada.
 *
 * ==========================================================================
 * TODA CÉLULA ENTRA, INCLUSIVE O TRAÇO — e a primeira versão disto estava
 * errada. Pego no teste do Lucas, em 28/10/2026.
 *
 * Eu tirava as células vazias para economizar caracteres. Numa tabela com uma
 * coluna por ano, o resultado foi este:
 *
 *   36. ANA MARIA | 3 | R$ 76.790,00 | R$ 76.790,00
 *
 * Três peças de QUAL ano? Quem comprou só em 2026 perdia as duas células de
 * 2025, a linha encurtava, e os números escorregavam para a posição de outra
 * coluna — **cada linha passava a significar uma coisa diferente.**
 *
 * A tabela do PDF não tem esse problema porque tem CABEÇALHO em cima de cada
 * coluna. A mensagem não tinha, e foi por isso que ela ganhou um
 * (`cabecalhoDasColunas`). Com o cabeçalho a posição volta a significar — e
 * para a posição significar, nenhuma célula pode faltar.
 * ==========================================================================
 */
function linhasEmTexto(r: Relatorio): string[] {
  return r.linhas.map((linha, i) => {
    const celulas = r.colunas
      .map((c) => String(linha[c.chave] ?? '').trim() || '—')
      .join(ENTRE_CELULAS);
    return `${i + 1}. ${celulas}`;
  });
}

/**
 * Os títulos das colunas, na mesma ordem das células.
 *
 * VAI EM TODAS AS PARTES, e não só na primeira: quem rola até a parte 2 não
 * tem o cabeçalho na tela, e sem ele a linha volta a ser número solto.
 */
function cabecalhoDasColunas(r: Relatorio): string {
  if (r.colunas.length <= 1) return '';
  return r.colunas.map((c) => c.titulo).join(ENTRE_CELULAS);
}

function cabecalhoDe(r: Relatorio, mostradas: number, total: number): string {
  const quantas =
    mostradas === total
      ? `${total} ${total === 1 ? 'linha' : 'linhas'}`
      : `${mostradas} de ${total}`;
  return [r.titulo, [quantas, r.posicao].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join(String.fromCharCode(10));
}

/**
 * O rodapé: o total da tabela, a nota e o aviso de que o conteúdo é interno.
 *
 * O AVISO VAI AQUI PELO MESMO MOTIVO QUE VAI NO PDF — ver `AVISO_INTERNO`. A
 * mensagem leva nome de cliente e sai do nosso controle no segundo em que
 * chega no WhatsApp de alguém; a única coisa que ainda dá para fazer é dizer,
 * no próprio texto, que não é para repassar.
 */
function rodapeDe(r: Relatorio): string {
  const partes: string[] = [];
  if (r.total) {
    const celulas = r.colunas
      .map((c) => String(r.total?.[c.chave] ?? '').trim())
      .filter((v) => v.length > 0 && v !== '—')
      .join(ENTRE_CELULAS);
    if (celulas) partes.push(celulas);
  }
  if (r.nota) partes.push(r.nota);
  partes.push('Dados de clientes — não repassar.');
  return partes.join(String.fromCharCode(10));
}

/**
 * Quebra em mensagens sem partir linha, com o cabeçalho em todas e o rodapé
 * só na última.
 */
function quebrar(
  cabecalho: string,
  colunas: string,
  linhas: string[],
  rodape: string,
): string[][] {
  const NL = String.fromCharCode(10);
  const partes: string[][] = [];
  let atual: string[] = [];
  const fixo = cabecalho.length + colunas.length + NL.length * 4;
  let tamanho = fixo;

  for (const linha of linhas) {
    const custo = linha.length + NL.length;
    // UMA LINHA SOZINHA MAIOR QUE O TETO entra de todo jeito: o WhatsApp
    // aceita 65 mil, então ela chega — e cortá-la seria perder o registro.
    if (atual.length > 0 && tamanho + custo > CARACTERES_POR_MENSAGEM) {
      partes.push(atual);
      atual = [];
      tamanho = fixo;
    }
    atual.push(linha);
    tamanho += custo;
  }
  if (atual.length > 0) partes.push(atual);
  if (partes.length === 0) return [];

  // O RODAPÉ SÓ NA ÚLTIMA: repetido em todas, o "não repassar" vira ruído, e
  // o total apareceria no meio da lista como se fechasse ali.
  return partes.map((linhas, i) => [
    cabecalho +
      (partes.length > 1 ? ` (parte ${i + 1} de ${partes.length})` : ''),
    ...(colunas ? [colunas] : []),
    linhas.join(NL),
    ...(i === partes.length - 1 ? [rodape] : []),
  ]);
}

function numerarPartes(partes: string[][]): string[] {
  const NL = String.fromCharCode(10);
  return partes.map((blocos) => blocos.join(NL + NL));
}
