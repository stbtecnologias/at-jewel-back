import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AprovarCatalogoUseCase,
  recusarSeAprovado,
} from './aprovar-catalogo.use-case';

/**
 * A APROVAÇÃO DO CATÁLOGO — 17/09/2026.
 *
 * O que estes testes protegem:
 *   - só a versão ATUAL se aprova, e a que a pessoa viu;
 *   - a capa é a arte do plano; sem arte, a primeira peça DO PDF; sem plano,
 *     a primeira aprovada;
 *   - desfazer só existe para catálogo aprovado;
 *   - a trava recusa catálogo PUBLICADO.
 */
describe('AprovarCatalogoUseCase', () => {
  const PDF = 'catalogo/0004/finais/abc.pdf';
  const FOTO = (id: string) => ({
    id,
    status: 'APROVADA',
    arquivoId: `catalogo/0004/fotos/${id}.png`,
  });
  const CATALOGO = (extra: Record<string, unknown> = {}) => ({
    id: 'cat-4',
    status: 'COLETANDO',
    fotos: [FOTO('an1'), FOTO('co1')],
    finais: [
      { id: 'fin-2', origem: 'IA', arquivoId: PDF },
      {
        id: 'fin-1',
        origem: 'IA',
        arquivoId: 'catalogo/0004/finais/velho.pdf',
      },
    ],
    ...extra,
  });
  const PLANO = (arquivos: Record<string, string>, fotoIds = ['co1']) => ({
    conteudo: Buffer.from(
      JSON.stringify({
        versao: 1,
        paginas: [
          { tipo: 'capa' },
          { tipo: 'grade', fotoIds },
          { tipo: 'contracapa' },
        ],
        arquivos,
      }),
    ),
    mime: 'application/json',
  });
  const QUEM = { userId: 'u-1', email: 'lucas@x.com' };

  let repo: {
    buscarPorId: jest.Mock;
    registrarAprovacao: jest.Mock;
    buscarNomeUsuario: jest.Mock;
  };
  let armazenamento: { ler: jest.Mock };
  let useCase: AprovarCatalogoUseCase;

  beforeEach(() => {
    repo = {
      buscarPorId: jest.fn().mockResolvedValue(CATALOGO()),
      registrarAprovacao: jest.fn().mockResolvedValue({ id: 'cat-4' }),
      buscarNomeUsuario: jest.fn().mockResolvedValue('Lucas Barbosa'),
    };
    armazenamento = {
      ler: jest
        .fn()
        .mockResolvedValue(
          PLANO({ capa: 'catalogo/0004/finais/abc.capa.jpg' }),
        ),
    };
    useCase = new AprovarCatalogoUseCase(repo as never, armazenamento as never);
  });

  it('com tema: a ARTE da capa vira a capa do catálogo, e grava quem aprovou', async () => {
    await useCase.aprovar('cat-4', 'fin-2', QUEM);

    expect(armazenamento.ler).toHaveBeenCalledWith(
      'catalogo/0004/finais/abc.plano.json',
    );
    expect(repo.registrarAprovacao).toHaveBeenCalledWith('cat-4', {
      finalId: 'fin-2',
      capaArquivoId: 'catalogo/0004/finais/abc.capa.jpg',
      aprovadoPor: 'Lucas Barbosa',
    });
  });

  it('sem arte: a primeira peça QUE ESTÁ NO PDF, e não a primeira aprovada', async () => {
    // O anel saiu no ajuste ("tira o anel"); o PDF só tem o colar.
    armazenamento.ler.mockResolvedValue(PLANO({}, ['co1']));

    await useCase.aprovar('cat-4', 'fin-2', QUEM);

    expect(repo.registrarAprovacao).toHaveBeenCalledWith(
      'cat-4',
      expect.objectContaining({ capaArquivoId: 'catalogo/0004/fotos/co1.png' }),
    );
  });

  it('PDF do marketing: a primeira peça aprovada, sem abrir plano', async () => {
    repo.buscarPorId.mockResolvedValue(
      CATALOGO({
        finais: [{ id: 'fin-m', origem: 'MARKETING', arquivoId: 'a.pdf' }],
      }),
    );

    await useCase.aprovar('cat-4', 'fin-m', QUEM);

    expect(armazenamento.ler).not.toHaveBeenCalled();
    expect(repo.registrarAprovacao).toHaveBeenCalledWith(
      'cat-4',
      expect.objectContaining({ capaArquivoId: 'catalogo/0004/fotos/an1.png' }),
    );
  });

  it('plano ilegível não impede aprovar — cai na primeira peça', async () => {
    armazenamento.ler.mockRejectedValue(new Error('S3 fora'));

    await useCase.aprovar('cat-4', 'fin-2', QUEM);

    expect(repo.registrarAprovacao).toHaveBeenCalledWith(
      'cat-4',
      expect.objectContaining({ capaArquivoId: 'catalogo/0004/fotos/an1.png' }),
    );
  });

  it('sem nome cadastrado, fica o e-mail do token', async () => {
    repo.buscarNomeUsuario.mockResolvedValue(null);

    await useCase.aprovar('cat-4', 'fin-2', QUEM);

    expect(repo.registrarAprovacao).toHaveBeenCalledWith(
      'cat-4',
      expect.objectContaining({ aprovadoPor: 'lucas@x.com' }),
    );
  });

  it('versão que já não é a atual é recusada — aprovar o que não se viu', async () => {
    await expect(useCase.aprovar('cat-4', 'fin-1', QUEM)).rejects.toThrow(
      ConflictException,
    );
    expect(repo.registrarAprovacao).not.toHaveBeenCalled();
  });

  it('sem versão nenhuma, pede para montar', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO({ finais: [] }));

    await expect(useCase.aprovar('cat-4', 'x', QUEM)).rejects.toThrow(
      'Monte ou envie',
    );
  });

  it('já aprovado não se aprova de novo', async () => {
    repo.buscarPorId.mockResolvedValue(CATALOGO({ status: 'PUBLICADO' }));

    await expect(useCase.aprovar('cat-4', 'fin-2', QUEM)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('desfazer: só catálogo aprovado, e grava a aprovação nula', async () => {
    await expect(useCase.desfazer('cat-4')).rejects.toThrow(
      'não está aprovado',
    );

    repo.buscarPorId.mockResolvedValue(CATALOGO({ status: 'PUBLICADO' }));
    await useCase.desfazer('cat-4');
    expect(repo.registrarAprovacao).toHaveBeenCalledWith('cat-4', null);
  });

  it('a trava recusa catálogo PUBLICADO e deixa passar os outros', () => {
    expect(() => recusarSeAprovado({ status: 'PUBLICADO' } as never)).toThrow(
      'desfaça a aprovação',
    );
    expect(() =>
      recusarSeAprovado({ status: 'COLETANDO' } as never),
    ).not.toThrow();
  });
});
