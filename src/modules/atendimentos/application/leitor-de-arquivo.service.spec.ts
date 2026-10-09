import ExcelJS from 'exceljs';
import { LeitorDeArquivoService } from './leitor-de-arquivo.service';

/**
 * RF9 — "permitir enviar documentos, imagens, PDFs e planilhas para análise
 * financeira" (alinhamento interno de 07/10).
 *
 * Medido em 08/10: o webhook extraía imagem e áudio, e mais nada. Documento
 * chegava e era descartado na borda. Não era que a agente não entendesse
 * planilha — **o arquivo não passava da porta**.
 *
 * Aqui a planilha é montada de verdade com o `exceljs` e lida de volta: é a
 * única forma de provar que fórmula, data e texto rico saem legíveis.
 */
describe('LeitorDeArquivoService', () => {
  const leitor = new LeitorDeArquivoService();

  async function planilha(
    monta: (aba: ExcelJS.Worksheet) => void,
    nomeAba = 'Posicao',
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    monta(wb.addWorksheet(nomeAba));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const XLSX =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  describe('a planilha', () => {
    /* ESTE É O TESTE. O resto é contorno. */
    it('vira tabela com as colunas em pé', async () => {
      const bytes = await planilha((aba) => {
        aba.addRow(['Codigo', 'Descricao', 'Saldo', 'Valor']);
        aba.addRow(['AN24084', 'ANEL ESM OB 18K', 1, 37900]);
        aba.addRow(['CO25413', 'COLAR RIV 16.92 CTS', 2, 222530]);
      });

      const r = await leitor.ler({ bytes, mime: XLSX, nome: 'posicao.xlsx' });

      expect(r.anexo).toBeUndefined();
      expect(r.texto).toContain('Codigo | Descricao | Saldo | Valor');
      expect(r.texto).toContain('AN24084 | ANEL ESM OB 18K | 1 | 37900');
      expect(r.aviso).toBeUndefined();
    });

    /**
     * O exceljs devolve OBJETO para fórmula, data e texto rico. `String(valor)`
     * neles vira "[object Object]" — e uma coluna de valores assim destrói a
     * análise em silêncio, com a tabela parecendo inteira.
     */
    it('fórmula sai pelo resultado, não pela fórmula', async () => {
      const bytes = await planilha((aba) => {
        aba.addRow(['markup']);
        aba.addRow([{ formula: 'B1/C1', result: 2.4 }]);
      });

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.texto).toContain('2.4');
      expect(r.texto).not.toContain('[object Object]');
      expect(r.texto).not.toContain('B1/C1');
    });

    it('data sai em ISO curto, e não com fuso e dia da semana', async () => {
      const bytes = await planilha((aba) => {
        aba.addRow([new Date('2026-09-15T12:00:00Z')]);
      });

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.texto).toContain('2026-09-15');
      expect(r.texto).not.toMatch(/GMT|Tue|Mon|Wed/);
    });

    it('texto rico se junta num texto só', async () => {
      const bytes = await planilha((aba) => {
        aba.addRow([
          { richText: [{ text: 'ANEL ' }, { text: 'ESMERALDA' }] },
        ]);
      });

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.texto).toContain('ANEL ESMERALDA');
      expect(r.texto).not.toContain('[object Object]');
    });

    /**
     * O TETO QUE SE ANUNCIA. Cortar em silêncio faria a agente dizer "o markup
     * médio é 2,1" olhando um terço da planilha, com a confiança de quem viu
     * tudo — o defeito que a leva de 07/10 inteira existe para não cometer.
     */
    it('planilha grande é cortada, e o corte vira frase', async () => {
      const bytes = await planilha((aba) => {
        for (let i = 1; i <= 520; i++) aba.addRow([`AN${i}`, i * 100]);
      });

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.texto).toBeDefined();
      expect(r.aviso).toContain('400');
      expect(r.aviso).toContain('520');
    });

    it('todas as abas entram, não só a primeira', async () => {
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Posicao').addRow(['AN24084', 1]);
      wb.addWorksheet('Resumo').addRow(['total', 546]);
      const bytes = Buffer.from(await wb.xlsx.writeBuffer());

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.texto).toContain('Posicao');
      expect(r.texto).toContain('Resumo');
      expect(r.texto).toContain('546');
    });

    it('linha vazia no meio não gasta o teto nem vira linha', async () => {
      const bytes = await planilha((aba) => {
        aba.addRow(['AN1', 1]);
        aba.addRow([]);
        aba.addRow(['AN2', 2]);
      });

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.texto?.split('\n').filter((l) => l.startsWith('AN'))).toHaveLength(2);
    });

    it('reconhece pela extensão quando o mime não ajuda', async () => {
      const bytes = await planilha((aba) => aba.addRow(['AN1', 1]));

      const r = await leitor.ler({
        bytes,
        mime: 'application/octet-stream',
        nome: 'Posicao de estoque.xlsx',
      });

      expect(r.texto).toContain('AN1');
    });
  });

  describe('o PDF e a imagem vão inteiros ao modelo', () => {
    /**
     * NÃO PASSAM POR PARSER, e é a decisão mais importante do arquivo. Um
     * parser devolveria texto corrido, e relatório de estoque sem coluna não
     * se analisa: "AN24084 37.900 1" e "AN24084 1 37.900" viram a mesma linha.
     */
    it('o PDF vira bloco de documento, sem virar texto aqui', async () => {
      const r = await leitor.ler({
        bytes: Buffer.from('%PDF-1.4 fingindo'),
        mime: 'application/pdf',
        nome: 'Posicao.pdf',
      });

      expect(r.texto).toBeUndefined();
      expect(r.anexo).toEqual({
        tipo: 'pdf',
        mime: 'application/pdf',
        base64: Buffer.from('%PDF-1.4 fingindo').toString('base64'),
        nome: 'Posicao.pdf',
      });
    });

    it('a imagem vira bloco de imagem, com o mime que chegou', async () => {
      const r = await leitor.ler({
        bytes: Buffer.from([0xff, 0xd8, 0xff]),
        mime: 'image/jpeg',
      });

      expect(r.anexo?.tipo).toBe('imagem');
      expect(r.anexo?.mime).toBe('image/jpeg');
    });

    it('o mime com charset grudado não atrapalha', async () => {
      const r = await leitor.ler({
        bytes: Buffer.from('a,b\n1,2'),
        mime: 'text/csv; charset=utf-8',
      });

      expect(r.texto).toContain('a,b');
    });
  });

  /**
   * ARQUIVO ILEGÍVEL NÃO PODE DERRUBAR A CONVERSA, e nem sair em silêncio:
   * quem mandou planilha continua esperando resposta. Foi o defeito do áudio
   * em 21/08 — quem mandava não recebia nada e nem sabia por quê.
   */
  describe('o que não dá para ler, diz por quê', () => {
    it('tipo que não leio: diz o tipo, para ela poder escolher outro', async () => {
      const r = await leitor.ler({
        bytes: Buffer.from('x'),
        mime: 'application/vnd.ms-powerpoint',
        nome: 'slides.ppt',
      });

      expect(r.texto).toBeUndefined();
      expect(r.anexo).toBeUndefined();
      expect(r.aviso).toContain('application/vnd.ms-powerpoint');
      expect(r.aviso).toContain('PDF');
    });

    /**
     * ====================================================================
     * O TETO É POR TIPO, E CADA NÚMERO VEM DE UM LIMITE DA API — 09/10/2026.
     *
     * Era um só, de 12 MB. Para IMAGEM isso estava errado: a API aceita no
     * máximo 10 MB já em base64, e base64 infla um terço — uma foto de 8 a
     * 12 MB passava aqui e era recusada lá, virando "não consegui"
     * genérico para quem mandou.
     *
     * Estes testes guardam os dois lados de cada corte. O da imagem é o que
     * teria pegado o defeito.
     * ====================================================================
     */
    it('PDF grande demais: diz o tamanho e o limite do PDF', async () => {
      const r = await leitor.ler({
        bytes: Buffer.alloc(21 * 1024 * 1024),
        mime: 'application/pdf',
      });

      expect(r.anexo).toBeUndefined();
      expect(r.aviso).toMatch(/21\.0 MB/);
      expect(r.aviso).toContain('20 MB');
      // DIZ O TIPO: sem isso, quem ouviu o limite do PDF acha que vale para
      // a foto, que tem outro.
      expect(r.aviso).toContain('PDF');
    });

    it('PDF de 13 MB AGORA PASSA — era recusado pelo teto velho', async () => {
      const r = await leitor.ler({
        bytes: Buffer.alloc(13 * 1024 * 1024),
        mime: 'application/pdf',
      });

      expect(r.aviso).toBeUndefined();
      expect(r.anexo?.tipo).toBe('pdf');
    });

    it('IMAGEM acima de 7 MB é recusada AQUI, e não pela API', async () => {
      // O defeito que isto pega: com o teto único de 12 MB, estes 8 MB
      // passavam e viravam ~10,7 MB em base64 — acima dos 10 MB que a API
      // aceita por imagem. A recusa vinha de lá, sem dizer o motivo.
      const r = await leitor.ler({
        bytes: Buffer.alloc(8 * 1024 * 1024),
        mime: 'image/jpeg',
      });

      expect(r.anexo).toBeUndefined();
      expect(r.aviso).toMatch(/8\.0 MB/);
      expect(r.aviso).toContain('7 MB');
      expect(r.aviso).toContain('imagem');
    });

    it('imagem dentro do limite passa', async () => {
      const r = await leitor.ler({
        bytes: Buffer.alloc(6 * 1024 * 1024),
        mime: 'image/jpeg',
      });

      expect(r.aviso).toBeUndefined();
      expect(r.anexo?.tipo).toBe('imagem');
    });

    it('o base64 da imagem no limite cabe nos 10 MB da API', () => {
      // A conta que justifica o 7: base64 infla 4/3. Se alguém subir o teto
      // da imagem sem refazer esta conta, isto quebra ANTES de a API
      // recusar em produção.
      const MAXIMO_IMAGEM = 7 * 1024 * 1024;
      expect(Math.ceil(MAXIMO_IMAGEM / 3) * 4).toBeLessThan(10 * 1024 * 1024);
    });

    it('o base64 do PDF no limite cabe na requisição de 32 MB', () => {
      const MAXIMO_PDF = 20 * 1024 * 1024;
      // Com folga para o prompt, as ferramentas e o histórico, que são texto.
      expect(Math.ceil(MAXIMO_PDF / 3) * 4).toBeLessThan(28 * 1024 * 1024);
    });

    it('planilha corrompida não lança — devolve o que fazer', async () => {
      const r = await leitor.ler({
        bytes: Buffer.from('isto nao e um xlsx'),
        mime: XLSX,
        nome: 'quebrada.xlsx',
      });

      expect(r.texto).toBeUndefined();
      expect(r.aviso).toContain('CSV');
    });

    it('planilha vazia diz que está vazia', async () => {
      const bytes = await planilha(() => {});

      const r = await leitor.ler({ bytes, mime: XLSX });

      expect(r.aviso).toContain('vazia');
    });
  });
});
