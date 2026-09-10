import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import { CorrigirParcelamentoUseCase } from './catalogos.use-cases';

const FOTO = { id: 'f-1', parcelas: 10, jurosPercentual: null };

async function montar(repo: Record<string, jest.Mock>) {
  const mod = await Test.createTestingModule({
    providers: [CorrigirParcelamentoUseCase, { provide: CATALOGO_REPOSITORY, useValue: repo }],
  }).compile();
  return mod.get(CorrigirParcelamentoUseCase);
}

describe('CorrigirParcelamentoUseCase', () => {
  let repo: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn().mockResolvedValue({ id: 'c-1', fotos: [FOTO] }),
      atualizarFoto: jest.fn().mockResolvedValue({ ...FOTO, parcelas: 6 }),
    };
  });

  it('corrige as parcelas', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'f-1', { parcelas: 6 });

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', { parcelas: 6 });
  });

  it('CAMPO AUSENTE NÃO MEXE no outro', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'f-1', { parcelas: 6 });

    // Mandar só as parcelas não pode apagar o juro que já estava lá — por isso
    // o objeto enviado ao repositório não carrega `jurosPercentual`.
    expect(repo.atualizarFoto).toHaveBeenCalledWith(
      'f-1',
      expect.not.objectContaining({ jurosPercentual: expect.anything() }),
    );
  });

  it('null no juro limpa — e é diferente de campo ausente', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'f-1', { jurosPercentual: null });

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', { jurosPercentual: null });
  });

  it('RECUSA FOTO DE OUTRO CATÁLOGO', async () => {
    const uc = await montar(repo);

    // `atualizarFoto` grava por id e não olha a coleção: sem esta checagem, o
    // preço mudaria no catálogo errado.
    await expect(uc.execute('c-1', 'f-de-outro', { parcelas: 6 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.atualizarFoto).not.toHaveBeenCalled();
  });

  it.each([0, -1, 25, 1.5])('recusa %s parcelas', async (n) => {
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'f-1', { parcelas: n })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([-1, 301])('recusa juro de %s%%', async (n) => {
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'f-1', { jurosPercentual: n })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('juro zero é válido — é "conferi e não tem"', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'f-1', { jurosPercentual: 0 });

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', { jurosPercentual: 0 });
  });

  it('404 quando o catálogo não existe', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'f-1', { parcelas: 6 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
