import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ARMAZENAMENTO, CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import {
  PASTA_FINAIS,
  pastaDoCatalogo,
} from '../../domain/ports/armazenamento.port';
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
  /**
   * O que foi para a capa — volta para quem chama poder DIZER.
   *
   * A capa é escolhida por padrão, e escolha calada é escolha que ninguém
   * revisa: a agente conta qual peça abriu e o que ficou escrito, e aí ela
   * corrige numa frase se não era isso.
   */
  capa: { codigo: string | null; texto: string } | null;
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
   * @param capaDita qual foto abre o PDF — o CÓDIGO da peça ("AN26369") ou o
   *   id da foto. **Ausente, é a primeira do catálogo**: a capa é padrão, e
   *   não um extra que ela precise pedir.
   * @param textoDaCapa o que vai escrito sobre ela. Ausente, vale o NOME do
   *   catálogo — mas no vídeo ela troca o texto sem trocar a coleção
   *   (*"tirar o Under 25k e colocar News"*), e por isso ele é um parâmetro
   *   e não uma leitura do cadastro.
   */
  async execute(
    catalogoId: string,
    capaDita?: string | null,
    textoDaCapa?: string | null,
  ): Promise<PdfDeFotos> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    const naOrdem = [...catalogo.fotos].sort((a, b) => a.posicao - b.posicao);
    // ====================================================================
    // O CÓDIGO OU O ID — e o código é o que ela diz — 22/10/2026.
    //
    // A primeira versão comparava só com o id da foto (um uuid), e a
    // ferramenta pede à agente o CÓDIGO DA PEÇA. Nunca casava, e a capa era
    // ignorada EM SILÊNCIO: o PDF saía na ordem normal e ninguém sabia por
    // quê. Defeito que não quebra nada é o que mais demora a aparecer.
    // ====================================================================
    const procurado = String(capaDita ?? '')
      .trim()
      .toUpperCase();
    const escolhida = procurado
      ? naOrdem.find(
          (f) =>
            f.id.toUpperCase() === procurado ||
            (f.codigoErp ?? '').toUpperCase() === procurado,
        )
      : undefined;

    // ====================================================================
    // A CAPA É PADRÃO, E ELA SE REPETE — decisão dele em 22/10:
    //
    //   *"Deixa padrão: no gerar PDF, pega uma foto enviada e coloca o nome
    //   A.T Jewel e o nome do catálogo. Se ela quiser outra, ela fala."*
    //
    // E REPETIR NÃO É DEFEITO AQUI — era o que eu achava, e o vídeo mostrou
    // o contrário: o GPT fez *"uma capa usando uma das fotos que você
    // enviou, SEGUIDA DE TODAS as fotos originais"*. As duas páginas não são
    // iguais: a primeira tem a marca e o nome escritos por cima; a outra é a
    // peça limpa, com o preço dela. Tirar a peça do meio custaria a página
    // que a vende.
    // ====================================================================
    const capa = escolhida ?? naOrdem[0];
    const fila = capa ? [capa, ...naOrdem] : naOrdem;

    const cabem = fila.slice(0, MAX_PAGINAS);
    const cortadas = fila.length - cabem.length;

    // AS IMAGENS SAEM DO ARMAZENAMENTO ANTES DE DESENHAR. Ler no meio do
    // desenho misturaria IO com a montagem do documento, e uma falha no meio
    // deixaria um PDF pela metade — que é pior que nenhum.
    //
    // E CADA ARQUIVO SE LÊ UMA VEZ: a foto da capa aparece duas na fila, e
    // baixar 3 MB de novo para desenhar a mesma imagem seria pagar dobrado
    // por página.
    const lidas = new Map<string, Buffer>();
    const imagens: Buffer[] = [];
    for (const foto of cabem) {
      const chave = foto.arquivoId ?? foto.arquivoOriginalId;
      if (!chave) continue;
      let conteudo = lidas.get(chave);
      if (!conteudo) {
        const arquivo = await this.armazenamento.ler(chave);
        // LINHA SEM OBJETO É INCONSISTÊNCIA NOSSA, e não caminho feliz: a
        // foto some do PDF, o resto continua, e o log diz qual foi.
        if (!arquivo || arquivo.conteudo.length === 0) {
          this.logger.warn(
            `Foto ${foto.id} do catálogo ${catalogo.numero} está na base e não no armazenamento.`,
          );
          continue;
        }
        conteudo = arquivo.conteudo;
        lidas.set(chave, conteudo);
      }
      imagens.push(conteudo);
    }

    if (imagens.length === 0) {
      throw new NotFoundException(
        'Este catálogo não tem nenhuma foto para montar o PDF',
      );
    }

    // O TEXTO DA CAPA: o que ela pediu, ou o nome do catálogo.
    const titulo = capa
      ? (String(textoDaCapa ?? '').trim() || catalogo.nome).slice(0, 40)
      : null;
    const conteudo = await this.desenhar(imagens, titulo);
    const nome = `catalogo-${catalogo.numero}-${semAcento(catalogo.nome)}.pdf`;

    // ====================================================================
    // O PDF TAMBÉM FICA NO PAINEL — 22/10/2026, achado no primeiro teste em
    // produção: *"o pdf criado não foi para o painel"*.
    //
    // E é justo: ela gerou pela conversa, mas quem revisa, aprova e manda
    // para a cliente trabalha na tela. Um arquivo que só existe no WhatsApp
    // some no primeiro "limpar conversa" — e o painel continuaria dizendo
    // "ainda não montado" sobre um catálogo que ela já mandou.
    //
    // ACRESCENTA UMA VERSÃO, não substitui — a mesma regra do "Montar" do
    // painel, desde a migração 44. Gerar de novo depois de trocar a capa
    // deixa as duas à vista.
    //
    // `origem: 'IA'` porque é o valor que a tela lê como "Montado pelo
    // sistema" — e foi o sistema. 'MARKETING' é o arquivo que uma pessoa
    // subiu, e seria mentira.
    // ====================================================================
    const arquivoId = await this.armazenamento.guardar(
      { conteudo, mime: 'application/pdf', nomeOriginal: nome },
      pastaDoCatalogo(catalogo.numero, PASTA_FINAIS),
    );
    await this.repositorio.registrarFinal(catalogo.id, {
      origem: 'IA',
      arquivoId,
      nomeArquivo: nome,
      mime: 'application/pdf',
      tamanhoBytes: conteudo.length,
      // Nulo: quem montou foi o sistema, e não uma pessoa subindo arquivo.
      enviadoPor: null,
    });

    return {
      conteudo,
      nome,
      paginas: imagens.length,
      cortadas,
      capa:
        capa && titulo
          ? { codigo: capa.codigoErp ?? null, texto: titulo }
          : null,
    };
  }

  /**
   * Uma página por imagem, do tamanho dela.
   *
   * `autoFirstPage: false` porque a primeira página também tem de nascer com
   * o tamanho da primeira imagem — com a padrão, o PDF abriria com uma folha
   * A4 em branco antes da capa.
   */
  private desenhar(
    imagens: Buffer[],
    tituloDaCapa: string | null,
  ): Promise<Buffer> {
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

        imagens.forEach((imagem, i) => {
          // A dimensão real do arquivo; é dela que sai o tamanho da página.
          const { width, height } = medir.openImage(imagem);
          doc.addPage({ size: [width, height], margin: 0 });
          doc.image(imagem, 0, 0, { width, height });
          if (i === 0 && tituloDaCapa) {
            this.escreverNaCapa(doc, tituloDaCapa, width, height);
          }
        });
        doc.end();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /**
   * O NOME DO CATÁLOGO ESCRITO SOBRE A FOTO DE CAPA — 22/10/2026.
   *
   * ========================================================================
   * ESCOLHA DELE, DEPOIS DE VER AS DUAS OPÇÕES: *"letra A"* — a foto dela
   * como capa e o texto escrito por nós, em vez de mandar a imagem ao modelo
   * para ele reescrever a palavra.
   *
   * A razão é dupla. **A letra sai exata** — modelo de imagem erra letra, e
   * "New Opala" pode voltar "New Opaia" num PDF que vai para cliente. E a
   * edição por IA daria ao modelo licença para redesenhar a joia que a
   * modelo está usando: foi o que aconteceu em 31/08, quando ele trocou um
   * brinco por outro recortado de uma referência.
   *
   * DESENHADO DUAS VEZES, escuro e depois claro, com 2pt de deslocamento: é
   * sombra de pobre, e é o que mantém o nome legível tanto sobre cabelo
   * claro quanto sobre fundo escuro. Sem isso, metade das capas some.
   * ========================================================================
   */
  private escreverNaCapa(
    doc: PDFKit.PDFDocument,
    titulo: string,
    largura: number,
    altura: number,
  ): void {
    // Proporcional à página: a capa pode ser um story de 1080 ou um JPEG de
    // 4000 pixels, e tamanho fixo ficaria minúsculo num e gigante no outro.
    const corpo = Math.max(18, Math.round(largura * 0.085));
    const marca = Math.max(9, Math.round(largura * 0.022));
    const margem = Math.round(largura * 0.08);
    const util = largura - margem * 2;

    const escrever = (
      texto: string,
      y: number,
      tamanho: number,
      fonte: 'Helvetica' | 'Helvetica-Bold',
      espaco = 0,
    ) => {
      const comum = {
        width: util,
        align: 'center' as const,
        characterSpacing: espaco,
        lineBreak: false,
      };
      doc.font(fonte).fontSize(tamanho);
      doc
        .fillColor('#000000')
        .opacity(0.35)
        .text(texto, margem + 2, y + 2, comum);
      doc.fillColor('#ffffff').opacity(1).text(texto, margem, y, comum);
    };

    escrever('A.T JEWEL', altura * 0.06, marca, 'Helvetica', marca * 0.35);
    escrever(titulo.toUpperCase(), altura * 0.72, corpo, 'Helvetica-Bold');

    // O filete dourado, a mesma marca gráfica da capa do painel e do montador.
    const y = altura * 0.72 + corpo * 1.45;
    doc
      .opacity(1)
      .moveTo(largura / 2 - corpo, y)
      .lineTo(largura / 2 + corpo, y)
      .lineWidth(Math.max(1, corpo * 0.045))
      .strokeColor('#b8912f')
      .stroke();
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
