import { NotFoundException } from '@nestjs/common';
import { CurarFotoUseCase } from './catalogos.use-cases';

/**
 * A CURADORIA — tirar a peca desta edicao sem apagar nada.
 *
 * O que estes testes protegem e a DEDUCAO DO ESTADO ANTERIOR. Devolver uma
 * foto ao catalogo tem de recolocar cada uma no lugar de onde saiu: a que ja
 * tinha o sim de quem fotografou volta aprovada; a que ainda esperava volta
 * esperando. Errar aqui faria uma foto nunca aprovada entrar no catalogo pela
 * porta dos fundos — exatamente o que a separacao de papeis existe para
 * impedir.
 */
describe('CurarFotoUseCase', () => {
  const CATALOGO = 'cat-1';

  const FOTO = (extra: Record<string, unknown>) => ({
    id: 'f-1',
    catalogoId: CATALOGO,
    posicao: 1,
    codigoErp: 'BR26252',
    descricao: null,
    precoAVista: null,
    parcelas: null,
    origem: 'WHATSAPP',
    remetente: 'Faby Rocha',
    arquivoOriginalId: 'catalogo/0001/originais/a.jpg',
    arquivoId: 'catalogo/0001/originais/a.jpg',
    status: 'RECEBIDA',
    versoes: 0,
    aprovadoPor: null,
    aprovadoEm: null,
    ...extra,
  });

  let repo: { buscarFotoPorId: jest.Mock; atualizarFoto: jest.Mock };
  let useCase: CurarFotoUseCase;

  beforeEach(() => {
    repo = {
      buscarFotoPorId: jest.fn(),
      atualizarFoto: jest.fn((id: string, dados: unknown) => ({ id, ...(dados as object) })),
    };
    useCase = new CurarFotoUseCase(repo as never);
  });

  it('tirar marca REPROVADA — e nao apaga nada', async () => {
    repo.buscarFotoPorId.mockResolvedValue(FOTO({ status: 'APROVADA' }));

    await useCase.tirar(CATALOGO, 'f-1');

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', {
      status: 'REPROVADA',
    });
  });

  it('devolver recoloca a APROVADA como aprovada', async () => {
    repo.buscarFotoPorId.mockResolvedValue(
      FOTO({
        status: 'REPROVADA',
        aprovadoPor: 'Faby Rocha',
        aprovadoEm: new Date('2026-08-31T13:40:00Z'),
        arquivoId: 'catalogo/0001/fotos/a.png',
        versoes: 1,
      }),
    );

    await useCase.devolver(CATALOGO, 'f-1');

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', {
      status: 'APROVADA',
    });
  });

  it('devolver a que a IA tratou mas ninguem aprovou volta a ESPERAR', async () => {
    // A invariante do describe: sem `aprovadoEm`, nao vira APROVADA nunca.
    repo.buscarFotoPorId.mockResolvedValue(
      FOTO({
        status: 'REPROVADA',
        arquivoId: 'catalogo/0001/fotos/a.png',
        versoes: 1,
      }),
    );

    await useCase.devolver(CATALOGO, 'f-1');

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', {
      status: 'EM_APROVACAO',
    });
  });

  it('devolver a que nunca foi tratada volta para RECEBIDA', async () => {
    // Tratada e original sao o MESMO arquivo: a IA nunca rodou.
    repo.buscarFotoPorId.mockResolvedValue(FOTO({ status: 'REPROVADA' }));

    await useCase.devolver(CATALOGO, 'f-1');

    expect(repo.atualizarFoto).toHaveBeenCalledWith('f-1', {
      status: 'RECEBIDA',
    });
  });

  it('foto de outro catalogo nao e alcancavel pelo id da rota', async () => {
    repo.buscarFotoPorId.mockResolvedValue(FOTO({ catalogoId: 'outro' }));

    await expect(useCase.tirar(CATALOGO, 'f-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.atualizarFoto).not.toHaveBeenCalled();
  });

  it('tirar duas vezes nao mexe de novo', async () => {
    repo.buscarFotoPorId.mockResolvedValue(FOTO({ status: 'REPROVADA' }));

    await useCase.tirar(CATALOGO, 'f-1');

    expect(repo.atualizarFoto).not.toHaveBeenCalled();
  });

  it('devolver o que nao foi tirado nao mexe', async () => {
    repo.buscarFotoPorId.mockResolvedValue(FOTO({ status: 'APROVADA' }));

    await useCase.devolver(CATALOGO, 'f-1');

    expect(repo.atualizarFoto).not.toHaveBeenCalled();
  });
});
