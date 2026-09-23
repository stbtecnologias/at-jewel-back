import type { FormatoCatalogo } from '../domain/entities/enums';
import type { DirecaoDeArte } from '../domain/ports/estilo-catalogo.port';

/**
 * O PLANO DE UMA MONTAGEM — o que foi decidido, guardado junto do PDF.
 *
 * ==========================================================================
 * POR QUE EXISTE — 16/09/2026.
 *
 * A pergunta veio de quem viu o catalogo apresentado: "se a pessoa quiser
 * falar 'na pagina 4 ajuste isso, na pagina 5 deixe assim', da certo?". Nao
 * dava: cada "Montar" gerava tudo do zero, e refazer a pagina 4 mudaria a
 * capa, o fundo e as outras modelos junto.
 *
 * Com o plano guardado, o ajuste parte da versao que a pessoa VIU: a mesma
 * ordem de paginas, as mesmas imagens geradas, e so o que foi pedido muda.
 * ==========================================================================
 *
 * SEM MIGRACAO: o plano mora no armazenamento, em `<chave do PDF>.plano.json`,
 * e as imagens geradas ao lado dele. A ligacao e o proprio nome do arquivo.
 *
 * O PLANO NAO GUARDA PRECO NEM DESCRICAO — so o `fotoId`. O texto da pagina e
 * lido do banco a cada desenho, entao um parcelamento corrigido no painel
 * entra no ajuste seguinte. Em catalogo, digito e dinheiro, e dinheiro vem do
 * banco.
 */
export interface PlanoDaMontagem {
  versao: 1;
  formato: FormatoCatalogo;
  /** `null` = catalogo sem tema: branco, sem imagem gerada. */
  direcao: DirecaoDeArte | null;
  paginas: PaginaDoPlano[];
  /**
   * Onde cada imagem gerada foi gravada, pelo nome logico: `capa`, `fundo`,
   * `modelo:<fotoId>`. Preenchido na gravacao.
   */
  arquivos: Record<string, string>;
}

export type PaginaDoPlano =
  | { tipo: 'capa' }
  /** A imagem e a de `modelo:<fotoId>` em `arquivos`. */
  | { tipo: 'modelo'; fotoId: string }
  | { tipo: 'grade'; fotoIds: string[] }
  | { tipo: 'contracapa' };

/** Nome logico da foto na modelo de uma peca. */
export const nomeDaModelo = (fotoId: string) => `modelo:${fotoId}`;

/** Onde mora o plano de um PDF montado. */
export function chaveDoPlano(chaveDoPdf: string): string {
  return `${semExtensao(chaveDoPdf)}.plano.json`;
}

/**
 * Onde mora uma imagem gerada de um PDF montado.
 *
 * O `:` do nome logico vira `-`: dois-pontos em chave funciona no S3, mas nao
 * em nome de arquivo no Windows — e o armazenamento em disco roda aqui.
 */
export function chaveDaImagem(
  chaveDoPdf: string,
  nome: string,
  mime: string,
): string {
  const extensao = mime === 'image/png' ? 'png' : 'jpg';
  return `${semExtensao(chaveDoPdf)}.${nome.replace(/:/g, '-')}.${extensao}`;
}

/** Todas as pecas do plano, na ordem em que aparecem. */
export function fotosDoPlano(plano: PlanoDaMontagem): string[] {
  return plano.paginas.flatMap((p) =>
    p.tipo === 'modelo' ? [p.fotoId] : p.tipo === 'grade' ? p.fotoIds : [],
  );
}

/**
 * OITO PEÇAS POR PÁGINA DE GRADE, no máximo.
 *
 * Levantado no catálogo "New In" real, em 01/09/2026: 4 colunas por 2 linhas
 * em paisagem; em retrato, 2 por 4.
 */
export const POR_PAGINA = 8;

/**
 * Quantas peças vão em cada página de grade, REPARTIDAS POR IGUAL.
 *
 * Dez peças eram oito e duas — e a segunda página saía com duas peças
 * perdidas. Agora são cinco e cinco; dezessete, seis, seis e cinco. O número
 * de páginas não muda, só a divisão.
 */
export function repartir(quantidade: number): number[] {
  if (quantidade === 0) return [];
  const paginas = Math.ceil(quantidade / POR_PAGINA);
  const base = Math.floor(quantidade / paginas);
  const sobra = quantidade % paginas;
  return Array.from({ length: paginas }, (_, i) => base + (i < sobra ? 1 : 0));
}

/** Uma página como ela SAI no PDF, com o número que a pessoa vê. */
export type PaginaDoPdf =
  | { numero: number; indice: number; tipo: 'capa' }
  | { numero: number; indice: number; tipo: 'modelo'; fotoId: string }
  | { numero: number; indice: number; tipo: 'grade'; fotoIds: string[] }
  | { numero: number; indice: number; tipo: 'contracapa' };

/**
 * AS PÁGINAS COMO SAEM NO PDF — a única regra de numeração.
 *
 * ==========================================================================
 * O DESENHO E O AJUSTE LEEM DAQUI, e é isso que faz "na página 4" apontar
 * para a página 4 que a pessoa viu. Se cada um contasse do seu jeito, uma
 * peça tirada do catálogo deslocaria a numeração de um e não do outro.
 * ==========================================================================
 *
 * - peça que não está mais no catálogo não entra, e grade vazia some;
 * - modelo sem a foto gerada vira uma grade só com a peça — ela não some;
 * - grade com mais de oito é repartida.
 *
 * `indice` é a posição em `plano.paginas`, para quem precisa alterar o plano.
 */
export function paginasDoPdf(
  plano: PlanoDaMontagem,
  presente: (fotoId: string) => boolean,
  temImagem: (nome: string) => boolean,
): PaginaDoPdf[] {
  const saida: PaginaDoPdf[] = [];
  const numero = () => saida.length + 1;

  plano.paginas.forEach((pagina, indice) => {
    switch (pagina.tipo) {
      case 'capa':
      case 'contracapa':
        saida.push({ numero: numero(), indice, tipo: pagina.tipo });
        break;
      case 'modelo':
        if (!presente(pagina.fotoId)) break;
        if (temImagem(nomeDaModelo(pagina.fotoId))) {
          saida.push({
            numero: numero(),
            indice,
            tipo: 'modelo',
            fotoId: pagina.fotoId,
          });
        } else {
          saida.push({
            numero: numero(),
            indice,
            tipo: 'grade',
            fotoIds: [pagina.fotoId],
          });
        }
        break;
      case 'grade': {
        const ids = pagina.fotoIds.filter(presente);
        let inicio = 0;
        for (const quantas of repartir(ids.length)) {
          saida.push({
            numero: numero(),
            indice,
            tipo: 'grade',
            fotoIds: ids.slice(inicio, inicio + quantas),
          });
          inicio += quantas;
        }
        break;
      }
    }
  });

  return saida;
}

function semExtensao(chave: string): string {
  return chave.replace(/\.[a-z0-9]+$/i, '');
}
