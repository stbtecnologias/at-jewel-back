import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ARMAZENAMENTO, CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IArmazenamento } from '../../domain/ports/armazenamento.port';
import type { ICatalogoRepository } from '../../domain/ports/repositories/catalogo-repository.port';

/** Teto de páginas. Um PDF de 60 fotos ninguém abre no celular. */
const MAX_PAGINAS = 40;

export interface PdfDeFotos {
  conteudo: Buffer;
  nome: string;
  /** Quantas entraram e quantas ficaram de fora do teto. */
  paginas: number;
  cortadas: number;
}

/**
 * O CATÁLOGO EM PDF, UMA FOTO POR PÁGINA — RF47, 22/10/2026.
 *
 * ==========================================================================
 * É O QUE ELA FAZ HOJE NO CHATGPT, e a descrição do Lucas é a especificação
 * inteira:
 *
 *   *"As fotos já são a página inteira, e os preços já estão nas fotos. O que
 *   falta é pegar a foto e colocar no PDF inteiro. E a capa ela diz qual
 *   seria."*
 *
 * ENTÃO AQUI NÃO SE DESENHA NADA. Sem cartão de preço, sem grade, sem fundo
 * gerado, sem texto por cima: a imagem que o marketing produziu já tem a
 * joia, o preço e o parcelamento marcados nela. Qualquer coisa que este
 * código escrevesse por cima competiria com o que já está lá.
 *
 * E É POR ISSO QUE ELE NÃO É O `MontarCatalogoUseCase`. Aquele monta a peça
 * de arte — direção, capa gerada, grade de oito, preço lido do banco a cada
 * desenho. Este aqui empilha fotos. São dois produtos diferentes com o mesmo
 * nome, e misturá-los faria o simples carregar a complexidade do outro.
 * ==========================================================================
 *
 * A PÁGINA TEM O TAMANHO DA IMAGEM, e não o contrário. Encaixar uma foto 9:16
 * numa folha A4 deixaria tarja branca em cima e embaixo — e o que ela manda
 * para a cliente é a imagem, não uma folha com a imagem dentro.
 */
@Injectable()
export class PdfDeFotosUseCase {
  private readonly logger = new Logger(PdfDeFotosUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * @param capaFotoId a foto que ela escolheu para abrir. Ela sobe para a
   *   primeira página e NÃO se repete no meio — abrir e repetir faria o PDF
   *   parecer defeito.
   */
  async execute(catalogoId: string, capaFotoId?: string | null): Promise<PdfDeFotos> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    const naOrdem = [...catalogo.fotos].sort((a, b) => a.posicao - b.posicao);
    const capa = capaFotoId
      ? naOrdem.find((f) => f.id === capaFotoId)
      : undefined;
    const fila = capa
      ? [capa, ...naOrdem.filter((f) => f.id !== capa.id)]
      : naOrdem;

    const cabem = fila.slice(0, MAX_PAGINAS);
    const cortadas = fila.length - cabem.length;

    // AS IMAGENS SAEM DO ARMAZENAMENTO ANTES DE DESENHAR. Ler no meio do
    // desenho misturaria IO com a montagem do documento, e uma falha no meio
    // deixaria um PDF pela metade — que é pior que nenhum.
    const imagens: Buffer[] = [];
    for (const foto of cabem) {
      const chave = foto.arquivoId ?? foto.arquivoOriginalId;
      if (!chave) continue;
      const arquivo = await this.armazenamento.ler(chave);
      // LINHA SEM OBJETO É INCONSISTÊNCIA NOSSA, e não caminho feliz: a foto
      // some do PDF, o resto continua, e o log diz qual foi.
      if (!arquivo || arquivo.conteudo.length === 0) {
        this.logger.warn(
          `Foto ${foto.id} do catálogo ${catalogo.numero} está na base e não no armazenamento.`,
        );
        continue;
      }
      imagens.push(arquivo.conteudo);
    }

    if (imagens.length === 0) {
      throw new NotFoundException(
        'Este catálogo não tem nenhuma foto para montar o PDF',
      );
    }

    const conteudo = await this.desenhar(imagens);
    return {
      conteudo,
      nome: `catalogo-${catalogo.numero}-${semAcento(catalogo.nome)}.pdf`,
      paginas: imagens.length,
      cortadas,
    };
  }

  /**
   * Uma página por imagem, do tamanho dela.
   *
   * `autoFirstPage: false` porque a primeira página também tem de nascer com
   * o tamanho da primeira imagem — com a padrão, o PDF abriria com uma folha
   * A4 em branco antes da capa.
   */
  private desenhar(imagens: Buffer[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
      const pedacos: Buffer[] = [];
      doc.on('data', (p: Buffer) => pedacos.push(p));
      doc.on('end', () => resolve(Buffer.concat(pedacos)));
      doc.on('error', reject);

      try {
        // `openImage` EXISTE E NÃO ESTÁ NA TIPAGEM do @types/pdfkit. É a
        // mesma função que o `doc.image` usa por dentro para medir o arquivo;
        // sem ela, a única alternativa seria uma biblioteca nova só para ler
        // dois números do cabeçalho do JPEG.
        const medir = doc as unknown as {
          openImage(src: Buffer): { width: number; height: number };
        };

        for (const imagem of imagens) {
          // A dimensão real do arquivo; é dela que sai o tamanho da página.
          const { width, height } = medir.openImage(imagem);
          doc.addPage({ size: [width, height], margin: 0 });
          doc.image(imagem, 0, 0, { width, height });
        }
        doc.end();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
}

/** O nome vira nome de arquivo: sem acento, sem espaço, sem surpresa. */
function semAcento(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'catalogo'
  );
}
