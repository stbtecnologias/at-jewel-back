import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FotosDaPecaUseCase } from './fotos-da-peca.use-case';
import { MAX_FOTOS_POR_PECA } from '../../../catalogos/domain/ports/armazenamento.port';

/**
 * ============================================================================
 * AS FOTOS DA PEÇA — RF33, 20/10/2026.
 *
 * Pedido do Lucas: a peça passa a ter mais de uma foto, enviadas pelo painel
 * ou pelo WhatsApp, com uma delas marcada como capa.
 *
 * O QUE ESTE ARQUIVO PROTEGE É O CONTORNO: o teto por peça, a recusa que não
 * derruba a rajada inteira, e o arquivo que só sai do disco quando mais
 * ninguém o usa.
 *
 * O QUE ELE NÃO PROVA são as garantias que moram no BANCO — uma capa por peça
 * e a mesma imagem não entrando duas vezes na mesma peça. Essas são índices
 * (`idx_produto_fotos_uma_capa`, `idx_produto_fotos_sem_repetir`), foram
 * provadas contra o Postgres de verdade em 20/10, dentro de transação, e um
 * mock não as reproduziria — reproduziria a minha ideia delas.
 * ============================================================================
 */
describe('as fotos da peça', () => {
  const PECA = 'p-1';
  const arquivo = (nome: string, size = 1_000, mimetype = 'image/jpeg') =>
    ({ buffer: Buffer.from('x'), mimetype, originalname: nome, size }) as never;

  let produtos: { findById: jest.Mock };
  let fotos: {
    listar: jest.Mock;
    buscarPorId: jest.Mock;
    adicionar: jest.Mock;
    definirCapa: jest.Mock;
    remover: jest.Mock;
    contar: jest.Mock;
    capasDe: jest.Mock;
  };
  let armazenamento: {
    guardar: jest.Mock;
    remover: jest.Mock;
    caminhoPublico: jest.Mock;
  };
  let useCase: FotosDaPecaUseCase;

  beforeEach(() => {
    produtos = {
      findById: jest.fn().mockResolvedValue({ id: PECA, codigoErp: 'BR26396' }),
    };
    let n = 0;
    fotos = {
      listar: jest.fn().mockResolvedValue([]),
      buscarPorId: jest.fn().mockResolvedValue(null),
      adicionar: jest.fn().mockImplementation((nova: { arquivoId: string }) =>
        Promise.resolve({
          id: `f-${++n}`,
          produtoId: PECA,
          arquivoId: nova.arquivoId,
          mime: 'image/jpeg',
          bytes: 1000,
          capa: n === 1,
          posicao: n - 1,
          origem: 'PAINEL',
          enviadoPor: null,
          criadoEm: new Date(),
        }),
      ),
      definirCapa: jest.fn().mockResolvedValue(undefined),
      remover: jest.fn(),
      contar: jest.fn().mockResolvedValue(0),
      capasDe: jest.fn(),
    };
    armazenamento = {
      guardar: jest
        .fn()
        .mockImplementation((_a, pasta: string) =>
          Promise.resolve(`${pasta}/${Math.random().toString(16).slice(2)}.jpg`),
        ),
      remover: jest.fn().mockResolvedValue(undefined),
      caminhoPublico: jest.fn((chave: string) => `/midia/${chave}`),
    };

    useCase = new FotosDaPecaUseCase(
      produtos as never,
      fotos as never,
      armazenamento as never,
    );
  });

  describe('mandar fotos', () => {
    it('guarda a rajada inteira, na pasta da PEÇA', async () => {
      const r = await useCase.adicionar(
        PECA,
        [arquivo('a.jpg'), arquivo('b.jpg'), arquivo('c.jpg')],
        'Yerlon',
        'PAINEL',
      );

      expect(r.guardadas).toHaveLength(3);
      expect(r.recusadas).toHaveLength(0);
      expect(r.total).toBe(3);
      // A pasta sai do CÓDIGO, não do id: é a chave estável da peça.
      expect(armazenamento.guardar).toHaveBeenCalledWith(
        expect.anything(),
        'produtos/BR26396',
      );
    });

    it('a PRIMEIRA da peça nasce capa', async () => {
      const r = await useCase.adicionar(PECA, [arquivo('a.jpg')], null, 'PAINEL');

      expect(r.guardadas[0].capa).toBe(true);
    });

    /* ESTE É O TESTE: uma foto ruim não pode derrubar as outras nove. */
    it('a recusa NÃO derruba a rajada — e diz qual caiu e por quê', async () => {
      const r = await useCase.adicionar(
        PECA,
        [
          arquivo('boa.jpg'),
          arquivo('gigante.jpg', 20 * 1024 * 1024),
          arquivo('planilha.xlsx', 1000, 'application/vnd.ms-excel'),
          arquivo('outra.jpg'),
        ],
        null,
        'PAINEL',
      );

      expect(r.guardadas).toHaveLength(2);
      expect(r.recusadas).toHaveLength(2);
      expect(r.recusadas[0].nome).toBe('gigante.jpg');
      expect(r.recusadas[0].motivo).toContain('16 MB');
      expect(r.recusadas[1].motivo).toContain('formato');
    });

    it('o teto por peça SE ANUNCIA, em vez de sumir com a foto', async () => {
      fotos.contar.mockResolvedValue(MAX_FOTOS_POR_PECA - 1);

      const r = await useCase.adicionar(
        PECA,
        [arquivo('a.jpg'), arquivo('b.jpg')],
        null,
        'WHATSAPP',
      );

      expect(r.guardadas).toHaveLength(1);
      expect(r.recusadas[0].motivo).toContain(`máximo de ${MAX_FOTOS_POR_PECA}`);
      expect(r.total).toBe(MAX_FOTOS_POR_PECA);
    });

    it('sem arquivo nenhum, recusa', async () => {
      await expect(
        useCase.adicionar(PECA, [], null, 'PAINEL'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('peça que não existe não guarda nada', async () => {
      produtos.findById.mockResolvedValue(null);

      await expect(
        useCase.adicionar(PECA, [arquivo('a.jpg')], null, 'PAINEL'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(armazenamento.guardar).not.toHaveBeenCalled();
    });
  });

  describe('a capa', () => {
    it('só troca para foto DESTA peça', async () => {
      fotos.buscarPorId.mockResolvedValue({ id: 'f-9', produtoId: 'OUTRA' });

      await expect(
        useCase.definirCapa(PECA, 'f-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fotos.definirCapa).not.toHaveBeenCalled();
    });
  });

  describe('excluir', () => {
    /* ESTE É O TESTE: a mesma imagem pode estar em outra peça — o RF34. */
    it('NÃO apaga o arquivo enquanto outra peça o usa', async () => {
      fotos.buscarPorId.mockResolvedValue({ id: 'f-1', produtoId: PECA });
      fotos.remover.mockResolvedValue({
        arquivoId: 'produtos/BR26396/a.jpg',
        aindaUsado: true,
      });

      await useCase.excluir(PECA, 'f-1');

      expect(armazenamento.remover).not.toHaveBeenCalled();
    });

    it('apaga o arquivo quando ninguém mais aponta para ele', async () => {
      fotos.buscarPorId.mockResolvedValue({ id: 'f-1', produtoId: PECA });
      fotos.remover.mockResolvedValue({
        arquivoId: 'produtos/BR26396/a.jpg',
        aindaUsado: false,
      });

      await useCase.excluir(PECA, 'f-1');

      expect(armazenamento.remover).toHaveBeenCalledWith(
        'produtos/BR26396/a.jpg',
      );
    });

    it('foto de outra peça não se apaga por aqui', async () => {
      fotos.buscarPorId.mockResolvedValue({ id: 'f-1', produtoId: 'OUTRA' });

      await expect(
        useCase.excluir(PECA, 'f-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(fotos.remover).not.toHaveBeenCalled();
    });
  });
});
