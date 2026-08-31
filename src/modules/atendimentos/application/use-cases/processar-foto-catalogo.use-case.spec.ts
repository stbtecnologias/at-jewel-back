import { ProcessarFotoCatalogoUseCase } from './processar-foto-catalogo.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import type { CatalogoAberto } from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';

/**
 * O que se testa aqui e a LEITURA DA LEGENDA, e nao o caminho feliz inteiro.
 *
 * E onde mora a unica regra de verdade desta rodada, e onde um erro e caro: se
 * o codigo `BR26252` for lido como o numero de catalogo `26252`, a foto vai
 * para a colecao errada — ou para nenhuma — sem ninguem perceber, porque a
 * resposta no WhatsApp continua parecendo certa.
 */
describe('ProcessarFotoCatalogoUseCase — leitura da legenda', () => {
  const ABERTOS: CatalogoAberto[] = [
    { id: 'uuid-2', numero: '0002', nome: 'Catálogo Rosa Pink' },
    { id: 'uuid-3', numero: '0003', nome: 'Catálogo Inverno' },
  ];

  let useCase: ProcessarFotoCatalogoUseCase;

  // `lerLegenda` e privado de proposito — e detalhe do fluxo, nao contrato.
  // O teste alcança por indexacao, que e o preco de nao expor so para testar.
  function ler(texto: string) {
    return (
      useCase as unknown as {
        lerLegenda: (
          t: string,
          a: CatalogoAberto[],
        ) => {
          catalogo: CatalogoAberto | null;
          codigo: string | null;
          parcelas: number | null;
        };
      }
    ).lerLegenda(texto, ABERTOS);
  }

  beforeEach(() => {
    useCase = new ProcessarFotoCatalogoUseCase(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new SessaoCatalogoService(),
      // O tratamento pela IA nao participa destes testes: eles exercitam a
      // LEITURA DA LEGENDA, que acontece antes de qualquer geracao.
      {} as never,
    );
  });

  it('numero e codigo juntos — o caso que a gente pede que seja usado', () => {
    const r = ler('0002 BR26252');
    expect(r.catalogo?.numero).toBe('0002');
    expect(r.codigo).toBe('BR26252');
  });

  it('o codigo NAO e confundido com o numero do catalogo', () => {
    // Sem a extracao do codigo primeiro, o `26252` de dentro de BR26252 seria
    // lido como numero de catalogo.
    const r = ler('BR26252');
    expect(r.codigo).toBe('BR26252');
    expect(r.catalogo).toBeNull();
  });

  it('aceita o numero sem os zeros a esquerda e com cerquilha', () => {
    expect(ler('#2 CO26185').catalogo?.numero).toBe('0002');
    expect(ler('2').catalogo?.numero).toBe('0002');
  });

  it('reconhece pelo nome, sem acento e em minusculas', () => {
    expect(ler('catalogo inverno').catalogo?.numero).toBe('0003');
    expect(ler('ROSA PINK').catalogo?.numero).toBe('0002');
  });

  it('nome ambiguo nao decide sozinho — cai na pergunta', () => {
    // "catálogo" casa com os dois; melhor perguntar do que chutar.
    expect(ler('catalogo').catalogo).toBeNull();
  });

  it('le o parcelamento quando informado, e ignora o resto', () => {
    const r = ler('0003 CO26185 6x');
    expect(r.catalogo?.numero).toBe('0003');
    expect(r.codigo).toBe('CO26185');
    expect(r.parcelas).toBe(6);
  });

  it('sem parcelamento na legenda devolve nulo — quem decide o padrao e o fluxo', () => {
    expect(ler('0002 BR26252').parcelas).toBeNull();
  });

  it('legenda vazia nao inventa nada', () => {
    const r = ler('');
    expect(r.catalogo).toBeNull();
    expect(r.codigo).toBeNull();
    expect(r.parcelas).toBeNull();
  });

  it('numero de catalogo que nao esta aberto nao casa', () => {
    expect(ler('0099 BR26252').catalogo).toBeNull();
  });
});

