import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  pastaDoCatalogo,
  PASTA_FINAIS,
  type IArmazenamento,
} from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import { valorDaParcela } from '../../domain/ports/repositories/catalogo-repository.port';
import type {
  CatalogoDetalhe,
  FotoItem,
  ICatalogoRepository,
} from '../../domain/ports/repositories/catalogo-repository.port';

/**
 * A página, em pontos de PDF (1 pt = 1/72 pol).
 *
 * 720 x 1280 é 9:16 exato — a proporção do story. O 16:9 é o mesmo par
 * invertido. Números redondos na razão certa importam mais que o tamanho
 * absoluto: o PDF é vetorial, e quem imprimir escala sem perder nada.
 */
const PAGINA = { curto: 720, longo: 1280 };

/** Respiro nas bordas. Generoso de propósito: catálogo de joia é branco. */
const MARGEM = 48;

/**
 * OITO PEÇAS POR PÁGINA, e a disposição segue o formato.
 *
 * Levantado no catálogo "New In" real, em 01/09/2026: as páginas de grade têm
 * QUATRO COLUNAS POR DUAS LINHAS, em paisagem. Em retrato o mesmo oito vira
 * duas por quatro — muda a forma da folha, não a densidade.
 *
 * UMA PEÇA POR PÁGINA era o desenho anterior, decidido antes de eu ver o
 * material. Numa folha 16:9 aquilo desperdiçava metade do papel, e nenhuma
 * página do catálogo da casa faz isso.
 */
const POR_PAGINA = 8;

/** Espaço entre as células da grade. */
const GAP = 18;

/**
 * Fração da altura da célula que a foto ocupa. O resto é do texto.
 *
 * A peça domina, mas o descritivo não fica espremido. Constante e não cálculo
 * automático porque o equilíbrio é editorial — quem ajustar isto está mexendo
 * no visual da casa.
 */
const FATIA_DA_FOTO = 0.55;

/**
 * O DESCRITIVO NÃO É PRETO no catálogo da casa — é um azul-petróleo escuro, e
 * só as linhas de valor são pretas. Conferido nas páginas do "New In".
 */
const COR_DESCRITIVO = '#1f3a5f';
const COR_VALOR = '#111111';

/**
 * A peça sem preço tem frase própria, e ela É IMPRESSA.
 *
 * Aparece em cinco peças do catálogo real. Antes daqui, peça sem preço saía com
 * um vazio embaixo do código — e o leitor não sabe se o preço foi esquecido ou
 * se é sob consulta. As duas leituras custam uma ligação.
 */
const SOB_CONSULTA = '*PREÇO SOB CONSULTA';

/**
 * O catálogo montado em PDF: capa, páginas de grade e contracapa.
 *
 * ==========================================================================
 * A MONTAGEM É NOSSA E DETERMINÍSTICA — NENHUM MODELO DESENHA ESTA PÁGINA.
 *
 * O botão da tela dizia "Gerar catálogo com IA", e a expressão é uma
 * armadilha. Um modelo de imagem montando a página reproduziria de uma vez os
 * três erros medidos em 31/08/2026: inventaria pedra numa peça, escreveria
 * `R$ 44.800,00` onde é `44.900,00`, e embaralharia os códigos. Foi por isso
 * que o texto ficou fora da IA desde o começo — em catálogo, dígito é
 * dinheiro.
 *
 * Aqui nós posicionamos a foto JÁ APROVADA e escrevemos o texto com o dado
 * exato do ERP. O mesmo catálogo montado duas vezes sai idêntico, byte a
 * byte de conteúdo — o que também significa que um erro visto na tela é
 * reproduzível, e não "uma geração ruim".
 *
 * A IA continua tendo lugar no catálogo, mas onde errar é barato: a arte da
 * capa, o tema visual. Nunca a peça, nunca o preço.
 * ==========================================================================
 *
 * `final_origem` grava `'IA'` porque é o valor que a migração 42 reservou
 * para "montado pelo sistema", em oposição a `'MARKETING'` (montado fora e
 * devolvido). O nome envelheceu mal; trocá-lo custa migração e CHECK novo, e
 * o significado das duas opções não mudou.
 */
