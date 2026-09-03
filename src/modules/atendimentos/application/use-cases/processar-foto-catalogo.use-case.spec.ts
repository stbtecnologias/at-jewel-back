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
          juros: number | null;
          pedidoDeEstilo: string | null;
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

  // -------------------------------------------------------------------------
  // O juro do parcelamento
  // -------------------------------------------------------------------------

  it('le o juro em porcentagem', () => {
    const r = ler('0002 BR26252 12x 15%');
    expect(r.parcelas).toBe(12);
    expect(r.juros).toBe(15);
    // E o `15` NAO pode virar numero de catalogo: parcelas e juro saem do
    // texto antes, entao o que sobra de digito e catalogo.
    expect(r.catalogo?.numero).toBe('0002');
  });

  it('"sem juros" e ZERO, e nao ausencia', () => {
    // A diferenca decide o preco: sem indicacao vale a regra da casa, que
    // equivale a 25% de acrescimo. "Sem juros" e o oposto disso.
    expect(ler('0002 BR26252 10x sem juros').juros).toBe(0);
    expect(ler('0002 BR26252 10x s/ juros').juros).toBe(0);
  });

  it('sem dizer nada, o juro fica NULO — vale a regra da casa', () => {
    expect(ler('0002 BR26252 10x').juros).toBeNull();
  });

  it('a ordem das partes nao importa', () => {
    const r = ler('15% BR26252 12x 0002');
    expect(r.codigo).toBe('BR26252');
    expect(r.parcelas).toBe(12);
    expect(r.juros).toBe(15);
    expect(r.catalogo?.numero).toBe('0002');
  });

  it('o juro nao vira pedido de estilo', () => {
    // Sobrando na legenda, "15%" iria para a IA como instrucao de imagem.
    expect(ler('0002 BR26252 12x 15%').pedidoDeEstilo).toBeNull();
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
  let produtos: { findByCodigoErp: jest.Mock };
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
    produtos = { findByCodigoErp: jest.fn().mockResolvedValue(null) };
    tratar = { execute: jest.fn().mockResolvedValue(null) };
    sessao = new SessaoCatalogoService();

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      armazenamento as never,
      produtos as never,
      { enviarTexto: jest.fn(), enviarImagem: jest.fn() } as never,
      sessao,
      tratar as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
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
  // O código que chega depois da foto
  // -------------------------------------------------------------------------

  it('o código digitado depois completa a foto que ficou sem ele', async () => {
    // O caso real de 01/09: a mensagem convidava a mandar o código e ninguém
    // escutava — ele caía na Anastasia.
    sessao.esperarCodigo(DE, 'f-9', '#0001 Rosa Pink');
    produtos.findByCodigoErp.mockResolvedValue({
      descricaoEtiqueta: 'BRINCO RUBI 0.63 CTS',
      valorVenda: 44900,
    });

    const r = await useCase.codigo(DE, 'Br26252');

    expect(catalogos.atualizarFoto).toHaveBeenCalledWith('f-9', {
      codigoErp: 'BR26252',
      descricao: 'BRINCO RUBI 0.63 CTS',
      precoAVista: 44900,
      parcelas: 10,
      jurosPercentual: null,
    });
    expect(r?.resposta).toContain('44.900,00');
    // Consumido: a próxima mensagem volta a cair nos agentes.
    expect(useCase.temCodigoEsperando(DE)).toBe(false);
  });

  it('o parcelamento na mesma mensagem vale — "BR26252 6x"', async () => {
    // Tem de funcionar igual a `0001 BR26252 6x` na legenda: quem escreve não
    // sabe que são dois caminhos de código diferentes.
    sessao.esperarCodigo(DE, 'f-9', '#0001 Rosa Pink');
    produtos.findByCodigoErp.mockResolvedValue({
      descricaoEtiqueta: 'BRINCO RUBI',
      valorVenda: 44900,
    });

    await useCase.codigo(DE, 'BR26252 6x');

    expect(catalogos.atualizarFoto).toHaveBeenCalledWith(
      'f-9',
      expect.objectContaining({ parcelas: 6 }),
    );
  });

  it('texto sem cara de código devolve null e segue', async () => {
    sessao.esperarCodigo(DE, 'f-9', '#0001 Rosa Pink');

    expect(await useCase.codigo(DE, 'quanto vendi hoje?')).toBeNull();
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
  });

  it('peça fora do ERP anota o código e avisa que ficou sem preço', async () => {
    sessao.esperarCodigo(DE, 'f-9', '#0001 Rosa Pink');
    produtos.findByCodigoErp.mockResolvedValue(null);

    const r = await useCase.codigo(DE, 'BR99999');

    expect(catalogos.atualizarFoto).toHaveBeenCalledWith('f-9', {
      codigoErp: 'BR99999',
      descricao: null,
      precoAVista: null,
      // Sem preço não há parcela: deixar 10x gravado faria a tela calcular
      // parcela de um valor que não existe.
      parcelas: null,
      jurosPercentual: null,
    });
    expect(r?.motivo).toBe('codigo_sem_produto');
  });

  it('foto SEM CÓDIGO não entra no catálogo', async () => {
    // Em 01/09 uma foto sem código foi aprovada e apareceu na tela com `—` no
    // lugar do descritivo. Catálogo é peça, código e preço.
    catalogos.listarEmAprovacao.mockResolvedValue([FOTO('f-1', null)]);

    const r = await useCase.aprovacao(DE, QUEM, 'aprovo');

    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
    expect(r?.motivo).toBe('aprovacao_sem_codigo');
    // E já fica esperando o código, para a pessoa só precisar digitá-lo.
    expect(useCase.temCodigoEsperando(DE)).toBe(true);
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

/**
 * A PECA ENCONTRADA PELA DESCRICAO, quando o codigo nao esta a mao.
 *
 * O que estes testes protegem sao as duas bordas do recurso, e as duas doem
 * de formas opostas:
 *
 *   engolir de menos -> "anel de esmeralda" cai na Anastasia e a foto fica
 *                       sem codigo, que e o defeito que isto veio consertar;
 *   engolir de mais  -> "quanto vendi hoje?" vira busca de produto, e a
 *                       pergunta dela morre sem nunca chegar a quem responde.
 */
describe('ProcessarFotoCatalogoUseCase — a peca pela descricao', () => {
  const DE = '558586467241@c.us';

  const PRODUTO = (
    codigo: string | null,
    descricao: string,
    preco: number,
  ) => ({
    codigoErp: codigo,
    descricaoEtiqueta: descricao,
    valorVenda: preco,
    familia: 'ANEL',
    categoria: 'JOIA',
  });

  let catalogos: { atualizarFoto: jest.Mock };
  let produtos: { findByCodigoErp: jest.Mock };
  let listar: { execute: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: ProcessarFotoCatalogoUseCase;

  beforeEach(() => {
    catalogos = { atualizarFoto: jest.fn().mockResolvedValue(undefined) };
    produtos = {
      findByCodigoErp: jest
        .fn()
        .mockResolvedValue(
          PRODUTO('CB512', 'ANEL ESMERALDA GOTA OB 18K', 18900),
        ),
    };
    listar = { execute: jest.fn().mockResolvedValue([]) };
    sessao = new SessaoCatalogoService();

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      {} as never,
      produtos as never,
      {} as never,
      sessao,
      {} as never,
      listar as never,
    );

    // O estado que o recurso inteiro pressupoe: uma foto guardada esperando
    // o codigo. Sem ela, nada aqui roda — e isso tambem e testado.
    sessao.esperarCodigo(DE, 'f-1', 'essa foto');
  });

  it('a descricao vira lista numerada, com o preco em cada linha', async () => {
    listar.execute.mockResolvedValue([
      PRODUTO('CB384', 'ANEL ESMERALDA OB 18K', 12400),
      PRODUTO('CB512', 'ANEL ESMERALDA GOTA OB 18K', 18900),
    ]);

    const r = await useCase.buscarPeca(DE, 'anel de esmeralda ouro branco');

    expect(r?.motivo).toBe('busca_com_opcoes');
    expect(r?.resposta).toContain('1 · CB384');
    expect(r?.resposta).toContain('2 · CB512');
    // O preco e o que separa duas pecas de nome quase igual.
    expect(r?.resposta).toContain('12.400,00');
    // Nada foi gravado ainda: a busca so oferece.
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
  });

  it('o numero escolhe, e o codigo vai para a foto', async () => {
    listar.execute.mockResolvedValue([
      PRODUTO('CB384', 'ANEL ESMERALDA OB 18K', 12400),
      PRODUTO('CB512', 'ANEL ESMERALDA GOTA OB 18K', 18900),
    ]);
    await useCase.buscarPeca(DE, 'anel de esmeralda');

    const r = await useCase.buscarPeca(DE, '2');

    expect(r?.motivo).toBe('codigo_anotado');
    const [id, dados] = catalogos.atualizarFoto.mock.calls[0] as [
      string,
      { codigoErp: string },
    ];
    expect(id).toBe('f-1');
    expect(dados.codigoErp).toBe('CB512');
  });

  it('o parcelamento continua valendo na escolha: `2 6x`', async () => {
    listar.execute.mockResolvedValue([
      PRODUTO('CB384', 'ANEL ESMERALDA OB 18K', 12400),
      PRODUTO('CB512', 'ANEL ESMERALDA GOTA OB 18K', 18900),
    ]);
    await useCase.buscarPeca(DE, 'anel de esmeralda');

    await useCase.buscarPeca(DE, '2 6x');

    const [, dados] = catalogos.atualizarFoto.mock.calls[0] as [
      string,
      { parcelas: number },
    ];
    expect(dados.parcelas).toBe(6);
  });

  it('pergunta sobre vendas NAO vira busca de peca', async () => {
    // A borda cara: engolir aqui faz a pergunta dela morrer sem chegar na
    // Anastasia — e ela nunca fica sabendo que perguntou.
    const r = await useCase.buscarPeca(DE, 'quanto vendi hoje?');

    expect(r).toBeNull();
    expect(listar.execute).not.toHaveBeenCalled();
  });

  it('uma opcao so ainda pergunta — e o `sim` confirma', async () => {
    listar.execute.mockResolvedValue([
      PRODUTO('CB512', 'ANEL ESMERALDA GOTA OB 18K', 18900),
    ]);
    const lista = await useCase.buscarPeca(DE, 'anel de esmeralda gota');

    // Nao anotou sozinha: errar a peca imprime o preco de outra na pagina.
    expect(lista?.motivo).toBe('busca_com_opcoes');
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();

    // E o "sim" que a pergunta convida e entendido.
    const r = await useCase.buscarPeca(DE, 'sim');
    expect(r?.motivo).toBe('codigo_anotado');
  });

  it('numero fora da lista responde, em vez de calar', async () => {
    listar.execute.mockResolvedValue([
      PRODUTO('CB384', 'ANEL ESMERALDA OB 18K', 12400),
    ]);
    await useCase.buscarPeca(DE, 'anel de esmeralda');

    const r = await useCase.buscarPeca(DE, '9');

    expect(r?.motivo).toBe('escolha_fora_da_lista');
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
  });

  it('busca sem resultado responde, e nao deixa um beco', async () => {
    const r = await useCase.buscarPeca(DE, 'anel de kriptonita');

    expect(r?.motivo).toBe('busca_sem_resultado');
    expect(r?.resposta).toContain('código');
  });

  it('o texto vai CRU para a busca, com acento', async () => {
    // `normalizar` tira o cedilha, e `alianca` nao casa com `ALIANÇA` no
    // ILIKE. O normalizado decide se e busca; o cru e o que se procura.
    await useCase.buscarPeca(DE, 'aliança de ouro');

    const [filtro] = listar.execute.mock.calls[0] as [{ busca: string }];
    expect(filtro.busca).toContain('aliança');
  });

  it('sem foto esperando codigo, nao busca nada', async () => {
    sessao.esquecerCodigo(DE);

    const r = await useCase.buscarPeca(DE, 'anel de esmeralda');

    expect(r).toBeNull();
    expect(listar.execute).not.toHaveBeenCalled();
  });

  it('peca sem codigo no ERP nao entra na lista', async () => {
    // Oferecer uma peca sem codigo seria oferecer um beco: a escolha existe
    // justamente para preencher `codigo_erp`.
    listar.execute.mockResolvedValue([
      PRODUTO(null, 'ANEL SEM CODIGO', 900),
      PRODUTO('CB384', 'ANEL ESMERALDA OB 18K', 12400),
    ]);

    const r = await useCase.buscarPeca(DE, 'anel de esmeralda');

    expect(r?.resposta).toContain('1 · CB384');
    expect(r?.resposta).not.toContain('SEM CODIGO');
  });
});