/**
 * A OUTRA PONTA DO FLUXO: a resposta ao "ficou assim?".
 *
 * O que se protege aqui e a fronteira do vocabulario. Ela e a unica coisa que
 * separa "aprovo" de "quanto vendi hoje?" num canal onde as duas frases chegam
 * pelo mesmo campo de texto — e errar para o lado errado manda a pergunta da
 * pessoa para um modelo de imagem, cobrado e sem responder nada.
 */
describe('ProcessarFotoCatalogoUseCase — aprovacao da foto tratada', () => {
  const DE = '558586467241@c.us';
  const QUEM = 'Faby Rocha';

  const FOTO = (id: string, codigo: string | null) =>
    ({
      id,
      catalogoId: 'uuid-2',
      posicao: 1,
      codigoErp: codigo,
      descricao: null,
      precoAVista: null,
      parcelas: null,
      origem: 'WHATSAPP',
      remetente: QUEM,
      arquivoOriginalId: 'catalogo/0002/originais/a.jpg',
      arquivoId: 'catalogo/0002/fotos/a.png',
      status: 'EM_APROVACAO',
      versoes: 1,
      aprovadoPor: null,
      aprovadoEm: null,
    }) as never;

  let catalogos: {
    listarEmAprovacao: jest.Mock;
    atualizarFoto: jest.Mock;
    removerFoto: jest.Mock;
  };
  let armazenamento: { remover: jest.Mock };
  let tratar: { execute: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: ProcessarFotoCatalogoUseCase;

  beforeEach(() => {
    catalogos = {
      listarEmAprovacao: jest
        .fn()
        .mockResolvedValue([FOTO('f-1', 'BR26252'), FOTO('f-2', 'CO26185')]),
      atualizarFoto: jest.fn().mockResolvedValue(undefined),
      removerFoto: jest.fn().mockResolvedValue(undefined),
    };
    armazenamento = { remover: jest.fn().mockResolvedValue(undefined) };
    tratar = { execute: jest.fn().mockResolvedValue(null) };
    sessao = new SessaoCatalogoService();

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      armazenamento as never,
      {} as never,
      { enviarTexto: jest.fn(), enviarImagem: jest.fn() } as never,
      sessao,
      tratar as never,
    );
  });

  it('"aprovo" carimba a mais antiga da fila, e so ela', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'aprovo');

    expect(catalogos.atualizarFoto).toHaveBeenCalledTimes(1);
    const [id, dados] = catalogos.atualizarFoto.mock.calls[0] as [
      string,
      { status: string; aprovadoPor: string },
    ];
    expect(id).toBe('f-1');
    expect(dados.status).toBe('APROVADA');
    expect(dados.aprovadoPor).toBe(QUEM);
    // A QUE SOBROU TEM DE VIR NOMEADA. Dizer so "ainda tenho 1 esperando"
    // provoca um "qual?" — que nao e veredito, cai nos agentes e mata a
    // conversa. Aconteceu em 31/08.
    expect(r?.resposta).toContain('BR26252');
    expect(r?.resposta).toContain('CO26185');
  });

  it('"aprovo todas" pega a fila inteira', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'Aprovo todas!');

    expect(catalogos.atualizarFoto).toHaveBeenCalledTimes(2);
    expect(r?.resposta).toContain('2 fotos aprovadas');
  });

  it('acento e pontuacao nao atrapalham', async () => {
    expect(await useCase.aprovacao(DE, QUEM, 'Tá bom!')).not.toBeNull();
    expect(catalogos.atualizarFoto).toHaveBeenCalledTimes(1);
  });

  it('"ajusta ..." manda refazer a mais antiga, com o pedido', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'ajusta fundo branco');

    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
    expect(tratar.execute).toHaveBeenCalledWith('f-1', 'fundo branco');
    expect(r?.motivo).toBe('foto_em_ajuste');
  });

  it('"ajusta" sem dizer o que nao queima uma geracao', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'ajusta');

    expect(tratar.execute).not.toHaveBeenCalled();
    expect(r?.motivo).toBe('ajuste_sem_pedido');
  });

  it('a resposta a "o que quer que eu mude?" NAO precisa da palavra de comando', async () => {
    // O caso real de 31/08: perguntei, o Lucas respondeu em texto livre, e a
    // resposta caiu na Anastasia porque nao abria com "ajusta".
    await useCase.aprovacao(DE, QUEM, 'ajusta');
    const r = await useCase.aprovacao(DE, QUEM, 'tirar a pedra que não existe');

    expect(tratar.execute).toHaveBeenCalledWith(
      'f-1',
      'tirar a pedra que não existe',
    );
    expect(r?.motivo).toBe('foto_em_ajuste');
  });

  it('a marca e de um uso so — a mensagem seguinte volta a cair nos agentes', async () => {
    await useCase.aprovacao(DE, QUEM, 'ajusta');
    await useCase.aprovacao(DE, QUEM, 'fundo branco');

    expect(await useCase.aprovacao(DE, QUEM, 'quanto vendi hoje?')).toBeNull();
  });

  it('"aprovo" logo apos a pergunta continua sendo aprovacao', async () => {
    await useCase.aprovacao(DE, QUEM, 'ajusta');
    const r = await useCase.aprovacao(DE, QUEM, 'aprovo');

    expect(r?.motivo).toBe('foto_aprovada');
    expect(tratar.execute).not.toHaveBeenCalled();
  });

  it('pergunta de venda NAO vira pedido de ajuste — devolve null e segue', async () => {
    // A invariante que este describe existe para proteger.
    const r = await useCase.aprovacao(DE, QUEM, 'quanto vendi hoje?');

    expect(r).toBeNull();
    expect(tratar.execute).not.toHaveBeenCalled();
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
  });

  it('a palavra tem de abrir a frase', async () => {
    // "aprovo" no meio de uma duvida nao e aprovacao.
    expect(
      await useCase.aprovacao(DE, QUEM, 'nao sei se aprovo essa'),
    ).toBeNull();
  });

  it('fila vazia devolve null e baixa a catraca da memoria', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([]);
    sessao.marcarEmAprovacao(DE);

    expect(await useCase.aprovacao(DE, QUEM, 'aprovo')).toBeNull();
    expect(useCase.temFotoEmAprovacao(DE)).toBe(false);
  });

  it('a fila vem filtrada por quem fotografou — nunca pelo que veio na mensagem', async () => {
    await useCase.aprovacao(DE, QUEM, 'aprovo');
    expect(catalogos.listarEmAprovacao).toHaveBeenCalledWith(QUEM);
  });

  // -------------------------------------------------------------------------
  // Descarte — o único caminho irreversível
  // -------------------------------------------------------------------------

  it('"descarta" apaga os arquivos E a linha, nos dois lugares', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'descarta');

    // Os arquivos saem ANTES da linha: falhando o S3, sobra a linha (legível e
    // retentável) e não binário órfão que ninguém sabe identificar.
    expect(armazenamento.remover).toHaveBeenCalledWith(
      'catalogo/0002/originais/a.jpg',
    );
    expect(armazenamento.remover).toHaveBeenCalledWith(
      'catalogo/0002/fotos/a.png',
    );
    expect(catalogos.removerFoto).toHaveBeenCalledWith('f-1');
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
    expect(r?.motivo).toBe('foto_descartada');
  });

  it('não tenta apagar duas vezes quando a foto nunca foi tratada', async () => {
    // Tratada e original são a MESMA chave: a IA não chegou a rodar.
    catalogos.listarEmAprovacao.mockResolvedValue([
      {
        ...(FOTO('f-1', 'BR26252') as object),
        arquivoId: 'catalogo/0002/originais/a.jpg',
      },
    ]);

    await useCase.aprovacao(DE, QUEM, 'apaga');

    expect(armazenamento.remover).toHaveBeenCalledTimes(1);
  });

  it('descartar não publica: a palavra de descarte é lida ANTES da de aprovação', async () => {
    // A invariante que a ordem existe para garantir — o descarte não tem volta.
    await useCase.aprovacao(DE, QUEM, 'descarta todas');

    expect(catalogos.removerFoto).toHaveBeenCalledTimes(2);
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
  });
});
