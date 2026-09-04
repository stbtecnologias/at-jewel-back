import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import { DefinirCapaUseCase } from './catalogos.use-cases';

const REFS = [
  { id: 'r-img', tipo: 'IMAGEM', valor: 'pagina.jpg', arquivoId: 'catalogo/0331/referencias/a.jpg', mime: 'image/jpeg', ordem: 0 },
  { id: 'r-pdf', tipo: 'IMAGEM', valor: 'inverno.pdf', arquivoId: 'catalogo/0331/referencias/b.pdf', mime: 'application/pdf', ordem: 1 },
  { id: 'r-txt', tipo: 'OBSERVACAO', valor: 'fundo branco', arquivoId: null, mime: null, ordem: 2 },
];

async function montar(repo: Record<string, jest.Mock>) {
  const mod = await Test.createTestingModule({
    providers: [DefinirCapaUseCase, { provide: CATALOGO_REPOSITORY, useValue: repo }],
  }).compile();
  return mod.get(DefinirCapaUseCase);
}

describe('DefinirCapaUseCase', () => {
  let repo: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn().mockResolvedValue({ id: 'c-1', referencias: REFS }),
      definirCapa: jest.fn().mockResolvedValue({ id: 'c-1' }),
    };
  });

  it('marca uma referência de imagem do próprio catálogo', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'r-img');

    expect(repo.definirCapa).toHaveBeenCalledWith('c-1', 'r-img');
  });

  it('null volta para a capa automática, sem checar nada', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', null);

    expect(repo.definirCapa).toHaveBeenCalledWith('c-1', null);
  });

  it('RECUSA REFERÊNCIA DE OUTRO CATÁLOGO', async () => {
    const uc = await montar(repo);

    // O banco aceitaria: a chave estrangeira so exige que a referencia exista.
    // Sem esta checagem, o card passaria a mostrar a imagem de outra colecao.
    await expect(uc.execute('c-1', 'r-de-outro')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.definirCapa).not.toHaveBeenCalled();
  });

  it('recusa PDF como capa — não vira <img>', async () => {
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'r-pdf')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa referência de texto', async () => {
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'r-txt')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 quando o catálogo não existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'r-img')).rejects.toBeInstanceOf(NotFoundException);
  });
});
