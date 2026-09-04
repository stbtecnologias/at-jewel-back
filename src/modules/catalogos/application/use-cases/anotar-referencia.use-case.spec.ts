import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import { AnotarReferenciaUseCase } from './catalogos.use-cases';

async function montar(repo: Record<string, jest.Mock>) {
  const mod = await Test.createTestingModule({
    providers: [AnotarReferenciaUseCase, { provide: CATALOGO_REPOSITORY, useValue: repo }],
  }).compile();
  return mod.get(AnotarReferenciaUseCase);
}

describe('AnotarReferenciaUseCase', () => {
  let repo: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = { anotarReferencia: jest.fn().mockResolvedValue({ id: 'r-1' }) };
  });

  it('guarda a nota do arquivo', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'r-1', '  fundo branco  ');

    // Aparado: espaco em volta nao e conteudo, e vazaria para o zip da
    // exportacao.
    expect(repo.anotarReferencia).toHaveBeenCalledWith('c-1', 'r-1', 'fundo branco');
  });

  it('TEXTO VAZIO VIRA NULL, e nao string vazia', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'r-1', '   ');

    // As duas coisas significam "sem observacao". Guardar as duas obrigaria a
    // tela a tratar os dois casos para sempre.
    expect(repo.anotarReferencia).toHaveBeenCalledWith('c-1', 'r-1', null);
  });

  it('null apaga', async () => {
    const uc = await montar(repo);
    await uc.execute('c-1', 'r-1', null);

    expect(repo.anotarReferencia).toHaveBeenCalledWith('c-1', 'r-1', null);
  });

  it('recusa nota acima de 500 caracteres', async () => {
    const uc = await montar(repo);
    await expect(uc.execute('c-1', 'r-1', 'x'.repeat(501))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.anotarReferencia).not.toHaveBeenCalled();
  });

  it('404 quando a referência não é deste catálogo', async () => {
    // O repositorio poe o `catalogo_id` no WHERE: referencia de outra colecao
    // simplesmente nao e encontrada.
    repo.anotarReferencia.mockResolvedValue(null);
    const uc = await montar(repo);

    await expect(uc.execute('c-1', 'r-de-outro', 'nota')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
