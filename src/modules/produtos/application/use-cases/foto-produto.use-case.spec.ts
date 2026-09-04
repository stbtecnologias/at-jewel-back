import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ARMAZENAMENTO } from '../../../catalogos/domain/ports/injection-tokens';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import { FotoProdutoUseCase } from './foto-produto.use-case';

const PNG = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'p.png', size: 10 };

function produto(over: Record<string, unknown> = {}) {
  return { id: 'p-1', codigoErp: 'CO26185', fotoArquivoId: null, ...over };
}

async function montar(repo: Record<string, jest.Mock>, arm: Record<string, jest.Mock>) {
  const mod = await Test.createTestingModule({
    providers: [
      FotoProdutoUseCase,
      { provide: PRODUTO_REPOSITORY, useValue: repo },
      { provide: ARMAZENAMENTO, useValue: arm },
    ],
  }).compile();
  return mod.get(FotoProdutoUseCase);
}

describe('FotoProdutoUseCase', () => {
  let repo: Record<string, jest.Mock>;
  let arm: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(produto()),
      definirFotoArquivo: jest.fn().mockResolvedValue(undefined),
    };
    arm = {
      guardar: jest.fn().mockResolvedValue('produtos/CO26185/novo.png'),
      remover: jest.fn().mockResolvedValue(undefined),
      caminhoPublico: jest.fn((c: string) => `/midia/${c}`),
    };
  });

  it('guarda na pasta do CODIGO, e nao do id', async () => {
    const uc = await montar(repo, arm);
    await uc.subir('p-1', PNG);

    expect(arm.guardar).toHaveBeenCalledWith(expect.anything(), 'produtos/CO26185');
  });

  it('cai no id quando a peca nao tem codigo do ERP', async () => {
    repo.findById.mockResolvedValue(produto({ codigoErp: null }));
    const uc = await montar(repo, arm);
    await uc.subir('p-1', PNG);

    expect(arm.guardar).toHaveBeenCalledWith(expect.anything(), 'produtos/P-1');
  });

  it('higieniza o codigo com hifen para virar caminho', async () => {
    repo.findById.mockResolvedValue(produto({ codigoErp: '1-25-3A-2' }));
    const uc = await montar(repo, arm);
    await uc.subir('p-1', PNG);

    // Hifen e ponto passam; o que passar disso vira `_`.
    expect(arm.guardar).toHaveBeenCalledWith(expect.anything(), 'produtos/1-25-3A-2');
  });

  it('escreve na coluna propria, nunca em foto_url', async () => {
    const uc = await montar(repo, arm);
    await uc.subir('p-1', PNG);

    // `definirFotoArquivo` toca uma coluna so — e o que impede a sincronizacao
    // do ERP de levar a foto junto.
    expect(repo.definirFotoArquivo).toHaveBeenCalledWith('p-1', 'produtos/CO26185/novo.png');
  });

  it('apaga a foto anterior ao trocar, e SO DEPOIS de gravar a linha', async () => {
    repo.findById.mockResolvedValue(produto({ fotoArquivoId: 'produtos/CO26185/velho.png' }));
    const ordem: string[] = [];
    repo.definirFotoArquivo.mockImplementation(async () => void ordem.push('banco'));
    arm.remover.mockImplementation(async () => void ordem.push('apagou'));

    const uc = await montar(repo, arm);
    await uc.subir('p-1', PNG);

    // Invertida, uma falha do banco deixaria a linha apontando para um arquivo
    // ja apagado. Nesta ordem, o pior caso e um orfao no bucket.
    expect(ordem).toEqual(['banco', 'apagou']);
    expect(arm.remover).toHaveBeenCalledWith('produtos/CO26185/velho.png');
  });

  it('remover limpa a coluna e apaga o arquivo', async () => {
    repo.findById.mockResolvedValue(produto({ fotoArquivoId: 'produtos/CO26185/x.png' }));
    const uc = await montar(repo, arm);

    await expect(uc.remover('p-1')).resolves.toEqual({ fotoArquivoId: null, caminho: null });
    expect(repo.definirFotoArquivo).toHaveBeenCalledWith('p-1', null);
    expect(arm.remover).toHaveBeenCalledWith('produtos/CO26185/x.png');
  });

  it('remover nao apaga nada quando a peca so tinha a foto do ERP', async () => {
    const uc = await montar(repo, arm);
    await uc.remover('p-1');

    expect(repo.definirFotoArquivo).not.toHaveBeenCalled();
    expect(arm.remover).not.toHaveBeenCalled();
  });

  it('recusa formato que nao seja imagem', async () => {
    const uc = await montar(repo, arm);
    await expect(
      uc.subir('p-1', { ...PNG, mimetype: 'application/pdf' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(arm.guardar).not.toHaveBeenCalled();
  });

  it('recusa arquivo acima do teto', async () => {
    const uc = await montar(repo, arm);
    await expect(
      uc.subir('p-1', { ...PNG, size: 13 * 1024 * 1024 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa envio sem arquivo', async () => {
    const uc = await montar(repo, arm);
    await expect(uc.subir('p-1', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 quando a peca nao existe — e antes de gravar qualquer byte', async () => {
    repo.findById.mockResolvedValue(null);
    const uc = await montar(repo, arm);

    await expect(uc.subir('p-1', PNG)).rejects.toBeInstanceOf(NotFoundException);
    expect(arm.guardar).not.toHaveBeenCalled();
  });
});
