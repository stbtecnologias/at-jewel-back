import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  AVISO_INTERNO,
  MARCA,
  SUBMARCA,
  type ColunaDoRelatorio,
  type Relatorio,
} from '../domain/relatorio';

/** A4 em pontos, retrato. */
const PAGINA = { largura: 595.28, altura: 841.89 };
const MARGEM = 48;
const LARGURA_UTIL = PAGINA.largura - MARGEM * 2;

/**
 * As cores do relatório, e são as da marca — o dourado do papel timbrado, o
 * quase-preto do cabeçalho da tabela e o creme da linha alternada.
 */
const COR = {
  tinta: '#1d1a17',
  suave: '#6b625a',
  claro: '#9a9089',
  ouro: '#8a6a3b',
  linha: '#e6e0d8',
  faixa: '#faf7f2',
  cabecalho: '#1d1a17',
};

const ALTURA_LINHA = 22;
const ALTURA_CABECALHO_TABELA = 26;

/**
 * O RELATÓRIO EM PDF — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * ELE NÃO SABE O QUE É UM PRODUTO NEM UMA VENDA, E É ASSIM QUE TEM DE SER.
 *
 * Recebe o contrato de `domain/relatorio.ts` e desenha. Conteúdo novo não
 * encosta aqui; formato novo não encosta no conteúdo. É o que sustenta o
 * pedido do Lucas — *"o mesmo padrão do relatório, apenas os dados
 * diferentes"* — sem depender de ninguém lembrar de copiar o cabeçalho.
 * ==========================================================================
 *
 * O desenho é o do mockup de 21/10: faixa da marca, título, chips de filtro,
 * cartões de resumo, tabela com cabeçalho escuro e linha zebrada, total, nota
 * e o rodapé com o aviso de documento interno.
 */
@Injectable()
export class RelatorioPdfService {
  readonly mime = 'application/pdf';