@Injectable()
export class MontarCatalogoUseCase {
  private readonly logger = new Logger(MontarCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  async execute(catalogoId: string): Promise<CatalogoDetalhe> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    const fotos = catalogo.fotos.filter((f) => f.status === 'APROVADA');
    if (fotos.length === 0) {
      throw new BadRequestException(
        'Nenhuma foto aprovada neste catálogo. Aprove as fotos na conversa do WhatsApp antes de montar.',
      );
    }

    const pdf = await this.desenhar(catalogo, fotos);

    const nomeArquivo = `catalogo-${catalogo.numero}.pdf`;
    const arquivoId = await this.armazenamento.guardar(
      { conteudo: pdf, mime: 'application/pdf', nomeOriginal: nomeArquivo },
      pastaDoCatalogo(catalogo.numero, PASTA_FINAIS),
    );

    // ACRESCENTA UMA VERSÃO — não substitui. Montar deixou de apagar o que o
    // marketing tinha enviado: bastava um clique por curiosidade no botão
    // dourado para o trabalho do designer sumir do banco e do bucket, sem
    // volta. Ver a migração 44.
    await this.repositorio.registrarFinal(catalogoId, {
      origem: 'IA',
      arquivoId,
      nomeArquivo,
      mime: 'application/pdf',
      tamanhoBytes: pdf.length,
      // Nulo: quem montou foi o sistema, não uma pessoa.
      enviadoPor: null,
    });

    const atualizado = await this.repositorio.buscarPorId(catalogoId);
    if (!atualizado) throw new NotFoundException('Catálogo não encontrado');
    return atualizado;
  }

