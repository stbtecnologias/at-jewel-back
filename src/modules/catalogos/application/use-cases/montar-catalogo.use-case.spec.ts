import { BadRequestException } from '@nestjs/common';
import { inflateSync } from 'node:zlib';
import { MontarCatalogoUseCase } from './montar-catalogo.use-case';

/**
 * O TEXTO QUE O PDF DE FATO IMPRIMIU.
 *
 * Duas camadas escondem o texto de uma comparação ingênua no buffer:
 *
 *   1. o PDFKit COMPRIME os fluxos de conteúdo (FlateDecode);
 *   2. dentro deles, a string vai em HEXADECIMAL —
 *      `[<42523236323532> 0] TJ`, e não entre parênteses.
 *
 * Um `toContain` no arquivo cru passaria em silêncio, testando nada. Aqui os
 * fluxos são inflados e os blocos `<...>` decodificados.
 *
 * Junta-se TUDO de propósito: uma frase pode sair partida em vários operadores
 * por causa de kerning, e comparar pedaço a pedaço quebraria o teste sem que
 * nada estivesse errado.
 *
 * O bullet fica de fora das comparações — ele é 0x95 na codificação do PDF e
 * não bate com o `•` do nosso código-fonte. Conferir as duas metades separadas
 * verifica o mesmo sem depender de codificação.
 */
function textoImpresso(pdf: Buffer): string {
  const pedacos: string[] = [];
  let i = 0;

  for (;;) {
    const abre = pdf.indexOf('stream', i);
    if (abre === -1) break;
    const fecha = pdf.indexOf('endstream', abre);
    if (fecha === -1) break;

    let dados = abre + 'stream'.length;
    if (pdf[dados] === 0x0d) dados++;
    if (pdf[dados] === 0x0a) dados++;

    try {
      const conteudo = inflateSync(pdf.subarray(dados, fecha)).toString('latin1');
      for (const m of conteudo.matchAll(/<([0-9A-Fa-f]+)>/g)) {
        pedacos.push(Buffer.from(m[1], 'hex').toString('latin1'));
      }
    } catch {
      // Fluxo que não é texto comprimido (a imagem, por exemplo). Segue.
    }

    i = fecha + 'endstream'.length;
  }

  return pedacos.join('');
}

/**
 * A MONTAGEM DO CATÁLOGO EM PDF.
 *
 * O que estes testes protegem é a promessa que dá nome ao arquivo: **nenhum
 * modelo desenha esta página**. O dado que chega ao PDF é o dado do ERP, e a
 * foto é a que foi aprovada — nada é gerado, nada é reescrito. É por isso que
 * o teste do preço existe: num catálogo, dígito é dinheiro.
 *
 * O conteúdo do PDF é lido como texto bruto. PDFKit não comprime os fluxos de
 * texto por padrão, então as strings desenhadas aparecem legíveis no buffer —
 * o que faz destes testes uma verificação do que de fato foi impresso, e não
 * do que a gente pretendia imprimir.
 */
