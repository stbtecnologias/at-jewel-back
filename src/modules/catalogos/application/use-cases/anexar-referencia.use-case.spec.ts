import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ARMAZENAMENTO, CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import { AnexarReferenciaUseCase } from './catalogos.use-cases';

const CATALOGO = { id: 'c-1', numero: '0331', nome: 'Inverno' };

function arquivo(mimetype: string, nome = 'pagina', size = 1000) {
  return { buffer: Buffer.from('x'), mimetype, originalname: nome, size };
}

async function montar(repo: Record<string, jest.Mock>, arm: Record<string, jest.Mock>) {
  const mod = await Test.createTestingModule({
    providers: [
      AnexarReferenciaUseCase,
      { provide: CATALOGO_REPOSITORY, useValue: repo },
      { provide: ARMAZENAMENTO, useValue: arm },
    ],
  }).compile();
  return mod.get(AnexarReferenciaUseCase);
}

describe('AnexarReferenciaUseCase — o que uma referência aceita', () => {
  let repo: Record<string, jest.Mock>;
  let arm: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn().mockResolvedValue(CATALOGO),
      criarReferencia: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'r-1', ...d })),
    };
    arm = { guardar: jest.fn().mockResolvedValue('catalogo/0331/referencias/a.jpg') };
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])('aceita %s', async (mime) => {
    const uc = await montar(repo, arm);
    await expect(uc.imagens('c-1', [arquivo(mime)])).resolves.toHaveLength(1);
  });

  it('ACEITA PDF — o catálogo anterior inteiro, e não só a página escaneada', async () => {
    const uc = await montar(repo, arm);
    await uc.imagens('c-1', [arquivo('application/pdf', 'inverno-2025.pdf')]);

    // O MIME e gravado: e o que a tela usa para desenhar cartao de arquivo em
    // vez de miniatura — `<img src="...pdf">` nao desenha nada.
    expect(repo.criarReferencia).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'IMAGEM', mime: 'application/pdf' }),
    );
  });

  it('recusa o que não é nem imagem nem PDF', async () => {
    const uc = await montar(repo, arm);
    await expect(uc.imagens('c-1', [arquivo('application/zip')])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(arm.guardar).not.toHaveBeenCalled();
  });

  it('guarda na pasta do catálogo, pelo número visível', async () => {
    const uc = await montar(repo, arm);
    await uc.imagens('c-1', [arquivo('image/png')]);

    expect(arm.guardar).toHaveBeenCalledWith(
      expect.anything(),
      'catalogo/0331/referencias',
    );
  });

  it('PDF de catalogo fechado cabe — o teto dele nao e o da foto', async () => {
    const uc = await montar(repo, arm);
    // 87 MB e o MAIOR catalogo real da casa (A.T FINE JEWELRY, medido em
    // 04/09/2026). O primeiro teto que escrevi, 60 MB, recusava quatro dos
    // sete arquivos que existem — este numero vem dos arquivos, nao de palpite.
    await expect(
      uc.imagens('c-1', [arquivo('application/pdf', 'fine-jewelry.pdf', 87 * 1024 * 1024)]),
    ).resolves.toHaveLength(1);
  });

  it('imagem gigante continua recusada — o teto maior e so do PDF', async () => {
    const uc = await montar(repo, arm);
    await expect(
      uc.imagens('c-1', [arquivo('image/jpeg', 'foto.jpg', 40 * 1024 * 1024)]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UM ARQUIVO RUIM NAO DEIXA METADE GRAVADA', async () => {
    const uc = await montar(repo, arm);
    const lote = [
      arquivo('image/png', 'boa-1.png'),
      arquivo('image/png', 'boa-2.png'),
      arquivo('application/zip', 'ruim.zip'),
    ];

    await expect(uc.imagens('c-1', lote)).rejects.toBeInstanceOf(BadRequestException);

    // As duas primeiras sao validas e vem ANTES da ruim. Validando dentro do
    // laco, elas ja estariam no banco e no bucket quando a terceira estourasse.
    expect(arm.guardar).not.toHaveBeenCalled();
    expect(repo.criarReferencia).not.toHaveBeenCalled();
  });

  it('o erro diz QUAL arquivo — num lote de 20, so "formato nao aceito" nao ajuda', async () => {
    const uc = await montar(repo, arm);
    await expect(
      uc.imagens('c-1', [arquivo('image/png'), arquivo('application/zip', 'ruim.zip')]),
    ).rejects.toThrow('ruim.zip');
  });

  it('recusa envio vazio', async () => {
    const uc = await montar(repo, arm);
    await expect(uc.imagens('c-1', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 quando o catálogo não existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    const uc = await montar(repo, arm);
    await expect(uc.imagens('c-1', [arquivo('image/png')])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('referência de texto não passa por upload — e IMAGEM exige arquivo', async () => {
    const uc = await montar(repo, arm);
    await expect(uc.texto('c-1', 'IMAGEM', 'x')).rejects.toBeInstanceOf(BadRequestException);
  });
});