  /**
   * Monta o documento inteiro na memória.
   *
   * DIFERENTE DA EXPORTAÇÃO, que transmite o zip enquanto o escreve: aqui o
   * arquivo precisa existir inteiro para ser GRAVADO no armazenamento e
   * carimbado no banco. Um catálogo de trinta peças dá alguns MB — cabe.
   */
  private async desenhar(
    catalogo: CatalogoDetalhe,
    fotos: FotoItem[],
  ): Promise<Buffer> {
    const retrato = catalogo.formato === '9:16';
    const largura = retrato ? PAGINA.curto : PAGINA.longo;
    const altura = retrato ? PAGINA.longo : PAGINA.curto;

    const doc = new PDFDocument({
      size: [largura, altura],
      margin: MARGEM,
      autoFirstPage: false,
      info: {
        Title: `${catalogo.nome} — #${catalogo.numero}`,
        Author: 'A.T Jewel',
      },
    });

    const pedacos: Buffer[] = [];
    doc.on('data', (p: Buffer) => pedacos.push(p));
    const pronto = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(pedacos)));
    });

    this.capa(doc, catalogo, largura, altura, fotos.length);

    // AS IMAGENS SÃO LIDAS ANTES DE DESENHAR, e não durante: a grade precisa
    // saber quantas peças de fato entraram para paginar. Lendo dentro do laço
    // de desenho, uma foto que sumisse deixaria um buraco no meio da página em
    // vez de a grade simplesmente fechar.
    const pecas: { foto: FotoItem; imagem: Buffer }[] = [];
    for (const foto of fotos) {
      if (!foto.arquivoId) continue;
      const lida = await this.armazenamento.ler(foto.arquivoId);
      if (!lida) {
        this.logger.warn(`Foto ${foto.id} sem arquivo — fora do PDF.`);
        continue;
      }
      pecas.push({ foto, imagem: lida.conteudo });
    }

    for (let i = 0; i < pecas.length; i += POR_PAGINA) {
      this.grade(doc, pecas.slice(i, i + POR_PAGINA), retrato, largura, altura);
    }

    this.contracapa(doc, largura, altura);

    doc.end();
    return pronto;
  }

  /** Capa tipográfica: nome, tema e o número. Sem arte — ver o cabeçalho. */
  private capa(
    doc: PDFKit.PDFDocument,
    catalogo: CatalogoDetalhe,
    largura: number,
    altura: number,
    total: number,
  ): void {
    doc.addPage();
    const util = largura - MARGEM * 2;

    doc
      .fillColor('#1a1a1a')
      .font('Helvetica-Bold')
      .fontSize(38)
      .text(catalogo.nome.toUpperCase(), MARGEM, altura * 0.36, {
        width: util,
        align: 'center',
      });

    // Filete: o mesmo recurso da capa da tela, e a única marca gráfica aqui.
    const y = doc.y + 22;
    doc
      .moveTo(largura / 2 - 40, y)
      .lineTo(largura / 2 + 40, y)
      .lineWidth(1)
      .strokeColor('#b8912f')
      .stroke();

    if (catalogo.tema) {
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor('#6b6b6b')
        .text(catalogo.tema, MARGEM, y + 22, { width: util, align: 'center' });
    }

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#9a9a9a')
      .text(
        `#${catalogo.numero}  ·  ${total} ${total === 1 ? 'peça' : 'peças'}`,
        MARGEM,
        altura - MARGEM - 20,
        { width: util, align: 'center' },
      );
  }

  /**
   * Uma página de grade: até oito peças, packshot com o descritivo embaixo.
   *
   * QUATRO COLUNAS EM PAISAGEM, DUAS EM RETRATO. A densidade é a mesma; o que
   * muda é a forma da folha. Em retrato, quatro colunas dariam células de 150pt
   * e o descritivo quebraria em cinco linhas.
   */
  private grade(
    doc: PDFKit.PDFDocument,
    pecas: { foto: FotoItem; imagem: Buffer }[],
    retrato: boolean,
    largura: number,
    altura: number,
  ): void {
    doc.addPage();

    const colunas = retrato ? 2 : 4;
    const linhas = POR_PAGINA / colunas;
    const util = largura - MARGEM * 2;
    const utilAltura = altura - MARGEM * 2;

    const larguraCelula = (util - GAP * (colunas - 1)) / colunas;
    const alturaCelula = (utilAltura - GAP * (linhas - 1)) / linhas;

    for (const [i, { foto, imagem }] of pecas.entries()) {
      const coluna = i % colunas;
      const linha = Math.floor(i / colunas);
      const x = MARGEM + coluna * (larguraCelula + GAP);
      const y = MARGEM + linha * (alturaCelula + GAP);

      const alturaFoto = alturaCelula * FATIA_DA_FOTO;

      // `fit` preserva a proporção e centraliza: a foto NUNCA é distorcida para
      // preencher. Packshot esticado passa no desenvolvimento e salta aos olhos
      // no impresso.
      doc.image(imagem, x, y, {
        fit: [larguraCelula, alturaFoto],
        align: 'center',
        valign: 'center',
      });

      this.descritivo(doc, foto, x, y + alturaFoto + 10, larguraCelula);
    }
  }

  /**
   * O bloco de texto de uma peça, no padrão impresso.
   *
   *     BR26243 • BRINCO DIAMANTE, TURQUESA,
   *     MALAQUITA E OURO AMARELO 18K
   *
   *     R$71.120,00 a vista
   *     10 X R$8.890,00
   *
   * Código e descrição numa linha separados por `•`, descrição em caixa alta e
   * na cor do descritivo; valores em negrito e pretos. É o mesmo bloco que o
   * `Descritivo` do front desenha em HTML — levantado nas páginas do "New In".
   */
  private descritivo(
    doc: PDFKit.PDFDocument,
    foto: FotoItem,
    x: number,
    y: number,
    largura: number,
  ): void {
    const texto = foto.descricao
      ? `${foto.codigoErp ?? '—'} • ${foto.descricao.toUpperCase()}`
      : (foto.codigoErp ?? '');

    doc
      .fillColor(COR_DESCRITIVO)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(texto, x, y, { width: largura, align: 'center', lineGap: 1 });

    doc.fillColor(COR_VALOR).fontSize(8.5);

    // SEM PREÇO TEM FRASE, e não vazio. Ver `SOB_CONSULTA`.
    if (foto.precoAVista === null || foto.parcelas === null) {
      doc.text(SOB_CONSULTA, x, doc.y + 6, { width: largura, align: 'center' });
      return;
    }

    doc.text(`${this.emReais(foto.precoAVista)} a vista`, x, doc.y + 6, {
      width: largura,
      align: 'center',
    });

    doc.fontSize(8).text(
      `${foto.parcelas} X ${this.emReais(
        valorDaParcela(foto.precoAVista, foto.parcelas, foto.jurosPercentual),
      )}`,
      x,
      doc.y + 2,
      { width: largura, align: 'center' },
    );
  }

  /**
   * A última página: só a marca, centralizada em branco.
   *
   * É o que o catálogo real faz — a contracapa não vende, fecha. Sem ela o PDF
   * termina na última grade, que pode estar pela metade, e parece cortado.
   */
  private contracapa(
    doc: PDFKit.PDFDocument,
    largura: number,
    altura: number,
  ): void {
    doc.addPage();
    doc
      .fillColor('#1a1a1a')
      .font('Helvetica')
      .fontSize(30)
      .text('A.T JEWEL', MARGEM, altura * 0.46, {
        width: largura - MARGEM * 2,
        align: 'center',
        characterSpacing: 3,
      });
  }

  /** `R$44.900,00` — colado, como no catálogo impresso. */
  private emReais(valor: number): string {
    const numero = valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$${numero}`;
  }
}