describe('MontarCatalogoUseCase', () => {
  const FOTO = (extra: Record<string, unknown> = {}) => ({
    id: 'f-1',
    catalogoId: 'cat-1',
    posicao: 1,
    codigoErp: 'BR26252',
    descricao: 'Brinco Rubi 0.63 cts',
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

  const CATALOGO = (fotos: unknown[], extra: Record<string, unknown> = {}) => ({
    id: 'cat-1',
    numero: '0001',
    nome: 'Catálogo Rosa Pink',
    tema: 'Mundo Rosa',
    formato: '9:16',
    referencias: [],
    fotos,
    finalArquivoId: null,
    ...extra,
  });

  // PNG 1x1 válido: o PDFKit decodifica de verdade, então não serve
  // Buffer.from('img').
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  let repo: {
    buscarPorId: jest.Mock;
    registrarFinal: jest.Mock;
  };
  let armazenamento: { ler: jest.Mock; guardar: jest.Mock; remover: jest.Mock };
  let useCase: MontarCatalogoUseCase;

  /** O texto que o PDF gravado no armazenamento de fato imprimiu. */
  function pdfGravado(): string {
    const [arquivo] = armazenamento.guardar.mock.calls[0] as [
      { conteudo: Buffer },
    ];
    return textoImpresso(arquivo.conteudo);
  }

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn(),
      registrarFinal: jest.fn().mockResolvedValue({ id: 'fin-1' }),
    };
    armazenamento = {
      ler: jest.fn().mockResolvedValue({ conteudo: PNG, mime: 'image/png' }),
      guardar: jest.fn().mockResolvedValue('catalogo/0001/finais/x.pdf'),
      remover: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new MontarCatalogoUseCase(repo as never, armazenamento as never);
  });

  it('o preço vai EXATO, e o parcelado é calculado dele', async () => {
    // A razão de existir deste use case em vez de pedir a página a um modelo.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ precoAVista: 35920, parcelas: 10 })]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).toContain('R$35.920,00 a vista');
    expect(pdf).toContain('10 X R$4.490,00');
  });

  it('o descritivo sai no padrão impresso, em caixa alta', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    // A descrição chega em caixa baixa do ERP e sai em caixa alta, como nas
    // páginas de referência.
    expect(pdf).toContain('BR26252');
    expect(pdf).toContain('BRINCO RUBI 0.63 CTS');
    expect(pdf).not.toContain('Brinco Rubi');
  });

  it('só as APROVADAS viram página', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({ id: 'f-1' }),
        FOTO({ id: 'f-2', status: 'EM_APROVACAO' }),
        FOTO({ id: 'f-3', status: 'REPROVADA' }),
      ]),
    );

    await useCase.execute('cat-1');

    expect(armazenamento.ler).toHaveBeenCalledTimes(1);
  });

  it('sem foto aprovada, recusa em vez de montar um PDF só com capa', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ status: 'EM_APROVACAO' })]),
    );

    await expect(useCase.execute('cat-1')).rejects.toThrow(BadRequestException);
    expect(armazenamento.guardar).not.toHaveBeenCalled();
  });

  it('a capa leva nome, tema e a contagem de peças', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO(), FOTO({ id: 'f-2' })]));

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).toContain('CATÁLOGO ROSA PINK');
    expect(pdf).toContain('Mundo Rosa');
    expect(pdf).toContain('2 peças');
  });

  it('peça sem preço não imprime valor nenhum', async () => {
    // `R$ 0,00` impresso num catálogo é pior que não ter linha de preço.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO({ precoAVista: null, parcelas: null })]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).toContain('BR26252');
    expect(pdf).not.toContain('a vista');
  });

  it('foto que sumiu do armazenamento não vira página muda', async () => {
    armazenamento.ler
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ conteudo: PNG, mime: 'image/png' });
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([
        FOTO({ id: 'f-1', codigoErp: 'SUMIU' }),
        FOTO({ id: 'f-2', codigoErp: 'BR26252' }),
      ]),
    );

    await useCase.execute('cat-1');
    const pdf = pdfGravado();

    expect(pdf).not.toContain('SUMIU');
    expect(pdf).toContain('BR26252');
  });

  it('remontar NÃO apaga a versão anterior', async () => {
    // A invariante que a migração 44 existe para garantir: bastava um clique
    // por curiosidade no botão de montar para o arquivo que o marketing tinha
    // enviado sumir do banco e do bucket, sem volta.
    repo.buscarPorId.mockResolvedValue(
      CATALOGO([FOTO()], { finalArquivoId: 'catalogo/0001/finais/velho.pdf' }),
    );

    await useCase.execute('cat-1');

    expect(repo.registrarFinal).toHaveBeenCalled();
    expect(armazenamento.remover).not.toHaveBeenCalled();
  });

  it('grava como IA, sem quem enviou — foi o sistema, não uma pessoa', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO([FOTO()]));

    await useCase.execute('cat-1');

    expect(repo.registrarFinal).toHaveBeenCalledWith('cat-1', {
      origem: 'IA',
      arquivoId: 'catalogo/0001/finais/x.pdf',
      nomeArquivo: 'catalogo-0001.pdf',
      mime: 'application/pdf',
      tamanhoBytes: expect.any(Number) as number,
      enviadoPor: null,
    });
  });
});
