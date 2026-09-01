import { BadRequestException } from '@nestjs/common';
import { EnviarFinalUseCase, LIMITE_FINAL_BYTES } from './enviar-final.use-case';

/**
 * O CATÁLOGO MONTADO FORA, VOLTANDO.
 *
 * Este é o ÚNICO ponto do módulo em que um arquivo arbitrário entra por upload
 * de gente e é servido de volta pelo nosso domínio. Os testes que importam aqui
 * são os da porta: o que não pode entrar, e o que não pode ser apagado.
 */
describe('EnviarFinalUseCase', () => {
  const ARQUIVO = (extra: Record<string, unknown> = {}) => ({
    buffer: Buffer.from('%PDF-1.4'),
    mimetype: 'application/pdf',
    originalname: 'rosa-pink-v3-final.pdf',
    size: 2_000_000,
    ...extra,
  });

  let repo: { buscarPorId: jest.Mock; registrarFinal: jest.Mock };
  let armazenamento: { guardar: jest.Mock; remover: jest.Mock };
  let useCase: EnviarFinalUseCase;

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn().mockResolvedValue({
        id: 'cat-1',
        numero: '0001',
        nome: 'Catálogo Rosa Pink',
        finais: [],
      }),
      registrarFinal: jest.fn().mockResolvedValue({ id: 'fin-1' }),
    };
    armazenamento = {
      guardar: jest.fn().mockResolvedValue('catalogo/0001/finais/x.pdf'),
      remover: jest.fn(),
    };
    useCase = new EnviarFinalUseCase(repo as never, armazenamento as never);
  });

  it('guarda na pasta do catálogo e registra como MARKETING', async () => {
    await useCase.execute('cat-1', ARQUIVO() as never, 'faby@at.com');

    const [, pasta] = armazenamento.guardar.mock.calls[0] as [unknown, string];
    expect(pasta).toBe('catalogo/0001/finais');

    expect(repo.registrarFinal).toHaveBeenCalledWith('cat-1', {
      origem: 'MARKETING',
      arquivoId: 'catalogo/0001/finais/x.pdf',
      // O nome ORIGINAL: é por ele que a pessoa reconhece a versão na lista.
      nomeArquivo: 'rosa-pink-v3-final.pdf',
      mime: 'application/pdf',
      tamanhoBytes: 2_000_000,
      enviadoPor: 'faby@at.com',
    });
  });

  it('NÃO apaga a versão anterior', async () => {
    repo.buscarPorId.mockResolvedValue({
      id: 'cat-1',
      numero: '0001',
      nome: 'Rosa Pink',
      finais: [{ id: 'fin-0', arquivoId: 'catalogo/0001/finais/velho.pdf' }],
    });

    await useCase.execute('cat-1', ARQUIVO() as never, 'faby@at.com');

    expect(armazenamento.remover).not.toHaveBeenCalled();
  });

  it('aceita ZIP e imagem, além de PDF', async () => {
    for (const mimetype of [
      'application/zip',
      'image/png',
      'image/jpeg',
      'image/webp',
    ]) {
      await expect(
        useCase.execute('cat-1', ARQUIVO({ mimetype }) as never, 'faby@at.com'),
      ).resolves.toBeDefined();
    }
  });

  it('recusa HTML e SVG — seria hospedar script no nosso domínio', async () => {
    // A rota de mídia serve este arquivo de volta. Um SVG com <script> dentro
    // passaria a rodar na origem do painel.
    for (const mimetype of ['text/html', 'image/svg+xml']) {
      await expect(
        useCase.execute('cat-1', ARQUIVO({ mimetype }) as never, 'faby@at.com'),
      ).rejects.toThrow(BadRequestException);
    }
    expect(armazenamento.guardar).not.toHaveBeenCalled();
  });

  it('recusa acima do teto, e o teto NÃO é o da foto', async () => {
    // 12 MB é o limite da foto de celular; um PDF de InDesign passa disso sem
    // esforço, e reusar aquele limite faria o envio falhar justamente no caso
    // para o qual ele existe.
    await expect(
      useCase.execute(
        'cat-1',
        ARQUIVO({ size: 20 * 1024 * 1024 }) as never,
        'faby@at.com',
      ),
    ).resolves.toBeDefined();

    await expect(
      useCase.execute(
        'cat-1',
        ARQUIVO({ size: LIMITE_FINAL_BYTES + 1 }) as never,
        'faby@at.com',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('sem arquivo, recusa antes de tocar no armazenamento', async () => {
    await expect(
      useCase.execute('cat-1', undefined, 'faby@at.com'),
    ).rejects.toThrow(BadRequestException);
    expect(armazenamento.guardar).not.toHaveBeenCalled();
  });
});
