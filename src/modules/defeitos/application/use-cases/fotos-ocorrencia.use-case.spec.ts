import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ARMAZENAMENTO } from '../../../catalogos/domain/ports/injection-tokens';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import { FotosOcorrenciaUseCase } from './fotos-ocorrencia.use-case';

const PNG = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'defeito.png', size: 1000 };

async function montar(repo: Record<string, jest.Mock>, arm: Record<string, jest.Mock>) {
  const mod = await Test.createTestingModule({
    providers: [
      FotosOcorrenciaUseCase,
      { provide: DEFEITO_REPOSITORY, useValue: repo },
      { provide: ARMAZENAMENTO, useValue: arm },
    ],
  }).compile();
  return mod.get(FotosOcorrenciaUseCase);
}

describe('FotosOcorrenciaUseCase', () => {
  let repo: Record<string, jest.Mock>;
  let arm: Record<string, jest.Mock>;

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn().mockResolvedValue({ id: 'oc-1' }),
      anexarFoto: jest.fn().mockImplementation((_, d) => Promise.resolve({ id: 'f-1', ...d })),
      removerFoto: jest.fn().mockResolvedValue('ocorrencias/oc-1/a.png'),
    };
    arm = {
      guardar: jest.fn().mockResolvedValue('ocorrencias/oc-1/a.png'),
      remover: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('guarda na pasta da OCORRÊNCIA, e não na da peça', async () => {
    const uc = await montar(repo, arm);
    await uc.anexar('oc-1', [PNG]);

    // A mesma peça pode voltar três vezes, e as fotos de cada volta contam
    // histórias diferentes. Por episódio, não por peça.
    expect(arm.guardar).toHaveBeenCalledWith(expect.anything(), 'ocorrencias/oc-1');
  });

  it('UM ARQUIVO RUIM NÃO DEIXA METADE GRAVADA', async () => {
    const uc = await montar(repo, arm);
    const lote = [PNG, { ...PNG, mimetype: 'application/pdf', originalname: 'nota.pdf' }];

    await expect(uc.anexar('oc-1', lote)).rejects.toBeInstanceOf(BadRequestException);
    expect(arm.guardar).not.toHaveBeenCalled();
    expect(repo.anexarFoto).not.toHaveBeenCalled();
  });

  it('SÓ IMAGEM — aqui não há peça de arte, há prova', async () => {
    const uc = await montar(repo, arm);
    // Diferente da referência de catálogo, que aceita PDF de gráfica.
    await expect(
      uc.anexar('oc-1', [{ ...PNG, mimetype: 'application/pdf' }]),
    ).rejects.toThrow(/JPEG, PNG ou WebP/);
  });

  it('o erro diz QUAL arquivo', async () => {
    const uc = await montar(repo, arm);
    await expect(
      uc.anexar('oc-1', [{ ...PNG, mimetype: 'application/zip', originalname: 'ruim.zip' }]),
    ).rejects.toThrow('ruim.zip');
  });

  it('recusa arquivo acima do teto', async () => {
    const uc = await montar(repo, arm);
    await expect(
      uc.anexar('oc-1', [{ ...PNG, size: 13 * 1024 * 1024 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa envio vazio', async () => {
    const uc = await montar(repo, arm);
    await expect(uc.anexar('oc-1', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 quando a ocorrência não existe — e antes de gravar byte nenhum', async () => {
    repo.buscarPorId.mockResolvedValue(null);
    const uc = await montar(repo, arm);

    await expect(uc.anexar('oc-1', [PNG])).rejects.toBeInstanceOf(NotFoundException);
    expect(arm.guardar).not.toHaveBeenCalled();
  });

  it('remover apaga a LINHA antes do arquivo', async () => {
    const ordem: string[] = [];
    repo.removerFoto.mockImplementation(async () => {
      ordem.push('banco');
      return 'ocorrencias/oc-1/a.png';
    });
    arm.remover.mockImplementation(async () => void ordem.push('arquivo'));

    const uc = await montar(repo, arm);
    await uc.remover('oc-1', 'f-1');

    // Invertida, uma falha do banco deixaria a linha apontando para um arquivo
    // já apagado. Nesta ordem, o pior caso é um órfão no bucket.
    expect(ordem).toEqual(['banco', 'arquivo']);
  });

  it('RECUSA APAGAR FOTO DE OUTRA OCORRÊNCIA', async () => {
    // O repositório põe o id da ocorrência na busca: foto de outra
    // simplesmente não é encontrada.
    repo.removerFoto.mockResolvedValue(null);
    const uc = await montar(repo, arm);

    await expect(uc.remover('oc-1', 'f-de-outra')).rejects.toBeInstanceOf(NotFoundException);
    expect(arm.remover).not.toHaveBeenCalled();
  });
});
