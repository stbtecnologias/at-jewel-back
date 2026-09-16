import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AjustarCatalogoUseCase } from './ajustar-catalogo.use-case';

/**
 * O CASO DE USO DO AJUSTE — 16/09/2026.
 *
 * O que estes testes protegem:
 *   - interpretar NÃO gera nem grava nada;
 *   - versão sem plano (montada antes) e versão do marketing são recusadas
 *     com o motivo;
 *   - aplicar reaproveita as imagens que não foram pedidas, gera só as
 *     pedidas, e grava VERSÃO NOVA;
 *   - geração que falha não grava versão pela metade.
 */
describe('AjustarCatalogoUseCase', () => {
  const PDF = 'catalogo/0004/finais/abc.pdf';
  const PLANO = {
    versao: 1,
    formato: '9:16',
    direcao: {
      cena: 'praia',
      modelo: 'uma mulher elegante',
      paleta: { fundo: '#ffffff', destaque: '#b8912f', texto: '#1a1a1a' },
      frase: 'Dias de sol',
    },
    paginas: [
      { tipo: 'capa' },
      { tipo: 'modelo', fotoId: 'an1' },
      { tipo: 'grade', fotoIds: ['co1'] },
      { tipo: 'contracapa' },
    ],
    arquivos: {
      capa: 'catalogo/0004/finais/abc.capa.jpg',
      fundo: 'catalogo/0004/finais/abc.fundo.jpg',
      'modelo:an1': 'catalogo/0004/finais/abc.modelo-an1.jpg',
    },
  };
  const FOTO = (id: string, codigo: string) => ({
    id,
    codigoErp: codigo,
    descricao: `PECA ${codigo}`,
    status: 'APROVADA',
    arquivoId: `catalogo/0004/fotos/${id}.png`,
  });
  const CATALOGO = (finais: unknown[]) => ({
    id: 'cat-4',
    numero: '0004',
    nome: 'Holiday',
    tema: null,
    formato: '9:16',
    fotos: [FOTO('an1', 'AN1'), FOTO('co1', 'CO1')],
    finais,
  });
  const FINAL_IA = { id: 'fin-1', origem: 'IA', arquivoId: PDF };

  let repo: { buscarPorId: jest.Mock };
  let armazenamento: { ler: jest.Mock };
  let ia: { ambientar: jest.Mock; gerarArte: jest.Mock };
  let interpretador: { disponivel: jest.Mock; interpretar: jest.Mock };
  let montar: { carregarPecas: jest.Mock; montarDoPlano: jest.Mock };
  let useCase: AjustarCatalogoUseCase;

  beforeEach(() => {
    repo = { buscarPorId: jest.fn().mockResolvedValue(CATALOGO([FINAL_IA])) };
    armazenamento = {
      ler: jest.fn((chave: string) =>
        Promise.resolve(
          chave.endsWith('.plano.json')
            ? {
                conteudo: Buffer.from(JSON.stringify(PLANO)),
                mime: 'application/json',
              }
            : { conteudo: Buffer.from(`img:${chave}`), mime: 'image/jpeg' },
        ),
      ),
    };
    ia = {
      ambientar: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('nova'),
        mime: 'image/jpeg',
      }),
      gerarArte: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('arte'),
        mime: 'image/jpeg',
      }),
    };
    interpretador = {
      disponivel: jest.fn(() => true),
      interpretar: jest.fn().mockResolvedValue({
        acoes: [{ tipo: 'refazer_modelo', pagina: 2, instrucao: 'sorrindo' }],
        nao_entendi: [],
      }),
    };
    montar = {
      carregarPecas: jest.fn((fotos: { id: string; descricao: string }[]) =>
        Promise.resolve(
          fotos.map((foto) => ({
            foto,
            imagem: Buffer.from(`pack:${foto.id}`),
            mime: 'image/png',
          })),
        ),
      ),
      montarDoPlano: jest.fn().mockResolvedValue({ id: 'cat-4' }),
    };
    useCase = new AjustarCatalogoUseCase(
      repo as never,
      armazenamento as never,
      ia as never,
      interpretador,
      montar as never,
    );
  });

  describe('interpretar', () => {
    it('devolve o que entendeu, sobre a versão mais nova — sem gerar nem gravar', async () => {
      const r = await useCase.interpretar('cat-4', 'na página 2, sorrindo');

      expect(r.finalId).toBe('fin-1');
      expect(r.acoes[0].descricao).toBe(
        'Página 2: refazer a foto da modelo — sorrindo',
      );
      const [resumo] = interpretador.interpretar.mock.calls[0] as [string];
      expect(resumo).toContain('Página 2 — MODELO usando AN1');
      expect(ia.ambientar).not.toHaveBeenCalled();
      expect(montar.montarDoPlano).not.toHaveBeenCalled();
    });

    it('versão montada antes do plano existir é recusada com o caminho', async () => {
      armazenamento.ler.mockResolvedValue(null);

      await expect(useCase.interpretar('cat-4', 'x y z')).rejects.toThrow(
        'Monte de novo',
      );
    });

    it('versão enviada pelo marketing não se ajusta por aqui', async () => {
      repo.buscarPorId.mockResolvedValue(
        CATALOGO([{ id: 'fin-m', origem: 'MARKETING', arquivoId: 'a.pdf' }]),
      );

      await expect(
        useCase.interpretar('cat-4', 'x y z', 'fin-m'),
      ).rejects.toThrow(BadRequestException);
    });

    it('sem catálogo montado, pede para montar', async () => {
      repo.buscarPorId.mockResolvedValue(CATALOGO([]));

      await expect(useCase.interpretar('cat-4', 'x y z')).rejects.toThrow(
        'Monte o catálogo',
      );
    });

    it('provedor fora do ar vira 503, e não "não entendi nada"', async () => {
      interpretador.interpretar.mockResolvedValue(null);

      await expect(useCase.interpretar('cat-4', 'x y z')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('aplicar', () => {
    it('gera SÓ a foto pedida, reaproveita capa e fundo, e grava versão nova', async () => {
      await useCase.aplicar('cat-4', 'fin-1', [
        { tipo: 'refazer_modelo', fotoId: 'an1', instrucao: 'sorrindo' },
      ]);

      expect(ia.ambientar).toHaveBeenCalledTimes(1);
      expect(ia.ambientar).toHaveBeenCalledWith(
        expect.objectContaining({ pedido: 'sorrindo', cena: 'praia' }),
      );
      expect(ia.gerarArte).not.toHaveBeenCalled();

      const [, plano, , imagens] = montar.montarDoPlano.mock.calls[0] as [
        unknown,
        { paginas: unknown[] },
        unknown,
        Map<string, { conteudo: Buffer }>,
      ];
      expect(plano.paginas).toEqual(PLANO.paginas);
      expect(imagens.get('modelo:an1')?.conteudo.toString()).toBe('nova');
      expect(imagens.get('capa')?.conteudo.toString()).toBe(
        'img:catalogo/0004/finais/abc.capa.jpg',
      );
    });

    it('sem geração pedida, não chama a OpenAI', async () => {
      await useCase.aplicar('cat-4', 'fin-1', [
        { tipo: 'trocar_frase', frase: 'Verão sem fim' },
      ]);

      expect(ia.ambientar).not.toHaveBeenCalled();
      expect(ia.gerarArte).not.toHaveBeenCalled();
      const [, plano] = montar.montarDoPlano.mock.calls[0] as [
        unknown,
        { direcao: { frase: string } },
      ];
      expect(plano.direcao.frase).toBe('Verão sem fim');
    });

    it('geração que falha NÃO grava versão pela metade', async () => {
      ia.ambientar.mockResolvedValue(null);

      await expect(
        useCase.aplicar('cat-4', 'fin-1', [
          { tipo: 'refazer_modelo', fotoId: 'an1', instrucao: 'sorrindo' },
          { tipo: 'trocar_frase', frase: 'Verão sem fim' },
        ]),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(montar.montarDoPlano).not.toHaveBeenCalled();
    });

    it('ação que não confere com a versão é recusada inteira', async () => {
      await expect(
        useCase.aplicar('cat-4', 'fin-1', [
          { tipo: 'tirar_peca', fotoId: 'de-outro-catalogo' },
        ]),
      ).rejects.toThrow(BadRequestException);
      expect(montar.montarDoPlano).not.toHaveBeenCalled();
    });
  });
});