  async gerar(r: Relatorio): Promise<Buffer> {
    const doc = new PDFDocument({
      size: [PAGINA.largura, PAGINA.altura],
      margin: MARGEM,
      autoFirstPage: false,
      info: { Title: r.titulo, Author: MARCA },
    });

    const pedacos: Buffer[] = [];
    doc.on('data', (p: Buffer) => pedacos.push(p));
    const pronto = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(pedacos))),
    );

    const larguras = this.larguras(r.colunas);

    doc.addPage();
    this.cabecalho(doc, r);
    let y = this.abertura(doc, r);

    // A TABELA, QUEBRANDO EM PÁGINAS SOZINHA.
    //
    // O cabeçalho da tabela se repete em toda página: uma tabela de 865 linhas
    // tem oito folhas, e da segunda em diante ninguém lembra o que é a quarta
    // coluna.
    y = this.cabecalhoDaTabela(doc, r.colunas, larguras, y);
    for (const [i, linha] of r.linhas.entries()) {
      if (y + ALTURA_LINHA > PAGINA.altura - MARGEM - 46) {
        this.rodape(doc, r);
        doc.addPage();
        this.cabecalho(doc, r);
        y = this.cabecalhoDaTabela(doc, r.colunas, larguras, MARGEM + 54);
      }
      y = this.linha(doc, r.colunas, larguras, linha, y, i % 2 === 1);
    }

    if (r.total) y = this.linhaDeTotal(doc, r.colunas, larguras, r.total, y);
    if (r.nota) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(COR.claro)
        .text(r.nota, MARGEM, y + 12, { width: LARGURA_UTIL });
    }

    this.rodape(doc, r);
    doc.end();
    return pronto;
  }

  /**
   * As larguras saem dos PESOS, e não de números fixos.
   *
   * Com largura fixa, acrescentar uma coluna obriga a recalcular todas as
   * outras — e quem esquece uma vê a tabela vazar a margem sem aviso.
   */
  private larguras(colunas: ColunaDoRelatorio[]): number[] {
    const pesos = colunas.map((c) => c.peso ?? 1);
    const soma = pesos.reduce((a, b) => a + b, 0);
    return pesos.map((p) => (p / soma) * LARGURA_UTIL);
  }

  /** A faixa da marca, em toda página. */
  private cabecalho(doc: PDFKit.PDFDocument, r: Relatorio): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COR.tinta)
      .text(MARCA, MARGEM, MARGEM - 14);
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COR.ouro)
      .text(SUBMARCA, MARGEM, MARGEM, { characterSpacing: 1.2 });

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(COR.tinta)
      .text(r.titulo, MARGEM, MARGEM - 14, {
        width: LARGURA_UTIL,
        align: 'right',
      });
    if (r.posicao) {
      doc
        .font('Courier')
        .fontSize(7.5)
        .fillColor(COR.suave)
        .text(r.posicao, MARGEM, MARGEM, {
          width: LARGURA_UTIL,
          align: 'right',
        });
    }

    doc
      .moveTo(MARGEM, MARGEM + 16)
      .lineTo(PAGINA.largura - MARGEM, MARGEM + 16)
      .lineWidth(0.8)
      .strokeColor(COR.ouro)
      .stroke();
  }

  /** Título, subtítulo, chips e cartões. Devolve o `y` onde a tabela começa. */
  private abertura(doc: PDFKit.PDFDocument, r: Relatorio): number {
    let y = MARGEM + 46;

    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(COR.tinta)
      .text(r.titulo, MARGEM, y);
    y = doc.y + 4;

    if (r.subtitulo) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COR.suave)
        .text(r.subtitulo, MARGEM, y, { width: LARGURA_UTIL });
      y = doc.y + 10;
    }

    if (r.filtros?.length) {
      let x = MARGEM;
      for (const f of r.filtros) {
        const texto = `${f.rotulo.toUpperCase()}  ${f.valor}`;
        const largura =
          doc.font('Helvetica').fontSize(7.5).widthOfString(texto) + 18;
        doc
          .roundedRect(x, y, largura, 18, 9)
          .lineWidth(0.6)
          .strokeColor(COR.linha)
          .stroke();
        doc.fillColor(COR.suave).text(texto, x + 9, y + 5.5);
        x += largura + 6;
      }
      y += 28;
    }

    if (r.cartoes?.length) {
      // NO MÁXIMO QUATRO, e o corte é aqui em vez de no contrato: quem monta o
      // relatório não precisa saber de largura de página.
      const cartoes = r.cartoes.slice(0, 4);
      const largura = LARGURA_UTIL / cartoes.length;
      const altura = 54;
      doc
        .roundedRect(MARGEM, y, LARGURA_UTIL, altura, 6)
        .lineWidth(0.6)
        .strokeColor(COR.linha)
        .stroke();
      cartoes.forEach((c, i) => {
        const x = MARGEM + largura * i;
        if (i > 0) {
          doc
            .moveTo(x, y + 8)
            .lineTo(x, y + altura - 8)
            .strokeColor(COR.linha)
            .stroke();
        }
        doc
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .fillColor(COR.claro)
          .text(c.rotulo.toUpperCase(), x + 12, y + 10, {
            width: largura - 24,
            characterSpacing: 0.8,
          });
        doc
          .font('Courier-Bold')
          .fontSize(12)
          .fillColor(COR.tinta)
          .text(c.valor, x + 12, y + 22, { width: largura - 24 });
        if (c.nota) {
          doc
            .font('Helvetica')
            .fontSize(7)
            .fillColor(COR.claro)
            .text(c.nota, x + 12, y + 38, { width: largura - 24 });
        }
      });
      y += altura + 18;
    }

    if (r.exibindo) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(COR.claro)
        .text(
          `Exibindo ${r.exibindo.mostradas} de ${r.exibindo.total}`,
          MARGEM,
          y - 2,
          { width: LARGURA_UTIL, align: 'right' },
        );
    }

    return y;
  }

  private cabecalhoDaTabela(
    doc: PDFKit.PDFDocument,
    colunas: ColunaDoRelatorio[],
    larguras: number[],
    y: number,
  ): number {
    doc
      .rect(MARGEM, y, LARGURA_UTIL, ALTURA_CABECALHO_TABELA)
      .fill(COR.cabecalho);
    let x = MARGEM;
    colunas.forEach((c, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor('#d8cdbd')
        .text(c.titulo.toUpperCase(), x + 8, y + 9.5, {
          width: larguras[i] - 16,
          align: this.align(c),
          characterSpacing: 0.8,
          lineBreak: false,
        });
      x += larguras[i];
    });
    return y + ALTURA_CABECALHO_TABELA;
  }

  private linha(
    doc: PDFKit.PDFDocument,
    colunas: ColunaDoRelatorio[],
    larguras: number[],
    linha: Record<string, string>,
    y: number,
    zebrada: boolean,
  ): number {
    if (zebrada) {
      doc.rect(MARGEM, y, LARGURA_UTIL, ALTURA_LINHA).fill(COR.faixa);
    }
    let x = MARGEM;
    colunas.forEach((c, i) => {
      doc
        .font(c.mono ? 'Courier' : 'Helvetica')
        .fontSize(8)
        .fillColor(c.mono ? COR.suave : COR.tinta)
        .text(linha[c.chave] ?? '', x + 8, y + 7, {
          width: larguras[i] - 16,
          align: this.align(c),
          // UMA LINHA POR LINHA: descrição comprida é CORTADA, e não quebrada.
          // Quebrando, uma peça com nome longo empurra a tabela inteira e as
          // colunas deixam de se ler na vertical — que é como se lê tabela.
          lineBreak: false,
          ellipsis: true,
        });
      x += larguras[i];
    });
    doc
      .moveTo(MARGEM, y + ALTURA_LINHA)
      .lineTo(PAGINA.largura - MARGEM, y + ALTURA_LINHA)
      .lineWidth(0.4)
      .strokeColor(COR.linha)
      .stroke();
    return y + ALTURA_LINHA;
  }

  private linhaDeTotal(
    doc: PDFKit.PDFDocument,
    colunas: ColunaDoRelatorio[],
    larguras: number[],
    total: Record<string, string>,
    y: number,
  ): number {
    let x = MARGEM;
    colunas.forEach((c, i) => {
      doc
        .font('Courier-Bold')
        .fontSize(8.5)
        .fillColor(COR.tinta)
        .text(total[c.chave] ?? '', x + 8, y + 9, {
          width: larguras[i] - 16,
          align: this.align(c),
          lineBreak: false,
        });
      x += larguras[i];
    });
    return y + ALTURA_LINHA + 6;
  }

  /** O rodapé, com o aviso — em TODA página. Ver o porquê no contrato. */
  private rodape(doc: PDFKit.PDFDocument, r: Relatorio): void {
    const y = PAGINA.altura - MARGEM - 6;
    doc
      .moveTo(MARGEM, y - 10)
      .lineTo(PAGINA.largura - MARGEM, y - 10)
      .lineWidth(0.4)
      .strokeColor(COR.linha)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COR.claro)
      .text(AVISO_INTERNO, MARGEM, y, { width: LARGURA_UTIL * 0.6 });

    const quando = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc
      .font('Courier')
      .fontSize(6.5)
      .fillColor(COR.claro)
      .text(
        `Gerado em ${quando}${r.geradoPor ? ` por ${r.geradoPor}` : ''}`,
        MARGEM,
        y,
        { width: LARGURA_UTIL, align: 'right' },
      );
  }

  private align(c: ColunaDoRelatorio): 'left' | 'right' | 'center' {
    return c.alinhamento === 'direita'
      ? 'right'
      : c.alinhamento === 'centro'
        ? 'center'
        : 'left';
  }
}
