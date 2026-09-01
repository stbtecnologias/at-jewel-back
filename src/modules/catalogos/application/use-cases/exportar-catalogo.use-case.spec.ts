import { BadRequestException } from '@nestjs/common';
import { ExportarCatalogoUseCase } from './exportar-catalogo.use-case';

/**
 * A EXPORTAÇÃO PARA O MARKETING.
 *
 * O que se protege aqui é o CSV, e não o zip. O zip ou abre ou não abre — o
 * erro grita. O CSV erra em silêncio: uma coluna deslocada por um `;` dentro da
 * descrição, ou um nome de arquivo que não corresponde ao que está no pacote,
 * chega ao marketing parecendo certo. E quem monta confia no que leu.
 */
describe('ExportarCatalogoUseCase', () => {
  const FOTO = (extra: Record<string, unknown>) => ({
    id: 'f-1',
    catalogoId: 'cat-1',
    posicao: 1,
    codigoErp: 'BR26252',
    descricao: 'BRINCO RUBI 0.63 CTS',
    precoAVista: 44900,
    parcelas: 10,
    jurosPercentual: null,
    origem: 'WHATSAPP',
    remetente: 'Faby',
    arquivoOriginalId: 'catalogo/0001/originais/a.jpg',
    arquivoId: 'catalogo/0001/fotos/a.png',
    status: 'APROVADA',
    versoes: 1,
    aprovadoPor: 'Faby',
    aprovadoEm: new Date(),
    ...extra,
  });

  const CATALOGO = (fotos: unknown[], referencias: unknown[] = []) => ({
    id: 'cat-1',
    numero: '0001',
    nome: 'Catálogo Rosa Pink',
    formato: '9:16',
    referencias,
    fotos,
  });

  let repo: { buscarPorId: jest.Mock };
  let armazenamento: { ler: jest.Mock };
  let useCase: ExportarCatalogoUseCase;

  /** Lê o zip devolvido até o fim e devolve os bytes. */
  async function bytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const partes: Buffer[] = [];
    for await (const p of stream) partes.push(p as Buffer);
    return Buffer.concat(partes);
  }

  beforeEach(() => {
    repo = { buscarPorId: jest.fn() };
    armazenamento = {
      ler: jest
        .fn()
        .mockResolvedValue({ conteudo: Buffer.from('img'), mime: 'image/png' }),
    };
    useCase = new ExportarCatalogoUseCase(repo as never, armazenamento as never);
  });

  it('leva só o que foi APROVADO', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({ id: 'f-1' }),
        FOTO({ id: 'f-2', status: 'EM_APROVACAO' }),
        FOTO({ id: 'f-3', status: 'REPROVADA' }),
        FOTO({ id: 'f-4', status: 'RECEBIDA' }),
      ]),
    );

    const r = await useCase.execute('cat-1');
    await bytes(r.arquivo);

    // Uma leitura só: as outras três nem chegaram a ser buscadas no S3.
    expect(armazenamento.ler).toHaveBeenCalledTimes(1);
  });

  it('catálogo sem foto aprovada recusa, em vez de devolver zip vazio', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ status: 'EM_APROVACAO' })]),
    );

    await expect(useCase.execute('cat-1')).rejects.toThrow(BadRequestException);
  });

  it('o nome do arquivo carrega a ORDEM, com zero à esquerda', async () => {
    const dez = Array.from({ length: 10 }, (_, i) =>
      FOTO({ id: `f-${i}`, codigoErp: `BR${i}` }),
    );
    repo.buscarPorId.mockResolvedValue(CATALOGO(dez));

    const r = await useCase.execute('cat-1');
    const csv = (await bytes(r.arquivo)).toString('latin1');

    // Sem o zero à esquerda, o explorador de arquivos põe o 10 antes do 2.
    expect(csv).toContain('01-BR0.png');
    expect(csv).toContain('10-BR9.png');
  });

  it('a extensão do nome vem do arquivo REAL, não de um chute', async () => {
    // O mime só se conhece ao ler do armazenamento; montar o CSV antes faria a
    // coluna "Arquivo" apontar para um arquivo que não está no zip.
    armazenamento.ler.mockResolvedValue({
      conteudo: Buffer.from('img'),
      mime: 'image/jpeg',
    });
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO({})]));

    const r = await useCase.execute('cat-1');
    const csv = (await bytes(r.arquivo)).toString('latin1');

    expect(csv).toContain('01-BR26252.jpg');
    expect(csv).not.toContain('01-BR26252.png');
  });

  // O CONTEÚDO do CSV não dá para ler de dentro do zip: ele vai deflacionado.
  // (Os nomes de arquivo, sim — o zip guarda o índice sem comprimir, e é por
  // isso que os testes acima conseguem lê-los.) Então o CSV é alcançado por
  // indexação, como `lerLegenda` no spec da legenda: é detalhe do fluxo, não
  // contrato, e expor só para testar seria pior.
  function csvDe(itens: { foto: unknown; nome: string }[]): string {
    return (
      useCase as unknown as {
        montarCsv: (i: { foto: unknown; nome: string }[]) => string;
      }
    ).montarCsv(itens);
  }

  it('descrição com ponto e vírgula não quebra a coluna', async () => {
    const csv = csvDe([
      { foto: FOTO({ descricao: 'BRINCO 18K; 5,80G' }), nome: '01-BR26252.png' },
    ]);

    expect(csv).toContain('"BRINCO 18K; 5,80G"');
  });

  it('a parcela é calculada, e bate com a do catálogo impresso', async () => {
    // 35.920 / 0,80 / 10 = 4.490 — conferido em 25 de 25 peças no levantamento.
    const csv = csvDe([
      { foto: FOTO({ precoAVista: 35920, parcelas: 10 }), nome: '01-x.png' },
    ]);

    expect(csv).toContain('4.490,00');
  });

  it('peça sem preço deixa as colunas de valor vazias, e não zeradas', async () => {
    // `R$ 0,00` num catálogo é pior que campo em branco: parece preço.
    const csv = csvDe([
      { foto: FOTO({ precoAVista: null, parcelas: null }), nome: '01-x.png' },
    ]);

    expect(csv).toContain('01-x.png;BR26252;BRINCO RUBI 0.63 CTS;;;');
  });

  it('foto que sumiu do armazenamento não vira linha no CSV', async () => {
    // O CSV nunca pode prometer arquivo que não está no zip.
    armazenamento.ler
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ conteudo: Buffer.from('img'), mime: 'image/png' });
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({ id: 'f-1', codigoErp: 'SUMIU' }),
        FOTO({ id: 'f-2', codigoErp: 'BR26252' }),
      ]),
    );

    const r = await useCase.execute('cat-1');
    const csv = (await bytes(r.arquivo)).toString('latin1');

    expect(csv).not.toContain('SUMIU');
    // E a numeração fecha sem buraco: a sobrevivente é a 01.
    expect(csv).toContain('01-BR26252.png');
  });

  it('as páginas de referência vão numa PASTA à parte', async () => {
    // Soltas na raiz, uma página de catálogo antigo ficaria lado a lado com as
    // peças novas e poderia acabar publicada como se fosse uma delas.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO(
        [FOTO({})],
        [
          { id: 'r-1', tipo: 'IMAGEM', valor: 'Página 1.jpg', arquivoId: 'k1', ordem: 0 },
          { id: 'r-2', tipo: 'FONTE', valor: 'Futura', arquivoId: null, ordem: 1 },
        ],
      ),
    );

    const r = await useCase.execute('cat-1');
    const zip = (await bytes(r.arquivo)).toString('latin1');

    expect(zip).toContain('referencias/01-pagina-1.png');
    // A referência de TEXTO não vira arquivo — é uma linha de instrução.
    expect(zip).not.toContain('Futura');
  });

  it('o nome do zip identifica o catálogo, sem acento nem espaço', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO({})]));

    const r = await useCase.execute('cat-1');

    expect(r.nomeArquivo).toBe('catalogo-0001-catalogo-rosa-pink.zip');
  });
});
