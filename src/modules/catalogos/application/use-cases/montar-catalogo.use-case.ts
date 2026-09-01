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
const MARGEM = 64;

/**
 * Fração da altura útil que a foto ocupa. O resto é do texto.
 *
 * 0,62 saiu das páginas de referência: a peça domina, mas o bloco de texto
 * não fica espremido no rodapé. Constante e não cálculo automático porque o
 * equilíbrio é editorial — quem ajustar isto está mexendo no visual da casa.
 */
const FATIA_DA_FOTO = 0.62;

/**
 * O parcelado a partir do a vista.
 *
 * TERCEIRO LUGAR onde esta regra vive: aqui, no `ExportarCatalogoUseCase` e no
 * `esboco.tsx` do front. Não há pacote compartilhado entre os repositórios, e
 * dentro do back os dois use cases produzem artefatos diferentes do mesmo
 * dado. Mudou um, mude os três.
 *
 * Verificada em 25 de 25 peças no levantamento de 20/08/2026.
 */
function parcelaDe(precoAVista: number, parcelas: number): number {
  const fator = parcelas === 6 ? 0.9 : 0.8;
  return precoAVista / fator / parcelas;
}

/**
 * O catálogo montado em PDF, uma peça por página.
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

    for (const foto of fotos) {
      // Foto que sumiu do armazenamento não vira página em branco: melhor um
      // catálogo com 29 peças do que uma página muda no meio dele.
      if (!foto.arquivoId) continue;
      const lida = await this.armazenamento.ler(foto.arquivoId);
      if (!lida) {
        this.logger.warn(`Foto ${foto.id} sem arquivo — fora do PDF.`);
        continue;
      }
      this.pagina(doc, foto, lida.conteudo, largura, altura);
    }

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
   * Uma peça por página: a foto em cima, o descritivo embaixo.
   *
   * O TEXTO É O MESMO DA TELA, e isso não é coincidência: código e descrição
   * numa linha separados por `•`, descrição em caixa alta, valores em negrito,
   * `R$` colado no número e "a vista" sem acento. Levantado nas páginas de
   * referência em 31/08 — ver `Descritivo` no front, que desenha este mesmo
   * bloco em HTML.
   */
  private pagina(
    doc: PDFKit.PDFDocument,
    foto: FotoItem,
    imagem: Buffer,
    largura: number,
    altura: number,
  ): void {
    doc.addPage();
    const util = largura - MARGEM * 2;
    const alturaUtil = altura - MARGEM * 2;
    const alturaDaFoto = alturaUtil * FATIA_DA_FOTO;

    // `fit` preserva a proporção e centraliza dentro da caixa: a foto NUNCA é
    // distorcida para preencher. Packshot esticado é o tipo de erro que passa
    // no desenvolvimento e salta aos olhos no impresso.
    doc.image(imagem, MARGEM, MARGEM, {
      fit: [util, alturaDaFoto],
      align: 'center',
      valign: 'center',
    });

    const topoDoTexto = MARGEM + alturaDaFoto + 34;
    const descritivo = foto.descricao
      ? `${foto.codigoErp ?? '—'} • ${foto.descricao.toUpperCase()}`
      : (foto.codigoErp ?? '');

    doc
      .fillColor('#1a1a1a')
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(descritivo, MARGEM, topoDoTexto, {
        width: util,
        align: 'center',
        lineGap: 2,
      });

    if (foto.precoAVista === null || foto.parcelas === null) return;

    doc
      .fontSize(16)
      .text(`${this.emReais(foto.precoAVista)} a vista`, MARGEM, doc.y + 16, {
        width: util,
        align: 'center',
      });

    doc
      .fontSize(13)
      .fillColor('#4a4a4a')
      .text(
        `${foto.parcelas} X ${this.emReais(parcelaDe(foto.precoAVista, foto.parcelas))}`,
        MARGEM,
        doc.y + 6,
        { width: util, align: 'center' },
      );
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
