import {
  FotosDePecaPeloWhatsappUseCase,
  PERMISSAO_FOTO_DE_PECA,
} from './fotos-de-peca-pelo-whatsapp.use-case';
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
  let fotos: {
    listar: jest.Mock;
    adicionar: jest.Mock;
    anexarExistente: jest.Mock;
  };
  let whatsapp: { baixarMidia: jest.Mock };
  let imagens: { buscar: jest.Mock };
  /** O interpretador MUDO é o padrão: o atalho determinístico resolve. */
  let destino: { disponivel: jest.Mock; interpretar: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: FotosDePecaPeloWhatsappUseCase;

  const mandarFoto = () =>
    useCase.foto({ de: DE, nomeRemetente: QUEM, legenda: '', imagem: IMAGEM });

  beforeEach(() => {
    produtos = { findByCodigoErp: jest.fn().mockResolvedValue(PECA) };
    let n = 0;
    fotos = {
      anexarExistente: jest.fn().mockResolvedValue({ id: 'f-1' }),
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
    imagens = {
      buscar: jest
        .fn()
        .mockResolvedValue({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
    };
    destino = {
      disponivel: jest.fn(() => false),
      interpretar: jest.fn().mockResolvedValue(null),
    };
    sessao = new SessaoCatalogoService();

    useCase = new FotosDePecaPeloWhatsappUseCase(
      sessao,
      fotos as never,
      produtos as never,
      whatsapp as never,
      imagens as never,
      destino as never,
      { listarAbertos: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  /**
   * QUEM MANDA E QUEM VÊ — regra do Lucas, 20/10/2026.
   *
   * *"Quem pode enviar as fotos para o produto: todos menos as vendedoras.
   * Mas ela pode pedir as fotos das peças."*
   *
   * Medido na base no mesmo dia:
   *
   *   produtos:foto  → ADMIN, ESTOQUISTA, GERENTE, GERENTE_VENDAS, MARKETING
   *   produtos:read  → os mesmos **e** VENDEDORA
   *
   * E há uma segunda barreira, mais forte que a permissão: o caminho da foto
   * procura em `admin_users`, e nenhuma das 7 vendedoras tem conta de painel.
   *
   * ESTE TESTE GUARDA A PRIMEIRA. Permissão é dado, e dado muda — trocar a
   * constante por `produtos:read` ou `catalogo:write` abriria o envio para
   * quem não deve, sem quebrar mais nada.
   */
  it('mandar foto para a peça exige `produtos:foto` — a de VER é outra', () => {
    expect(PERMISSAO_FOTO_DE_PECA).toBe('produtos:foto');
    expect(PERMISSAO_FOTO_DE_PECA).not.toBe('produtos:read');
  });

  describe('mirar a peça', () => {
    it.each([
      'produto BR26396',
      'Produto: BR26396',
      'manda as fotos para a peça BR26396',
      'fotos no produto BR26396',
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

    /**
     * O FECHO NÃO PODE FECHAR PORTA QUE NÃO PRECISA — reparo do Lucas em
     * 20/10/2026, olhando o próprio teste.
     *
     * "voltam a ser do catálogo" sugeria que a conversa de peça tinha acabado.
     * Não acabou: a próxima foto pode ser de outra joia, e é só dizer qual.
     */
    it('o fecho oferece as DUAS saídas: catálogo ou outra peça', async () => {
      await useCase.mirar(DE, 'produto BR26396');

      const r = await useCase.mirar(DE, 'pronto');

      expect(r?.resposta).toContain('catálogo');
      expect(r?.resposta).toContain('outra peça');
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

  /**
   * "QUAIS FOTOS O PRODUTO BR26396 TEM?" — e elas vão junto.
   *
   * A DIFERENÇA PARA O MIRAR É A PREPOSIÇÃO, e é a que o português já faz:
   * "fotos DO produto X" pergunta, "fotos PARA a peça X" manda. Sem essa
   * regra, quem pede para ver abriria destino sem querer.
   */
  describe('pedir para ver as fotos', () => {
    const TRES = [
      { id: 'f-1', arquivoId: 'produtos/BR26396/a.jpg', capa: true },
      { id: 'f-2', arquivoId: 'produtos/BR26396/b.jpg', capa: false },
      { id: 'f-3', arquivoId: 'produtos/BR26396/c.jpg', capa: false },
    ];
    const baixadas = (n: number) => ({
      fotos: Array.from({ length: n }, (_, i) => ({
        codigo: `BR26396-${i + 1}`,
        legenda: 'x',
        conteudo: Buffer.from('jpeg'),
        mime: 'image/jpeg',
      })),
      tinhamUrl: n,
      cortadas: 0,
    });

    it.each([
      'quais fotos o produto BR26396 tem?',
      'quantas fotos tem a peça BR26396',
      'fotos do produto BR26396',
      'me manda as fotos da peça BR26396',
      'ver as fotos do produto BR26396',
    ])('reconhece "%s"', async (texto) => {
      fotos.listar.mockResolvedValue(TRES);
      imagens.buscar.mockResolvedValue(baixadas(3));

      const r = await useCase.quais(DE, texto);

      expect(r?.motivo).toBe('fotos_da_peca');
      expect(r?.fotos).toHaveLength(3);
    });

    /* ESTE É O TESTE: pedir para ver NÃO pode abrir destino. */
    it('ver NÃO mira — as próximas fotos continuam sendo do catálogo', async () => {
      fotos.listar.mockResolvedValue(TRES);
      imagens.buscar.mockResolvedValue(baixadas(3));

      await useCase.quais(DE, 'fotos do produto BR26396');

      expect(useCase.temPecaMirada(DE)).toBe(false);
    });

    it('as imagens vão em `fotos`, para saírem DEPOIS do texto', async () => {
      fotos.listar.mockResolvedValue(TRES);
      imagens.buscar.mockResolvedValue(baixadas(3));

      const r = await useCase.quais(DE, 'quais fotos tem o BR26396?');

      expect(r?.resposta).toContain('3 fotos');
      expect(r?.resposta).toContain('capa é a primeira');
      expect(r?.fotos).toHaveLength(3);
    });

    it('o que NÃO coube é dito — o recorte que esconde se anuncia', async () => {
      fotos.listar.mockResolvedValue(
        Array.from({ length: 14 }, (_, i) => ({
          id: `f-${i}`,
          arquivoId: `produtos/BR26396/${i}.jpg`,
          capa: i === 0,
        })),
      );
      imagens.buscar.mockResolvedValue(baixadas(10));

      const r = await useCase.quais(DE, 'quais fotos tem o BR26396?');

      expect(r?.resposta).toContain('14 fotos');
      expect(r?.resposta).toContain('as outras 4');
    });

    it('sem foto NOSSA, manda a do ERP — e diz que é dela', async () => {
      fotos.listar.mockResolvedValue([]);
      produtos.findByCodigoErp.mockResolvedValue({
        ...PECA,
        fotoUrl: 'http://conexa/x.jpg',
      });
      imagens.buscar.mockResolvedValue(baixadas(1));

      const r = await useCase.quais(DE, 'fotos do produto BR26396');

      expect(r?.motivo).toBe('fotos_da_peca_so_erp');
      expect(r?.resposta).toContain('do ERP');
      expect(r?.fotos).toHaveLength(1);
    });

    it('sem foto nenhuma, diz isso e ensina o caminho', async () => {
      fotos.listar.mockResolvedValue([]);
      imagens.buscar.mockResolvedValue(baixadas(0));

      const r = await useCase.quais(DE, 'fotos do produto BR26396');

      expect(r?.motivo).toBe('fotos_da_peca_nenhuma');
      expect(r?.resposta).toContain('"produto BR26396"');
    });

    it('peça que não existe não é comigo', async () => {
      produtos.findByCodigoErp.mockResolvedValue(null);

      expect(await useCase.quais(DE, 'fotos do produto BR99999')).toBeNull();
    });
  });

  /**
   * MANDAR A FOTO PRIMEIRO E DIZER DEPOIS — 20/10/2026.
   *
   * Teste do Lucas: ele pediu as fotos do BR26396, mandou uma imagem em
   * seguida, e a agente perguntou "de qual catálogo é?" — a única pergunta que
   * ela sabia fazer. A foto óbvia era a da peça, e a opção nem aparecia.
   */
  describe('"é da peça", com a foto já pendurada', () => {
    const PENDURADA = {
      arquivoId: 'catalogo/pendentes/a.jpg',
      mime: 'image/jpeg',
      codigoErp: null,
      parcelas: null,
    };

    beforeEach(async () => {
      fotos.listar.mockResolvedValue([]);
      imagens.buscar.mockResolvedValue({ fotos: [], tinhamUrl: 0, cortadas: 0 });
      // Falar da peça é o que coloca a opção na pergunta.
      await useCase.quais(DE, 'quais fotos tem o BR26396?');
      sessao.pendurar(DE, PENDURADA);
      fotos.anexarExistente = jest.fn().mockResolvedValue({ id: 'f-1' });
    });

    it.each(['peça', 'peca', 'é da peça', 'produto', 'no produto', 'BR26396'])(
      'reconhece "%s" e anexa na peça',
      async (texto) => {
        const r = await useCase.anexarPenduradas(DE, texto, QUEM);

        expect(r?.motivo).toBe('anexo_na_peca');
        expect(fotos.anexarExistente).toHaveBeenCalledWith(
          'p-1',
          'catalogo/pendentes/a.jpg',
          'image/jpeg',
          QUEM,
        );
      },
    );

    /* ESTE É O TESTE: quem mandou uma vai mandar as outras. */
    it('depois de anexar, a peça fica MIRADA', async () => {
      await useCase.anexarPenduradas(DE, 'peça', QUEM);

      expect(useCase.temPecaMirada(DE)).toBe(true);
    });

    it('"#0001" NÃO é resposta de peça — segue para o catálogo', async () => {
      expect(await useCase.anexarPenduradas(DE, '#0001', QUEM)).toBeNull();
    });

    /**
     * DEDUZIR, E NÃO EXIGIR A PALAVRA CERTA — decisão do Lucas em 20/10/2026.
     *
     * *"Não vamos deixar essa coisa padrão de peça, produto; você tem que
     * deduzir pelo que ela falar."* O atalho determinístico continua, mas é só
     * o caso óbvio resolvido de graça — o resto vai para o modelo.
     */
    it('"é daquele brinco que você mostrou" anexa, pelo modelo', async () => {
      destino.disponivel.mockReturnValue(true);
      destino.interpretar.mockResolvedValue({ destino: 'PECA', numero: null });

      const r = await useCase.anexarPenduradas(
        DE,
        'é daquele brinco que você me mostrou',
        QUEM,
      );

      expect(r?.motivo).toBe('anexo_na_peca');
      expect(destino.interpretar).toHaveBeenCalled();
    });

    it('o modelo dizendo CATALOGO não anexa — segue para o catálogo', async () => {
      destino.disponivel.mockReturnValue(true);
      destino.interpretar.mockResolvedValue({ destino: 'CATALOGO', numero: '0001' });

      expect(
        await useCase.anexarPenduradas(DE, 'manda pro under 25', QUEM),
      ).toBeNull();
      expect(fotos.anexarExistente).not.toHaveBeenCalled();
    });

    /* O retorno do modelo é VALIDADO, nunca convertido. */
    it.each([
      { destino: 'peca' },
      { destino: 'PECA ' },
      { outra: 'coisa' },
      'PECA',
      null,
    ])('retorno torto do modelo NÃO anexa: %p', async (cru) => {
      destino.disponivel.mockReturnValue(true);
      destino.interpretar.mockResolvedValue(cru);

      expect(
        await useCase.anexarPenduradas(DE, 'qualquer coisa', QUEM),
      ).toBeNull();
    });

    it('sem modelo disponível, o atalho ainda resolve o óbvio', async () => {
      destino.disponivel.mockReturnValue(false);

      const r = await useCase.anexarPenduradas(DE, 'peça', QUEM);

      expect(r?.motivo).toBe('anexo_na_peca');
      expect(destino.interpretar).not.toHaveBeenCalled();
    });

    it('sem foto pendurada não há o que anexar', async () => {
      sessao.recolherPendentes(DE);

      expect(await useCase.anexarPenduradas(DE, 'peça', QUEM)).toBeNull();
    });

    it('sem peça falada e sem código, a resposta não é comigo', async () => {
      sessao.esquecerPecaFalada(DE);

      expect(await useCase.anexarPenduradas(DE, 'peça', QUEM)).toBeNull();
    });

    /**
     * O RESTART NÃO PODE MATAR O RECURSO — 20/10/2026.
     *
     * A memória da sessão vive em RAM. O Lucas reiniciou o back, mandou a
     * foto e a pergunta voltou com uma opção só: do ponto de vista dele, o
     * recurso não existia. Estava "certo" e era inútil.
     *
     * Agora o código digitado na resposta vale igual — e é conferido contra o
     * ERP antes de valer, porque formato não é existência.
     */
    it('sem peça falada, o CÓDIGO na resposta serve', async () => {
      sessao.esquecerPecaFalada(DE);

      const r = await useCase.anexarPenduradas(DE, 'BR26396', QUEM);

      expect(r?.motivo).toBe('anexo_na_peca');
      expect(fotos.anexarExistente).toHaveBeenCalledWith(
        'p-1',
        'catalogo/pendentes/a.jpg',
        'image/jpeg',
        QUEM,
      );
    });

    it('código que NÃO existe no ERP não anexa', async () => {
      sessao.esquecerPecaFalada(DE);
      produtos.findByCodigoErp.mockResolvedValue(null);

      expect(await useCase.anexarPenduradas(DE, 'BR99999', QUEM)).toBeNull();
      expect(fotos.anexarExistente).not.toHaveBeenCalled();
    });

    it('arquivo que sumiu da espera é DITO, e não vira linha fantasma', async () => {
      fotos.anexarExistente = jest.fn().mockResolvedValue(null);

      const r = await useCase.anexarPenduradas(DE, 'peça', QUEM);

      expect(r?.motivo).toBe('anexo_na_peca_falhou');
      expect(useCase.temPecaMirada(DE)).toBe(false);
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

    /**
     * A RAJADA: uma mirada, N fotos. É o pedido literal do Lucas — *"o
     * importante é o que ela mandar, você faz um jeito para entrar tudo"*.
     *
     * TODAS ENTRAM. O que se corta é a TAGARELICE: `LimiteDeEnvioService`
     * para em 30 mensagens por hora para o mesmo destino, e uma confirmação
     * por foto faria a agente emudecer no meio de uma rajada grande — e a
     * mensagem cortada seria qualquer uma, inclusive a resposta de outra
     * pergunta.
     *
     * Então: confirma a primeira, depois a cada cinco. O total vem no
     * "pronto".
     */
    it('a rajada inteira entra, e a confirmação sai a cada cinco', async () => {
      await useCase.mirar(DE, 'produto BR26396');

      const r: (string | null | undefined)[] = [];
      for (let i = 0; i < 12; i++) r.push((await mandarFoto())?.resposta);

      // AS DOZE ENTRARAM — isto é o que não pode falhar.
      expect(fotos.adicionar).toHaveBeenCalledTimes(12);

      expect(r[0]).toContain('Primeira foto');
      expect(r[0]).toContain('a cada cinco');
      expect(r[4]).toContain('5 fotos');
      expect(r[9]).toContain('10 fotos');
      // As do meio não falam: o recibo do WhatsApp já diz que chegou.
      expect(r[1]).toBeNull();
      expect(r[7]).toBeNull();

      // Doze fotos custaram TRÊS mensagens, e não doze.
      expect(r.filter((x) => x !== null).length).toBe(3);
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
