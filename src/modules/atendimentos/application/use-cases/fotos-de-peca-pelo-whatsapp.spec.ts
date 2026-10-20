import { FotosDePecaPeloWhatsappUseCase } from './fotos-de-peca-pelo-whatsapp.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';

/**
 * ============================================================================
 * AS FOTOS DA PEÇA PELO WHATSAPP — RF33, 20/10/2026.
 *
 * Pedido do Lucas: *"ela pode dizer: produto ou código tal — aí enviar 10
 * fotos de uma vez, e coloca dentro do produto."*
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *
 * 1. O DESTINO VIVE FORA DA FOTO. O WhatsApp não manda álbum: dez imagens são
 *    dez eventos, e só a primeira costuma trazer legenda. Se o destino
 *    dependesse da legenda, nove cairiam no catálogo — caladas.
 *
 * 2. SEM PEÇA MIRADA, A IMAGEM NÃO É DAQUI. O `foto()` devolve `null` e ela
 *    segue para o catálogo, como sempre foi.
 *
 * 3. O COMANDO NÃO ROUBA A CONSULTA. "quanto custa o BR26396?" é pergunta de
 *    preço e continua sendo da agente.
 * ============================================================================
 */
describe('as fotos da peça pelo WhatsApp', () => {
  const DE = '558586467241@c.us';
  const QUEM = 'Yerlon Magalhães';
  const PECA = {
    id: 'p-1',
    codigoErp: 'BR26396',
    descricaoEtiqueta: 'BRINCO DTS 0.25 CTS OB 18K',
  };
  const IMAGEM = { url: 'http://waha/files/a.jpg', mimetype: 'image/jpeg' };

  let produtos: { findByCodigoErp: jest.Mock };
  let fotos: { listar: jest.Mock; adicionar: jest.Mock };
  let whatsapp: { baixarMidia: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: FotosDePecaPeloWhatsappUseCase;

  const mandarFoto = () =>
    useCase.foto({ de: DE, nomeRemetente: QUEM, legenda: '', imagem: IMAGEM });

  beforeEach(() => {
    produtos = { findByCodigoErp: jest.fn().mockResolvedValue(PECA) };
    let n = 0;
    fotos = {
      listar: jest.fn().mockResolvedValue([]),
      adicionar: jest.fn().mockImplementation(() =>
        Promise.resolve({
          guardadas: [{ id: `f-${++n}`, capa: n === 1 }],
          recusadas: [],
          total: n,
        }),
      ),
    };
    whatsapp = {
      baixarMidia: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('jpeg'),
        mimetype: 'image/jpeg',
      }),
    };
    sessao = new SessaoCatalogoService();

    useCase = new FotosDePecaPeloWhatsappUseCase(
      sessao,
      fotos as never,
      produtos as never,
      whatsapp as never,
    );
  });

  describe('mirar a peça', () => {
    it.each([
      'produto BR26396',
      'Produto: BR26396',
      'fotos do produto BR26396',
      'manda as fotos para a peça BR26396',
      'peca BR26396',
      'ref BR26396',
    ])('reconhece "%s"', async (texto) => {
      const r = await useCase.mirar(DE, texto);

      expect(r?.motivo).toBe('peca_mirada');
      expect(useCase.temPecaMirada(DE)).toBe(true);
    });

    it('a resposta diz a PEÇA e quantas fotos ela já tem', async () => {
      fotos.listar.mockResolvedValue([{ id: 'x' }, { id: 'y' }]);

      const r = await useCase.mirar(DE, 'produto BR26396');

      expect(r?.resposta).toContain('BR26396');
      expect(r?.resposta).toContain('BRINCO DTS');
      expect(r?.resposta).toContain('2 fotos');
    });

    /* ESTE É O TESTE: a pergunta de preço não pode virar comando. */
    it.each([
      'quanto custa o BR26396?',
      'tem o BR26396 em estoque?',
      'BR26396',
      'bom dia',
      'quantas peças vendemos hoje?',
    ])('NÃO é comando: "%s"', async (texto) => {
      expect(FotosDePecaPeloWhatsappUseCase.pareceComando(texto)).toBe(false);
      expect(await useCase.mirar(DE, texto)).toBeNull();
      expect(useCase.temPecaMirada(DE)).toBe(false);
    });

    it('código que não existe NÃO mira nada — e a resposta diz qual era', async () => {
      produtos.findByCodigoErp.mockResolvedValue(null);

      const r = await useCase.mirar(DE, 'produto BR99999');

      expect(r?.motivo).toBe('peca_nao_encontrada');
      expect(r?.resposta).toContain('BR99999');
      expect(useCase.temPecaMirada(DE)).toBe(false);
    });

    it('"pronto" encerra — e só responde se havia algo mirado', async () => {
      expect(await useCase.mirar(DE, 'pronto')).toBeNull();

      await useCase.mirar(DE, 'produto BR26396');
      const r = await useCase.mirar(DE, 'pronto');

      expect(r?.motivo).toBe('peca_encerrada');
      expect(useCase.temPecaMirada(DE)).toBe(false);
    });

    it('mirar outra peça TROCA o destino, sem precisar encerrar', async () => {
      await useCase.mirar(DE, 'produto BR26396');
      produtos.findByCodigoErp.mockResolvedValue({ ...PECA, id: 'p-2', codigoErp: 'AN24435' });

      await useCase.mirar(DE, 'produto AN24435');
      await mandarFoto();

      expect(fotos.adicionar).toHaveBeenCalledWith(
        'p-2',
        expect.anything(),
        QUEM,
        'WHATSAPP',
      );
    });
  });

  describe('a foto que chega', () => {
    /* ESTE É O TESTE: sem peça mirada, a imagem é do catálogo. */
    it('sem peça mirada devolve null — e a imagem segue para o catálogo', async () => {
      expect(await mandarFoto()).toBeNull();
      expect(fotos.adicionar).not.toHaveBeenCalled();
    });

    it('com peça mirada vai para a PEÇA, marcada como WHATSAPP', async () => {
      await useCase.mirar(DE, 'produto BR26396');

      const r = await mandarFoto();

      expect(r?.motivo).toBe('foto_de_peca_guardada');
      expect(fotos.adicionar).toHaveBeenCalledWith(
        'p-1',
        expect.anything(),
        QUEM,
        'WHATSAPP',
      );
    });

    /* A RAJADA: uma mirada, N fotos. É o pedido literal do Lucas. */
    it('a rajada inteira vai para a mesma peça, e a contagem sobe', async () => {
      await useCase.mirar(DE, 'produto BR26396');

      const primeira = await mandarFoto();
      await mandarFoto();
      const terceira = await mandarFoto();

      expect(fotos.adicionar).toHaveBeenCalledTimes(3);
      expect(primeira?.resposta).toContain('Primeira foto');
      expect(primeira?.resposta).toContain('capa');
      expect(terceira?.resposta).toContain('3ª foto');
    });

    it('o que foi recusado é DITO, com o motivo', async () => {
      await useCase.mirar(DE, 'produto BR26396');
      fotos.adicionar.mockResolvedValue({
        guardadas: [],
        recusadas: [{ nome: 'a.jpg', motivo: 'acima de 16 MB' }],
        total: 0,
      });

      const r = await mandarFoto();

      expect(r?.motivo).toBe('foto_de_peca_recusada');
      expect(r?.resposta).toContain('16 MB');
    });

    it('download que falha NÃO perde a peça mirada', async () => {
      await useCase.mirar(DE, 'produto BR26396');
      whatsapp.baixarMidia.mockResolvedValue(null);

      const r = await mandarFoto();

      expect(r?.motivo).toBe('imagem_download_falhou');
      // A peça continua mirada: mandar de novo tem de funcionar sem repetir
      // o comando.
      expect(useCase.temPecaMirada(DE)).toBe(true);
    });

    it('falha ao guardar não derruba a conversa', async () => {
      await useCase.mirar(DE, 'produto BR26396');
      fotos.adicionar.mockRejectedValue(new Error('S3 fora'));

      const r = await mandarFoto();

      expect(r?.motivo).toBe('foto_de_peca_falhou');
      expect(r?.resposta).toContain('BR26396');
    });
  });
});
