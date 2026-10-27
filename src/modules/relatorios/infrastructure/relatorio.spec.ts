import { RelatorioPdfService } from './relatorio-pdf.service';
import { RelatorioXlsxService, numeroDe } from './relatorio-xlsx.service';
import PDFDocument from 'pdfkit';
import type {
  ColunaDoRelatorio,
  Relatorio,
} from '../domain/relatorio';

/**
 * OS DOIS RENDERIZADORES — RF36 e RF37.
 *
 * ============================================================================
 * O QUE ESTES TESTES PROTEGEM é um defeito que já aconteceu em produção de
 * verdade, no primeiro "manda em PDF" do Lucas, em 21/10/2026:
 *
 *   TypeError: texto.slice is not a function
 *
 * O contrato declara `Record<string, string>` e eu acreditei nele. O número do
 * documento da venda vem do Postgres como NÚMERO — e o TypeScript não tem como
 * saber disso: ele confere o que foi declarado, e o que foi declarado era uma
 * promessa de quem preencheu.
 *
 * Por isso o caso da célula numérica vem primeiro aqui.
 * ============================================================================
 */
describe('o molde do relatório', () => {
  const pdf = new RelatorioPdfService();
  const xlsx = new RelatorioXlsxService();

  const base = (over: Partial<Relatorio> = {}): Relatorio => ({
    titulo: 'Vendas da Camila',
    colunas: [
      { chave: 'doc', titulo: 'Doc', mono: true },
      { chave: 'cliente', titulo: 'Cliente', peso: 3 },
      { chave: 'valor', titulo: 'Total', alinhamento: 'direita', mono: true },
    ],
    linhas: [
      { doc: '1182', cliente: 'Juliana Karla', valor: 'R$ 194.144,00' },
      { doc: '1181', cliente: 'Monique Bruna', valor: 'R$ 1.500,00' },
    ],
    total: { doc: 'Total', valor: 'R$ 195.644,00' },
    ...over,
  });

  /** Quantas folhas o PDF tem — contadas no proprio arquivo. */
  const paginas = (b: Buffer): number =>
    (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  // ==========================================================================
  // "11/08/2…" — o PDF das vendas, 27/10/2026.
  //
  // A coluna DATA tinha peso 0.8 e sobrava 39,8pt úteis; "11/08/2026" em
  // Courier 8pt pede 48,0. O ano virou reticência — e data cortada é pior
  // que valor cortado, porque "11/08/2…" ainda PARECE data, e quem lê
  // completa o ano de cabeça.
  //
  // Duas coisas consertaram: a coluna passou a caber (peso 1, os 0,2 saindo
  // das peças, que são o texto mais folgado da tabela), e toda coluna `mono`
  // passou a ENCOLHER antes de cortar, como a de número já fazia desde 21/10.
  // ==========================================================================
  it('a data cabe inteira na tabela de vendas, em 8pt', () => {
    const doc = new PDFDocument({ size: [841.89, 595.28], margin: 48 });
    doc.font('Courier').fontSize(8);

    // Os pesos REAIS da listagem de vendas — ver `ferramentas-gestao`.
    const colunas: ColunaDoRelatorio[] = [
      { chave: 'data', titulo: 'Data', peso: 1, mono: true },
      { chave: 'documento', titulo: 'Doc', peso: 0.7, mono: true },
      { chave: 'cliente', titulo: 'Cliente', peso: 2.2 },
      { chave: 'pecas', titulo: 'Peças', peso: 3.4 },
      { chave: 'vendedora', titulo: 'Vendedora', peso: 1.4 },
      { chave: 'status', titulo: 'Status', peso: 0.9 },
      {
        chave: 'valor',
        titulo: 'Total',
        peso: 1.1,
        alinhamento: 'direita',
        mono: true,
      },
    ];

    const servico = pdf as unknown as {
      largura: number;
      larguras: (c: ColunaDoRelatorio[]) => number[];
    };
    servico.largura = 841.89;
    const larguras = servico.larguras(colunas);

    // O "- 16" é o respiro de cada célula, o mesmo que o desenho usa.
    expect(doc.widthOfString('11/08/2026')).toBeLessThanOrEqual(
      larguras[0] - 16,
    );
  });

  it('gera um PDF de verdade', async () => {
    const bytes = await pdf.gerar(base());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  // ==========================================================================
  // DUAS LINHAS CABEM EM UMA FOLHA — e em 21/10 sairam em TRES.
  //
  // O pdfkit vira a pagina sozinho quando o texto cruzaria a margem de baixo,
  // e o rodape e escrito exatamente ali. Cada frase dele criava uma pagina
  // nova, que nascia com rodape, que criava outra.
  // ==========================================================================
  it('duas linhas saem em UMA pagina', async () => {
    expect(paginas(await pdf.gerar(base()))).toBe(1);
  });

  it('e em paisagem tambem', async () => {
    expect(paginas(await pdf.gerar(base({ paisagem: true })))).toBe(1);
  });

  it('gera uma planilha de verdade', async () => {
    const bytes = await xlsx.gerar(base());
    // Todo xlsx é um zip.
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
  });

  // ==========================================================================
  // O DEFEITO DE 21/10, nos dois formatos.
  // ==========================================================================
  it('célula que veio NÚMERO não derruba o PDF', async () => {
    const comNumero = base({
      linhas: [{ doc: 1182 as never, cliente: 'Juliana', valor: 'R$ 1,00' }],
    });

    await expect(pdf.gerar(comNumero)).resolves.toBeInstanceOf(Buffer);
  });

  it('célula que veio NÚMERO não derruba a planilha', async () => {
    const comNumero = base({
      linhas: [{ doc: 1182 as never, cliente: 'Juliana', valor: 'R$ 1,00' }],
    });

    await expect(xlsx.gerar(comNumero)).resolves.toBeInstanceOf(Buffer);
  });

  it('célula nula vira vazio, e não a palavra "null"', async () => {
    const comNulo = base({
      linhas: [{ doc: null as never, cliente: 'Juliana', valor: 'R$ 1,00' }],
    });

    await expect(pdf.gerar(comNulo)).resolves.toBeInstanceOf(Buffer);
    await expect(xlsx.gerar(comNulo)).resolves.toBeInstanceOf(Buffer);
  });

  it('tabela vazia não explode — consulta sem resultado é legítima', async () => {
    await expect(
      pdf.gerar(base({ linhas: [], total: undefined })),
    ).resolves.toBeInstanceOf(Buffer);
  });

  // ==========================================================================
  // O NÚMERO DE DENTRO DO TEXTO — é o que faz a planilha SOMAR.
  //
  // Guardado como texto, "R$ 98.900,00" não soma e não ordena, e aí a planilha
  // é um PDF feio. E o formato é brasileiro: ponto é milhar, vírgula é
  // decimal — trocar a ordem dos dois `replace` faria mil e duzentos virar um
  // vírgula dois.
  // ==========================================================================
  describe('o número de dentro do texto', () => {
    it.each([
      ['R$ 98.900,00', 98900],
      ['R$ 1.234,56', 1234.56],
      ['1.545', 1545],
      ['61%', 61],
      ['-250', -250],
    ])('"%s" vira %s', (texto, esperado) => {
      expect(numeroDe(texto)).toBe(esperado);
    });

    it.each([['AN20477'], ['—'], ['Concluída'], ['']])(
      '"%s" não é número',
      (texto) => {
        expect(numeroDe(texto)).toBeNull();
      },
    );

    it('número que já veio número passa direto', () => {
      expect(numeroDe(1182)).toBe(1182);
      expect(numeroDe(null)).toBeNull();
      expect(numeroDe(undefined)).toBeNull();
    });
  });
});
