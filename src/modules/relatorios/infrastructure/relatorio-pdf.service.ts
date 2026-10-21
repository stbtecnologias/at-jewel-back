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
const A4 = { curto: 595.28, longo: 841.89 };
const MARGEM = 48;

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
 * O desenho é o do mockup de 21/10, já enxuto: faixa da marca, título,
 * tabela com cabeçalho escuro e linha zebrada, total, nota
 * e o rodapé com o aviso de documento interno.
 */
@Injectable()
export class RelatorioPdfService {
  readonly mime = 'application/pdf';

  /**
   * AS MEDIDAS DA PÁGINA ATUAL, e elas mudam com a orientação.
   *
   * Guardadas na instância em vez de passadas em dez assinaturas: o serviço
   * desenha UM relatório por chamada, e espalhar `largura` por cada método
   * privado só serviria para alguém esquecer de passar numa delas.
   */
  private largura = A4.curto;
  private altura = A4.longo;
  private get util(): number {
    return this.largura - MARGEM * 2;
  }

  async gerar(r: Relatorio): Promise<Buffer> {
    // ====================================================================
    // PAISAGEM QUANDO A TABELA É LARGA — 21/10/2026.
    //
    // A listagem de vendas tem sete colunas, e em retrato cada uma ficava com
    // 70pt: "PAGAMENTO" virava "PAGAMEN TO" e "Concluída" virava "Conclu
    // ída", por cima da linha de baixo. O Lucas viu no primeiro PDF.
    //
    // Deitar a folha dá 50% mais largura e resolve sem encolher fonte nem
    // esconder coluna — que seriam as outras duas saídas, e as duas piores.
    // ====================================================================
    this.largura = r.paisagem ? A4.longo : A4.curto;
    this.altura = r.paisagem ? A4.curto : A4.longo;

    const doc = new PDFDocument({
      size: [this.largura, this.altura],
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
      if (y + ALTURA_LINHA > this.altura - MARGEM - 46) {
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
        .text(r.nota, MARGEM, y + 12, { width: this.util });
    }

    this.rodape(doc, r);
    doc.end();
    return pronto;
  }

  /**
   * CORTA O TEXTO ATÉ CABER, E DIZ QUE CORTOU COM "…".
   *
   * ========================================================================
   * EU CONFIEI NO `lineBreak: false` DO PDFKIT, E ELE QUEBROU ASSIM MESMO.
   *
   * O primeiro PDF de vendas saiu com "PAGAMEN TO" no cabeçalho e "Conclu
   * ída" na célula, cada um ocupando duas linhas por cima da linha de baixo.
   * O Lucas viu antes de mim.
   *
   * A saída não é insistir na opção: é NÃO DAR AO PDFKIT a chance de quebrar.
   * Medindo e cortando aqui, o que chega lá já cabe — e a altura da linha
   * volta a ser uma garantia em vez de uma esperança.
   * ========================================================================
   *
   * Mede com a fonte e o corpo que já estão selecionados no documento, então
   * quem chama configura a fonte ANTES.
   */
  private cortar(
    doc: PDFKit.PDFDocument,
    texto: string,
    largura: number,
  ): string {
    if (doc.widthOfString(texto) <= largura) return texto;
    let fim = texto.length;
    while (fim > 1 && doc.widthOfString(`${texto.slice(0, fim)}…`) > largura) {
      fim -= 1;
    }
    return `${texto.slice(0, fim).trimEnd()}…`;
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
    return pesos.map((p) => (p / soma) * this.util);
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
        width: this.util,
        align: 'right',
      });
    if (r.posicao) {
      doc
        .font('Courier')
        .fontSize(7.5)
        .fillColor(COR.suave)
        .text(r.posicao, MARGEM, MARGEM, {
          width: this.util,
          align: 'right',
        });
    }

    doc
      .moveTo(MARGEM, MARGEM + 16)
      .lineTo(this.largura - MARGEM, MARGEM + 16)
      .lineWidth(0.8)
      .strokeColor(COR.ouro)
      .stroke();
  }

