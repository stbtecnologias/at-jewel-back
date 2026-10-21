import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AVISO_INTERNO, MARCA, type Relatorio } from '../domain/relatorio';

/**
 * O MESMO RELATÓRIO, EM PLANILHA — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * POR QUE OS DOIS FORMATOS, E NÃO SÓ O PDF.
 *
 * A escolha é de USO, e não de esforço — os dois leem o mesmo contrato, então
 * o segundo custou o tempo de escrevê-lo e nada depois.
 *
 *   PDF       para VER, imprimir e repassar. Bonito, fixo, e no celular se lê.
 *   PLANILHA  para TRABALHAR: ordenar, filtrar, somar, cruzar com outra coisa.
 *
 * Achar uma peça entre 865 linhas num PDF do celular é ruim; numa planilha é
 * um filtro. E o contrário também vale: ninguém manda planilha para a cliente.
 * ==========================================================================
 *
 * O NÚMERO VAI COMO NÚMERO, e não como o texto já formatado — é a única
 * diferença de verdade entre os dois renderizadores, e é ela que faz a
 * planilha somar. Ver `numeroDe`.
 */
@Injectable()
export class RelatorioXlsxService {
  readonly mime =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async gerar(r: Relatorio): Promise<Buffer> {
    const livro = new ExcelJS.Workbook();
    livro.creator = MARCA;
    livro.created = new Date();

    const aba = livro.addWorksheet(r.titulo.slice(0, 28), {
      views: [{ state: 'frozen', ySplit: 0 }],
    });

    const colunas = r.colunas;
    const ultima = colunas.length;

    // ====================================================================
    // O CABEÇALHO VEM ANTES DA TABELA, e por isso a tabela não começa na
    // linha 1 — o que obriga o congelamento a ser calculado, e não fixo.
    // ====================================================================
    let linha = 1;
    const titulo = aba.getCell(linha, 1);
    titulo.value = r.titulo;
    titulo.font = { bold: true, size: 16, color: { argb: 'FF1D1A17' } };
    aba.mergeCells(linha, 1, linha, ultima);
    linha += 1;

    if (r.subtitulo) {
      const c = aba.getCell(linha, 1);
      c.value = r.subtitulo;
      c.font = { size: 10, color: { argb: 'FF6B625A' } };
      aba.mergeCells(linha, 1, linha, ultima);
      linha += 1;
    }
    if (r.posicao) {
      const c = aba.getCell(linha, 1);
      c.value = r.posicao;
      c.font = { size: 9, color: { argb: 'FF6B625A' } };
      aba.mergeCells(linha, 1, linha, ultima);
      linha += 1;
    }
    if (r.filtros?.length) {
      const c = aba.getCell(linha, 1);
      c.value = r.filtros.map((f) => `${f.rotulo}: ${f.valor}`).join('   ·   ');
      c.font = { size: 9, color: { argb: 'FF8A6A3B' } };
      aba.mergeCells(linha, 1, linha, ultima);
      linha += 1;
    }
    linha += 1;

    const linhaDoCabecalho = linha;
    colunas.forEach((col, i) => {
      const c = aba.getCell(linha, i + 1);
      c.value = col.titulo;
      c.font = { bold: true, size: 9, color: { argb: 'FFD8CDBD' } };
      c.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1D1A17' },
      };
      c.alignment = { horizontal: this.align(col.alinhamento) };
    });
    linha += 1;

    for (const dados of r.linhas) {
      colunas.forEach((col, i) => {
        const c = aba.getCell(linha, i + 1);
        const bruto = dados[col.chave] ?? '';
        const n = numeroDe(bruto);
        if (n === null) {
          c.value = bruto;
        } else {
          c.value = n;
          // O FORMATO MORA NA CÉLULA, e o valor fica número. Guardando
          // "R$ 98.900,00" como texto, a coluna não soma e não ordena — que
          // é a única razão de existir uma planilha.
          c.numFmt = bruto.includes('R$')
            ? '"R$" #,##0.00'
            : bruto.includes('%')
              ? '0.0"%"'
              : '#,##0';
        }
        c.alignment = { horizontal: this.align(col.alinhamento) };
        c.font = { size: 10 };
      });
      linha += 1;
    }

    if (r.total) {
      colunas.forEach((col, i) => {
        const c = aba.getCell(linha, i + 1);
        const bruto = r.total?.[col.chave] ?? '';
        const n = numeroDe(bruto);
        c.value = n === null ? bruto : n;
        if (n !== null) {
          c.numFmt = bruto.includes('R$') ? '"R$" #,##0.00' : '#,##0';
        }
        c.font = { bold: true, size: 10 };
        c.alignment = { horizontal: this.align(col.alinhamento) };
      });
      linha += 1;
    }

    linha += 1;
    if (r.nota) {
      const c = aba.getCell(linha, 1);
      c.value = r.nota;
      c.font = { size: 8, color: { argb: 'FF9A9089' } };
      aba.mergeCells(linha, 1, linha, ultima);
      linha += 1;
    }
    const aviso = aba.getCell(linha, 1);
    aviso.value = `${AVISO_INTERNO}${r.geradoPor ? ` · Gerado por ${r.geradoPor}` : ''}`;
    aviso.font = { size: 8, color: { argb: 'FF9A9089' } };
    aba.mergeCells(linha, 1, linha, ultima);

    // O FILTRO E O CONGELAMENTO são o que torna a planilha útil no celular e
    // no desktop: a pessoa abre e já ordena por valor sem saber de Excel.
    aba.autoFilter = {
      from: { row: linhaDoCabecalho, column: 1 },
      to: { row: linhaDoCabecalho + r.linhas.length, column: ultima },
    };
    aba.views = [{ state: 'frozen', ySplit: linhaDoCabecalho }];

    colunas.forEach((col, i) => {
      const maior = Math.max(
        col.titulo.length,
        ...r.linhas.map((l) => (l[col.chave] ?? '').length),
      );
      aba.getColumn(i + 1).width = Math.min(46, Math.max(10, maior + 2));
    });

    const buffer = await livro.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private align(a?: string): 'left' | 'right' | 'center' {
    return a === 'direita' ? 'right' : a === 'centro' ? 'center' : 'left';
  }
}

/**
 * O NÚMERO DE DENTRO DO TEXTO JÁ FORMATADO, ou `null` se não for número.
 *
 * ==========================================================================
 * POR QUE O CONTRATO GUARDA TEXTO, E A PLANILHA DESFAZ.
 *
 * O contrato guarda "R$ 98.900,00" porque é o que o PDF imprime e é onde a
 * formatação brasileira já foi decidida uma vez só. A planilha precisa do
 * número, então ela desfaz — e desfazer é mais seguro que pedir aos dois
 * formatos que cada um formate do seu jeito, que é como duas telas passam a
 * mostrar o mesmo valor diferente.
 *
 * `1.234,56` é brasileiro: o ponto é milhar e a vírgula é decimal. Trocar a
 * ordem destes dois `replace` transforma mil e duzentos em um vírgula dois.
 * ==========================================================================
 */
export function numeroDe(texto: string): number | null {
  const limpo = texto
    .replace(/R\$|%|\s/g, '')
    .replace(/ /g, '')
    .trim();
  if (!/^-?[\d.,]+$/.test(limpo) || limpo === '') return null;
  const n = Number(limpo.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