  /** Só o título. Devolve o `y` onde a tabela começa. */
  private abertura(doc: PDFKit.PDFDocument, r: Relatorio): number {
    let y = MARGEM + 46;

    doc
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(COR.tinta)
      .text(r.titulo, MARGEM, y);
    y = doc.y + 4;

    if (r.exibindo) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(COR.claro)
        .text(
          `Exibindo ${r.exibindo.mostradas} de ${r.exibindo.total}`,
          MARGEM,
          y - 2,
          { width: this.util, align: 'right' },
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
    doc.rect(MARGEM, y, this.util, ALTURA_CABECALHO_TABELA).fill(COR.cabecalho);
    let x = MARGEM;
    colunas.forEach((c, i) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor('#d8cdbd')
        .text(
          this.cortar(doc, c.titulo.toUpperCase(), larguras[i] - 16),
          x + 8,
          y + 9.5,
          {
            width: larguras[i] - 16,
            align: this.align(c),
            characterSpacing: 0.8,
            lineBreak: false,
          },
        );
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
      doc.rect(MARGEM, y, this.util, ALTURA_LINHA).fill(COR.faixa);
    }
    let x = MARGEM;
    colunas.forEach((c, i) => {
      const util = larguras[i] - 16;
      const bruto = linha[c.chave] ?? '';
      doc.font(c.mono ? 'Courier' : 'Helvetica').fontSize(8);

      // ==================================================================
      // NÚMERO NÃO LEVA "…" — pedido do Lucas em 21/10: *"em valor não
      // colocar ..., porque dá a sensação que tá faltando"*.
      //
      // E não é só sensação: "R$ 194.14…" é um número ERRADO, e não um
      // número encurtado. Texto cortado a pessoa completa pelo contexto;
      // número cortado ela lê e acredita.
      //
      // Então a coluna de número ENCOLHE a fonte até caber, como o valor do
      // cartão fazia antes de sair. Corpo menor continua dizendo a verdade.
      // ==================================================================
      let corpo = 8;
      let texto = bruto;
      if (c.alinhamento === 'direita') {
        while (corpo > 5.5 && doc.fontSize(corpo).widthOfString(texto) > util) {
          corpo -= 0.25;
        }
        doc.fontSize(corpo);
      } else {
        texto = this.cortar(doc, bruto, util);
      }

      doc
        .fillColor(c.mono ? COR.suave : COR.tinta)
        // O `y` acompanha o corpo para o número ficar na mesma base do resto
        // da linha; sem isso a coluna encolhida sobe e a linha desalinha.
        .text(texto, x + 8, y + 7 + (8 - corpo) * 0.5, {
          width: util,
          align: this.align(c),
          // UMA LINHA POR LINHA: descrição comprida é CORTADA, e não quebrada.
          // Quebrando, uma peça com nome longo empurra a tabela inteira e as
          // colunas deixam de se ler na vertical — que é como se lê tabela.
          lineBreak: false,
        });
      x += larguras[i];
    });
    doc
      .moveTo(MARGEM, y + ALTURA_LINHA)
      .lineTo(this.largura - MARGEM, y + ALTURA_LINHA)
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
      const util = larguras[i] - 16;
      const texto = total[c.chave] ?? '';
      // A LINHA DE TOTAL É SÓ NÚMERO, e vale a mesma regra da célula:
      // encolhe, nunca corta. Um total com "…" seria o pior dos dois mundos —
      // o número que resume a página, errado.
      doc.font('Courier-Bold').fillColor(COR.tinta);
      let corpo = 8.5;
      while (corpo > 5.5 && doc.fontSize(corpo).widthOfString(texto) > util) {
        corpo -= 0.25;
      }
      doc.fontSize(corpo).text(texto, x + 8, y + 9 + (8.5 - corpo) * 0.5, {
        width: util,
        align: this.align(c),
        lineBreak: false,
      });
      x += larguras[i];
    });
    return y + ALTURA_LINHA + 6;
  }

  /** O rodapé, com o aviso — em TODA página. Ver o porquê no contrato. */
  private rodape(doc: PDFKit.PDFDocument, r: Relatorio): void {
    const y = this.altura - MARGEM - 6;
    doc
      .moveTo(MARGEM, y - 10)
      .lineTo(this.largura - MARGEM, y - 10)
      .lineWidth(0.4)
      .strokeColor(COR.linha)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COR.claro)
      .text(AVISO_INTERNO, MARGEM, y, { width: this.util * 0.6 });

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
        { width: this.util, align: 'right' },
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
