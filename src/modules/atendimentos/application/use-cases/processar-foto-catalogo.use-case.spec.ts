import { ProcessarFotoCatalogoUseCase } from './processar-foto-catalogo.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import type { CatalogoAberto } from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';

/**
 * A conferencia da foto NAO participa destes testes: null quer dizer "nao
 * deu para conferir", e nesse caso a foto segue o caminho de sempre. Os testes
 * da recusa ficam no bloco proprio, mais abaixo.
 */
const CONFERENCIA_NULA = {
  disponivel: () => true,
  conferir: jest.fn().mockResolvedValue(null),
} as never;

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
        ) => Promise<{
          catalogo: CatalogoAberto | null;
          codigo: string | null;
          parcelas: number | null;
          juros: number | null;
          pedidoDeEstilo: string | null;
        }>;
      }
    ).lerLegenda(texto, ABERTOS);
  }

  /** Os codigos que a base "tem" neste bloco de testes. */
  let codigosDaBase: string[];

  beforeEach(() => {
    codigosDaBase = [];

    // O REPOSITORIO PASSOU A PARTICIPAR DA LEITURA. Antes o codigo era
    // reconhecido por formato e este parametro era `{}`; agora o leitor
    // pergunta ao banco quais dos codigos dele aparecem na legenda.
    //
    // O mock imita a consulta de verdade: casa por conteudo, ignora caixa e
    // devolve do mais longo para o mais curto. A BORDA nao e conferida aqui —
    // ela e responsabilidade de quem chama, e e justamente o que os testes
    // precisam exercitar.
    const produtos = {
      buscarCodigosPresentesEm: jest.fn(async (texto: string) =>
        codigosDaBase
          .filter((c) => texto.toUpperCase().includes(c.toUpperCase()))
          .sort((a, b) => b.length - a.length),
      ),
    };

    useCase = new ProcessarFotoCatalogoUseCase(
      {} as never,
      {} as never,
      produtos as never,
      {} as never,
      new SessaoCatalogoService(),
      // O tratamento pela IA nao participa destes testes: eles exercitam a
      // LEITURA DA LEGENDA, que acontece antes de qualquer geracao.
      {} as never,
      {} as never,
      CONFERENCIA_NULA,
    );
  });

  it('numero e codigo juntos — o caso que a gente pede que seja usado', async () => {
    codigosDaBase = ['BR26252'];
    const r = await ler('0002 BR26252');
    expect(r.catalogo?.numero).toBe('0002');
    expect(r.codigo).toBe('BR26252');
  });

  it('o codigo NAO e confundido com o numero do catalogo', async () => {
    // Sem a extracao do codigo primeiro, o `26252` de dentro de BR26252 seria
    // lido como numero de catalogo.
    codigosDaBase = ['BR26252'];
    const r = await ler('BR26252');
    expect(r.codigo).toBe('BR26252');
    expect(r.catalogo).toBeNull();
  });

  it('aceita o numero sem os zeros a esquerda e com cerquilha', async () => {
    codigosDaBase = ['CO26185'];
    expect((await ler('#2 CO26185')).catalogo?.numero).toBe('0002');
    expect((await ler('2')).catalogo?.numero).toBe('0002');
  });

  it('reconhece pelo nome, sem acento e em minusculas', async () => {
    expect((await ler('catalogo inverno')).catalogo?.numero).toBe('0003');
    expect((await ler('ROSA PINK')).catalogo?.numero).toBe('0002');
  });

  it('nome ambiguo nao decide sozinho — cai na pergunta', async () => {
    // "catálogo" casa com os dois; melhor perguntar do que chutar.
    expect((await ler('catalogo')).catalogo).toBeNull();
  });

  it('le o parcelamento quando informado, e ignora o resto', async () => {
    codigosDaBase = ['CO26185'];
    const r = await ler('0003 CO26185 6x');
    expect(r.catalogo?.numero).toBe('0003');
    expect(r.codigo).toBe('CO26185');
    expect(r.parcelas).toBe(6);
  });

  it('sem parcelamento na legenda devolve nulo — quem decide o padrao e o fluxo', async () => {
    expect((await ler('0002 BR26252')).parcelas).toBeNull();
  });

  it('legenda vazia nao inventa nada', async () => {
    const r = await ler('');
    expect(r.catalogo).toBeNull();
    expect(r.codigo).toBeNull();
    expect(r.parcelas).toBeNull();
  });

  it('numero de catalogo que nao esta aberto nao casa', async () => {
    expect((await ler('0099 BR26252')).catalogo).toBeNull();
  });

  // -------------------------------------------------------------------------
  // O juro do parcelamento
  // -------------------------------------------------------------------------

  it('le o juro em porcentagem', async () => {
    const r = await ler('0002 BR26252 12x 15%');
    expect(r.parcelas).toBe(12);
    expect(r.juros).toBe(15);
    // E o `15` NAO pode virar numero de catalogo: parcelas e juro saem do
    // texto antes, entao o que sobra de digito e catalogo.
    expect(r.catalogo?.numero).toBe('0002');
  });

  it('"sem juros" e ZERO, e nao ausencia', async () => {
    // Desde 04/09/2026 os dois dao o MESMO numero — ausencia passou a valer
    // zero. A forma continua reconhecida porque registra que alguem conferiu.
    expect((await ler('0002 BR26252 10x sem juros')).juros).toBe(0);
    expect((await ler('0002 BR26252 10x s/ juros')).juros).toBe(0);
  });

  it('sem dizer nada, o juro fica NULO', async () => {
    expect((await ler('0002 BR26252 10x')).juros).toBeNull();
  });

  it('a ordem das partes nao importa', async () => {
    codigosDaBase = ['BR26252'];
    const r = await ler('15% BR26252 12x 0002');
    expect(r.codigo).toBe('BR26252');
    expect(r.parcelas).toBe(12);
    expect(r.juros).toBe(15);
    expect(r.catalogo?.numero).toBe('0002');
  });

  it('o juro nao vira pedido de estilo', async () => {
    // Sobrando na legenda, "15%" iria para a IA como instrucao de imagem.
    expect((await ler('0002 BR26252 12x 15%')).pedidoDeEstilo).toBeNull();
  });

  // -------------------------------------------------------------------------
  // O CODIGO VEM DO BANCO, NAO DO FORMATO — medido na producao em 04/09/2026.
  //
  // O leitor antigo reconhecia `[A-Z]{2}` mais digitos, e cobria 5.919 dos
  // 6.938 codigos. Os outros 1.019 nao tem formato em comum: ha codigo com
  // ESPACO, de UM caractere e sem digito nenhum.
  // -------------------------------------------------------------------------

  it('O CASO QUE MANDAVA FOTO PARA A COLECAO ERRADA: codigo com hifen', async () => {
    // `1-25-3A-2` e um codigo real da producao. Ele nao casa com o formato
    // antigo, entao sobrava na legenda — e a busca do NUMERO DO CATALOGO
    // mordia o `1` da frente, mandando a foto para o catalogo #0001, que
    // existe. Sem erro, sem pergunta, com uma confirmacao dizendo que deu
    // certo. Sao sete pecas reais nessa situacao.
    codigosDaBase = ['1-25-3A-2', '1'];
    const r = await ler('0002 1-25-3A-2 10x');

    expect(r.codigo).toBe('1-25-3A-2');
    expect(r.catalogo?.numero).toBe('0002');
  });

  it('o mais LONGO ganha — o codigo curto esta dentro do comprido', async () => {
    // Na legenda `1-25-3A-2` casam os dois codigos. Pegar o primeiro que
    // aparecesse deixaria `-25-3A-2` no texto e o `25` viraria catalogo.
    codigosDaBase = ['1', '1-25-3A-2'];
    expect((await ler('1-25-3A-2')).codigo).toBe('1-25-3A-2');
  });

  it('codigo COM ESPACO — sao 9 na base, e nenhum deles cabia numa palavra', async () => {
    codigosDaBase = ['TABUA QUEIJO  LAGUIO'];
    const r = await ler('0002 TABUA QUEIJO  LAGUIO 10x');

    expect(r.codigo).toBe('TABUA QUEIJO  LAGUIO');
    expect(r.catalogo?.numero).toBe('0002');
  });

  it('codigo SEM DIGITO — `PINGENTE` e um codigo de verdade', async () => {
    codigosDaBase = ['PINGENTE'];
    expect((await ler('0002 pingente')).codigo).toBe('PINGENTE');
  });

  it('codigo de UM caractere so casa quando esta sozinho', async () => {
    // O `1` esta DENTRO de `CO26185`. Sem exigir borda, toda legenda com um
    // digito passaria a ter esse codigo.
    codigosDaBase = ['1'];

    // Aqui o `CO26185` e reconhecido pelo formato de reserva, e nao pelo
    // banco. O que este teste prova e que o `1` NAO ganhou.
    expect((await ler('0002 CO26185')).codigo).toBe('CO26185');

    // Sozinho, com espaco dos dois lados, ele e o codigo.
    expect((await ler('0002 1')).codigo).toBe('1');
  });

  it('caixa da legenda nao importa — os codigos da base estao em maiuscula', async () => {
    codigosDaBase = ['CO26185'];
    expect((await ler('0002 co26185')).codigo).toBe('CO26185');
  });

  it('PECA QUE AINDA NAO SINCRONIZOU cai no formato antigo', async () => {
    // `catalogo_fotos.codigo_erp` e sem chave estrangeira DE PROPOSITO: a foto
    // pode chegar antes de a peca existir. Recusar o desconhecido quebraria a
    // peca nova — que e justamente a que vai para catalogo novo.
    codigosDaBase = [];
    expect((await ler('0002 BR99999')).codigo).toBe('BR99999');
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
    buscarPorId: jest.Mock;
  };
  let armazenamento: { remover: jest.Mock };
  let produtos: {
    findByCodigoErp: jest.Mock;
    buscarCodigosPresentesEm: jest.Mock;
  };
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
      buscarPorId: jest
        .fn()
        .mockResolvedValue({ numero: '0002', nome: 'Catálogo Rosa Pink' }),
    };
    armazenamento = { remover: jest.fn().mockResolvedValue(undefined) };
    produtos = {
      findByCodigoErp: jest.fn().mockResolvedValue(null),
      // VAZIO POR PADRAO: nenhum codigo da base aparece na legenda, entao o
      // leitor cai no reconhecimento por FORMATO — que e o caminho que estes
      // testes sempre exerceram. Quem quiser exercer a busca no banco manda
      // `mockResolvedValue([...])` no proprio teste.
      buscarCodigosPresentesEm: jest.fn().mockResolvedValue([]),
    };
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
      CONFERENCIA_NULA,
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
  let produtos: {
    findByCodigoErp: jest.Mock;
    buscarCodigosPresentesEm: jest.Mock;
  };
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
      buscarCodigosPresentesEm: jest.fn().mockResolvedValue([]),
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
      CONFERENCIA_NULA,
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

/**
 * O CHAO DO CANAL DO CATALOGO.
 *
 * Quem tem `catalogo:write` e nao tem agente proprio — estoque, marketing —
 * escrevia qualquer coisa que nao fosse comando e caia na TRIAGEM: a Anastasia
 * tentava qualificar a propria equipe como cliente, e o telefone do estoque
 * virava lead na fila de encaminhamento da gestao. Medido em 03/09/2026.
 */
describe('ProcessarFotoCatalogoUseCase — o texto solto de quem cuida do catalogo', () => {
  const DE = '558586467241@c.us';
  const QUEM = 'Faby Rocha';

  let catalogos: { listarAbertos: jest.Mock; listarEmAprovacao: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: ProcessarFotoCatalogoUseCase;

  beforeEach(() => {
    catalogos = {
      listarAbertos: jest
        .fn()
        .mockResolvedValue([{ id: 'c1', numero: '0001', nome: 'New In' }]),
      listarEmAprovacao: jest.fn().mockResolvedValue([]),
    };
    sessao = new SessaoCatalogoService();

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      {} as never,
      {} as never,
      {} as never,
      sessao,
      {} as never,
      {} as never,
      CONFERENCIA_NULA,
    );
  });

  it('diz os catálogos abertos e o que este canal faz', async () => {
    const r = await useCase.conversa(DE, QUEM);

    expect(r.motivo).toBe('catalogo_conversa');
    expect(r.resposta).toContain('#0001 — New In');
    // Quem escreveu não sabia o que o canal faz, senão teria escrito outra coisa.
    expect(r.resposta).toContain('Me manda a foto da peça');
  });

  it('sem catálogo aberto, diz isso em vez de mostrar lista vazia', async () => {
    catalogos.listarAbertos.mockResolvedValue([]);

    const r = await useCase.conversa(DE, QUEM);

    expect(r.resposta).toContain('Não tem catálogo aberto agora.');
  });

  it('avisa o que está esperando resposta, nomeando as peças', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([
      { id: 'f-1', codigoErp: 'BR26252' },
      { id: 'f-2', codigoErp: null },
    ]);

    const r = await useCase.conversa(DE, QUEM);

    expect(r.resposta).toContain('2 fotos esperando sua resposta');
    expect(r.resposta).toContain('BR26252');
    expect(r.resposta).toContain('sem código');
  });

  it('a catraca da aprovação SOBE aqui — e isso conserta um beco', async () => {
    // A marca vive em memória e some no restart do container. Sem levantá-la,
    // o "aprovo" digitado logo depois desta mensagem não seria reconhecido.
    catalogos.listarEmAprovacao.mockResolvedValue([
      { id: 'f-1', codigoErp: 'BR26252' },
    ]);
    expect(useCase.temFotoEmAprovacao(DE)).toBe(false);

    await useCase.conversa(DE, QUEM);

    expect(useCase.temFotoEmAprovacao(DE)).toBe(true);
  });

  it('sem nada esperando, a catraca continua baixa', async () => {
    await useCase.conversa(DE, QUEM);

    expect(useCase.temFotoEmAprovacao(DE)).toBe(false);
  });

  it('a fila é a DE QUEM ESCREVEU, e não a da casa', async () => {
    await useCase.conversa(DE, QUEM);

    expect(catalogos.listarEmAprovacao).toHaveBeenCalledWith(QUEM);
  });
});

/**
 * O PRINT DO YERLON, 10/09/2026 — HML-16.
 *
 *   16:42  "Quero adicionar fotos ao catálogo #0001"  -> Anastasia: "fora do meu alcance"
 *   16:43  foto                                        -> "De qual catálogo é?" (ele tinha dito)
 *   —      sem resposta                                -> a foto sumiu calada
 *   13:33  "Ok" (a "código anotado")                   -> Anastasia: "Como posso te ajudar?"
 *   13:34  "Aprova"                                    -> Anastasia: "Aprovar o quê?"
 *   13:34  "Aprovo"                                    -> aprovada
 *
 * Decisao do Lucas em 11/09: toda afirmacao aprova, e em qualquer ordem. O
 * que estes testes protegem e o par que a decisao cria — aceitar tudo o que e
 * afirmacao, sem aceitar a afirmacao que chegou ANTES da foto.
 */
describe('ProcessarFotoCatalogoUseCase — em qualquer ordem (o print do Yerlon)', () => {
  const DE = '558585351045@c.us';
  const QUEM = 'Yerlon Magalhães';
  const T = 1_757_521_640_000; // quando a foto tratada saiu

  const FOTO = (id: string, codigo: string | null) =>
    ({
      id,
      catalogoId: 'uuid-3',
      posicao: 1,
      codigoErp: codigo,
      descricao: null,
      precoAVista: null,
      parcelas: null,
      origem: 'WHATSAPP',
      remetente: QUEM,
      arquivoOriginalId: 'catalogo/0003/originais/a.jpg',
      arquivoId: 'catalogo/0003/fotos/a.png',
      status: 'EM_APROVACAO',
      versoes: 1,
      aprovadoPor: null,
      aprovadoEm: null,
    }) as never;

  const ABERTOS = [
    { id: 'uuid-1', numero: '0001', nome: 'Catalogo Rosa Pink' },
    { id: 'uuid-2', numero: '0002', nome: 'Teste' },
    { id: 'uuid-3', numero: '0003', nome: 'Verão 2027' },
  ];

  let catalogos: {
    listarAbertos: jest.Mock;
    listarEmAprovacao: jest.Mock;
    atualizarFoto: jest.Mock;
    removerFoto: jest.Mock;
    buscarPorId: jest.Mock;
  };
  let armazenamento: { remover: jest.Mock; ler: jest.Mock };
  let produtos: {
    findByCodigoErp: jest.Mock;
    buscarCodigosPresentesEm: jest.Mock;
  };
  let whatsapp: { enviarTexto: jest.Mock; enviarImagem: jest.Mock };
  let tratar: { execute: jest.Mock };
  let listar: { execute: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: ProcessarFotoCatalogoUseCase;

  beforeEach(() => {
    listar = { execute: jest.fn().mockResolvedValue([]) };
    catalogos = {
      listarAbertos: jest.fn().mockResolvedValue(ABERTOS),
      listarEmAprovacao: jest.fn().mockResolvedValue([FOTO('f-1', 'AN24435')]),
      atualizarFoto: jest.fn().mockResolvedValue({ status: 'EM_APROVACAO' }),
      removerFoto: jest.fn().mockResolvedValue(undefined),
      buscarPorId: jest
        .fn()
        .mockResolvedValue({ numero: '0004', nome: 'Holiday' }),
    };
    armazenamento = {
      remover: jest.fn().mockResolvedValue(undefined),
      ler: jest
        .fn()
        .mockResolvedValue({ conteudo: Buffer.from('png'), mime: 'image/png' }),
    };
    produtos = {
      findByCodigoErp: jest.fn().mockResolvedValue({
        descricaoEtiqueta: 'ANEL MASCULINO ESMERALDA OB 18K',
        valorVenda: 26990,
      }),
      buscarCodigosPresentesEm: jest.fn().mockResolvedValue([]),
    };
    whatsapp = {
      enviarTexto: jest.fn().mockResolvedValue(undefined),
      enviarImagem: jest.fn().mockResolvedValue(undefined),
    };
    tratar = { execute: jest.fn() };
    sessao = new SessaoCatalogoService();

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      armazenamento as never,
      produtos as never,
      whatsapp as never,
      sessao,
      tratar as never,
      listar as never,
      CONFERENCIA_NULA,
    );
  });

  const aprovou = () =>
    catalogos.atualizarFoto.mock.calls.some(
      ([, dados]) => (dados as { status?: string }).status === 'APROVADA',
    );

  // -------------------------------------------------------------------------
  // O vocabulário — toda afirmação aprova
  // -------------------------------------------------------------------------

  it('"Aprova" APROVA — o defeito do print', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'Aprova');

    expect(r?.motivo).toBe('foto_aprovada');
    expect(r?.resposta).toContain('AN24435 aprovada');
  });

  it.each([
    'Ok',
    'ok, obrigado',
    'sim',
    'Aprovada',
    'pode aprovar',
    'Gostei!',
    'show de bola',
    'top',
    'ficou lindo',
    'Beleza',
    'certo',
    '👍',
    '👍🏽',
    '✅',
    '👌',
  ])('"%s" aprova', async (palavra) => {
    const r = await useCase.aprovacao(DE, QUEM, palavra);
    expect(r?.motivo).toBe('foto_aprovada');
  });

  it('"ok, MAS muda o fundo" nao publica — refaz', async () => {
    // A lista maior de afirmacoes nao pode publicar justamente a foto que a
    // pessoa pediu para mudar.
    tratar.execute.mockResolvedValue(null);

    const r = await useCase.aprovacao(DE, QUEM, 'ok, mas muda o fundo');

    expect(aprovou()).toBe(false);
    expect(r?.motivo).toBe('foto_em_ajuste');
    expect(tratar.execute).toHaveBeenCalledWith('f-1', 'o fundo');
  });

  it('"ok, mas quanto vendi?" nao publica nem vira ajuste', async () => {
    const r = await useCase.aprovacao(DE, QUEM, 'ok, mas quanto vendi hoje?');

    expect(r).toBeNull();
    expect(aprovou()).toBe(false);
    expect(tratar.execute).not.toHaveBeenCalled();
  });

  it('"pode refazer com fundo branco" NAO aprova — "pode" sozinho ficou de fora', async () => {
    await useCase.aprovacao(DE, QUEM, 'pode refazer com fundo branco');
    expect(aprovou()).toBe(false);
  });

  it('"bom dia" NAO aprova — "bom" sozinho ficou de fora', async () => {
    await useCase.aprovacao(DE, QUEM, 'bom dia');
    expect(aprovou()).toBe(false);
  });

  it('negativa continua negativa: "não gostei" nao aprova', async () => {
    tratar.execute.mockResolvedValue(null);
    await useCase.aprovacao(DE, QUEM, 'não gostei');
    expect(aprovou()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // O relógio — a afirmação só vale para foto que já tinha chegado
  // -------------------------------------------------------------------------

  it('"Ok" ESCRITO ANTES de a foto sair NAO aprova — o risco do print', async () => {
    // 13:33 do print: o "Ok" respondia a "código anotado". A foto saiu depois.
    sessao.marcarEnviada(DE, 'f-1', T);

    const r = await useCase.aprovacao(DE, QUEM, 'Ok', T - 60_000);

    expect(aprovou()).toBe(false);
    // E recibo: sem resposta — nem aprovacao, nem "Como posso te ajudar?".
    expect(r?.resposta).toBeNull();
    expect(r?.motivo).toBe('recibo_antes_da_foto');
  });

  it('"Ok" escrito DEPOIS de a foto sair aprova', async () => {
    sessao.marcarEnviada(DE, 'f-1', T);

    const r = await useCase.aprovacao(DE, QUEM, 'Ok', T + 5_000);

    expect(r?.motivo).toBe('foto_aprovada');
  });

  it('a folga cobre o carimbo em segundos do WhatsApp', async () => {
    // O WhatsApp carimba em segundos: uma resposta de T+0,9s chega como T.
    sessao.marcarEnviada(DE, 'f-1', T + 900);

    const r = await useCase.aprovacao(DE, QUEM, 'Ok', T);

    expect(r?.motivo).toBe('foto_aprovada');
  });

  it('com a foto A CAMINHO, nada aprova — o banco ja diz EM_APROVACAO', async () => {
    // O `tratar` grava EM_APROVACAO antes de a imagem sair.
    sessao.marcarEmEnvio(DE, 'f-1');

    const r = await useCase.aprovacao(DE, QUEM, 'aprovo', Date.now());

    expect(aprovou()).toBe(false);
    expect(r?.motivo).toBe('recibo_antes_da_foto');
  });

  it('sem registro de envio (restart), aprova — a foto saiu antes da memoria', async () => {
    // A memoria e RAM. Recusar aqui deixaria a pessoa sem saida.
    const r = await useCase.aprovacao(DE, QUEM, 'Ok', T);
    expect(r?.motivo).toBe('foto_aprovada');
  });

  it('aprova a mais antiga QUE ELA VIU, e nao a que ainda esta a caminho', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([
      FOTO('f-1', 'AN24435'),
      FOTO('f-2', 'AN24372'),
    ]);
    sessao.marcarEmEnvio(DE, 'f-1'); // refazendo
    sessao.marcarEnviada(DE, 'f-2', T);

    await useCase.aprovacao(DE, QUEM, 'ok', T + 5_000);

    expect(catalogos.atualizarFoto).toHaveBeenCalledTimes(1);
    const [id] = catalogos.atualizarFoto.mock.calls[0] as [string];
    expect(id).toBe('f-2');
  });

  it('a foto tratada sai marcada: "a caminho" durante, "vista" depois', async () => {
    let vistaDuranteOTratamento: boolean | null = null;
    tratar.execute.mockImplementation(() => {
      vistaDuranteOTratamento = sessao.foiVista(DE, 'f-1', Date.now());
      return Promise.resolve({
        foto: { ...(FOTO('f-1', null) as object), status: 'EM_APROVACAO' },
        recado: null,
      });
    });

    await (
      useCase as unknown as {
        tratarEAvisar: (
          id: string,
          p: string | null,
          c: string,
        ) => Promise<void>;
      }
    ).tratarEAvisar('f-1', null, DE);

    expect(vistaDuranteOTratamento).toBe(false);
    expect(sessao.foiVista(DE, 'f-1', Date.now())).toBe(true);
    // Sem codigo, a legenda NAO pergunta de novo: so avisa que o "aprovo"
    // pode vir antes.
    const [, , , legenda] = whatsapp.enviarImagem.mock.calls[0] as [
      string,
      Buffer,
      string,
      string,
    ];
    expect(legenda).toContain('ainda sem o código');
    expect(legenda).not.toContain('?');
  });

  // -------------------------------------------------------------------------
  // A dica — uma vez só
  // -------------------------------------------------------------------------

  it('resposta curta que nao entendi ganha a dica, UMA vez', async () => {
    const primeira = await useCase.aprovacao(DE, QUEM, 'Aprovadíssimo demais');
    expect(primeira?.motivo).toBe('aprovacao_dica');
    expect(primeira?.resposta).toContain('"aprovo"');

    // A segunda vai para os agentes, como sempre foi.
    expect(await useCase.aprovacao(DE, QUEM, 'hmm talvez')).toBeNull();
  });

  it('pergunta NAO ganha dica — "quanto vendi?" continua da Anastasia', async () => {
    expect(await useCase.aprovacao(DE, QUEM, 'quanto vendi?')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // A aprovação antes do código
  // -------------------------------------------------------------------------

  it('"aprovo" ANTES do codigo fica guardado, e o codigo publica de uma vez', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([FOTO('f-1', null)]);

    const antes = await useCase.aprovacao(DE, QUEM, 'aprovo');
    expect(antes?.motivo).toBe('aprovacao_sem_codigo');
    expect(antes?.resposta).toContain('assim que tiver o código');
    expect(aprovou()).toBe(false);

    const depois = await useCase.codigo(DE, 'AN24435', QUEM);

    expect(depois?.motivo).toBe('foto_aprovada');
    expect(depois?.resposta).toContain('já está no catálogo');
    expect(catalogos.atualizarFoto).toHaveBeenLastCalledWith(
      'f-1',
      expect.objectContaining({ status: 'APROVADA', aprovadoPor: QUEM }),
    );
  });

  // -------------------------------------------------------------------------
  // A foto que a IA nao tratou — 16/09/2026, os creditos da OpenAI acabaram
  // -------------------------------------------------------------------------

  describe('"tenta de novo"', () => {
    const tratarEAvisar = (fotoId: string, pedido: string | null) =>
      (
        useCase as unknown as {
          tratarEAvisar(f: string, p: string | null, c: string): Promise<void>;
        }
      ).tratarEAvisar(fotoId, pedido, DE);

    let buscarFotoPorId: jest.Mock;

    beforeEach(() => {
      buscarFotoPorId = jest
        .fn()
        .mockResolvedValue({ id: 'f-9', status: 'RECEBIDA' });
      (catalogos as unknown as { buscarFotoPorId: jest.Mock }).buscarFotoPorId =
        buscarFotoPorId;
    });

    async function falhar() {
      tratar.execute.mockResolvedValueOnce({
        foto: { id: 'f-9', status: 'RECEBIDA' },
        recado: 'Não consegui tratar essa imagem agora.',
      });
      await tratarEAvisar('f-9', 'fundo rosa');
    }

    it('a falha e lembrada, e o comando refaz A MESMA foto com o mesmo pedido', async () => {
      await falhar();
      expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
        DE,
        'Não consegui tratar essa imagem agora.',
        // Pelo numero da Elena: o catalogo inteiro vive nele desde 25/09/2026.
        'ELENA',
      );
      expect(useCase.temFotoComFalha(DE)).toBe(true);

      tratar.execute.mockResolvedValue(null);
      const r = await useCase.tentarDeNovo(DE, 'Tenta de novo');

      expect(r?.motivo).toBe('foto_refazendo');
      expect(tratar.execute).toHaveBeenLastCalledWith('f-9', 'fundo rosa');
      expect(useCase.temFotoComFalha(DE)).toBe(false);
    });

    it.each(['tenta de novo', 'Tente novamente', 'refaz de novo', 'de novo'])(
      'aceita "%s"',
      async (texto) => {
        await falhar();
        tratar.execute.mockResolvedValue(null);
        expect((await useCase.tentarDeNovo(DE, texto))?.motivo).toBe(
          'foto_refazendo',
        );
      },
    );

    it('frase que so contem "de novo" NAO refaz foto', async () => {
      await falhar();

      expect(
        await useCase.tentarDeNovo(DE, 'manda de novo o relatorio'),
      ).toBeNull();
      expect(useCase.temFotoComFalha(DE)).toBe(true);
    });

    it('foto que ja saiu de RECEBIDA nao e refeita', async () => {
      await falhar();
      buscarFotoPorId.mockResolvedValue({ id: 'f-9', status: 'REPROVADA' });
      tratar.execute.mockClear();

      const r = await useCase.tentarDeNovo(DE, 'tenta de novo');

      expect(r?.motivo).toBe('refazer_sem_foto');
      expect(tratar.execute).not.toHaveBeenCalled();
    });

    it('sem falha lembrada, o comando nao e comigo', async () => {
      expect(await useCase.tentarDeNovo(DE, 'tenta de novo')).toBeNull();
    });

    it('o codigo da foto que falhou fica anotado — e a resposta diz como refazer', async () => {
      await falhar();
      sessao.esperarCodigo(DE, 'f-9', '#0004 Holiday');
      catalogos.atualizarFoto.mockResolvedValue({ status: 'RECEBIDA' });

      const r = await useCase.codigo(DE, 'AN24435', QUEM);

      expect(r?.motivo).toBe('codigo_anotado');
      expect(r?.resposta).toContain('#0004 Holiday');
      expect(r?.resposta).toContain('tenta de novo');
      expect(aprovou()).toBe(false);
    });
  });

  // O teste do Lucas em 16/09/2026, pelo WhatsApp local: foto sem codigo,
  // "Aprovo", "Anel de esmeralda" — e veio "Nao entendi se e sobre a foto".
  // So a SEGUNDA descricao chegou na busca; e a confirmacao final abriu com
  // um "essa foto" solto.
  it('"aprovo" sem codigo e a DESCRICAO em seguida: vai direto para a busca', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([FOTO('f-1', null)]);
    sessao.marcarEnviada(DE, 'f-1');
    listar.execute.mockResolvedValue([
      {
        codigoErp: 'AN24429',
        descricaoEtiqueta: 'ANEL ESMERALDA OVAL OB 18K',
        valorVenda: 38223,
        familia: 'ANEL',
        categoria: 'JOIA',
      },
    ]);

    const aprovo = await useCase.aprovacao(DE, QUEM, 'Aprovo');
    expect(aprovo?.motivo).toBe('aprovacao_sem_codigo');

    // A descricao NAO e resposta de aprovacao: o roteador segue para a busca.
    expect(await useCase.aprovacao(DE, QUEM, 'Anel de esmeralda')).toBeNull();
    const lista = await useCase.buscarPeca(DE, 'Anel de esmeralda', QUEM);
    expect(lista?.motivo).toBe('busca_com_opcoes');

    // O "2" do segundo teste: com a lista na tela, o numero tambem nao e
    // resposta de aprovacao — e levava a dica.
    expect(await useCase.aprovacao(DE, QUEM, '1')).toBeNull();
    const escolhida = await useCase.buscarPeca(DE, '1', QUEM);
    expect(escolhida?.motivo).toBe('foto_aprovada');
    // Abre com o CATALOGO, e nao com "essa foto".
    expect(escolhida?.resposta).toMatch(/^#0004 Holiday\nAN24429/);
    expect(escolhida?.resposta).not.toContain('essa foto');
  });

  it('se ela mandou refazer no meio, o codigo NAO publica a imagem nova', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([FOTO('f-1', null)]);
    await useCase.aprovacao(DE, QUEM, 'aprovo');

    // Entre o "aprovo" e o codigo, a foto voltou a ser tratada.
    catalogos.atualizarFoto.mockResolvedValue({ status: 'PROCESSANDO' });
    const r = await useCase.codigo(DE, 'AN24435', QUEM);

    expect(aprovou()).toBe(false);
    expect(r?.motivo).toBe('codigo_anotado');
  });

  it('sem "aprovo" antes, o codigo so anota — como sempre', async () => {
    sessao.esperarCodigo(DE, 'f-1', '#0003 Verão 2027');

    const r = await useCase.codigo(DE, 'AN24435', QUEM);

    expect(r?.motivo).toBe('codigo_anotado');
    expect(aprovou()).toBe(false);
  });

  it('"sim" com a lista de UMA peca na tela responde a lista, nao aprova', async () => {
    catalogos.listarEmAprovacao.mockResolvedValue([FOTO('f-1', null)]);
    sessao.esperarCodigo(DE, 'f-1', 'essa foto');
    sessao.oferecerEscolha(DE, [
      { codigo: 'AN24435', descricao: 'ANEL MASCULINO', preco: 26990 },
    ]);

    // null = "nao era comigo": o roteador leva o "sim" para `buscarPeca`.
    expect(await useCase.aprovacao(DE, QUEM, 'sim')).toBeNull();
    expect(aprovou()).toBe(false);
  });

  it('o "aprovo" com a lista na tela nao apaga a lista', async () => {
    // A mesma foto: a marca de aprovada entra, e o "2" que vier em seguida
    // ainda tem onde entrar.
    catalogos.listarEmAprovacao.mockResolvedValue([FOTO('f-1', null)]);
    sessao.esperarCodigo(DE, 'f-1', 'essa foto');
    sessao.oferecerEscolha(DE, [
      { codigo: 'AN24429', descricao: 'ANEL OVAL', preco: 38223 },
      { codigo: 'AN24435', descricao: 'ANEL MASCULINO', preco: 26990 },
    ]);

    await useCase.aprovacao(DE, QUEM, 'aprovo');
    const r = await useCase.buscarPeca(DE, '2', QUEM);

    expect(r?.motivo).toBe('foto_aprovada');
  });

  // -------------------------------------------------------------------------
  // A intenção antes da foto
  // -------------------------------------------------------------------------

  it.each([
    'Quero adicionar fotos ao catálogo #0001',
    'vou mandar as fotos',
    'preciso enviar umas imagens',
  ])('"%s" fala de mandar foto', (texto) => {
    expect(useCase.falaDeMandarFoto(texto)).toBe(true);
  });

  it.each(['quanto o catálogo vendeu?', 'bom dia', 'manda o relatório'])(
    '"%s" NAO fala de mandar foto',
    (texto) => {
      expect(useCase.falaDeMandarFoto(texto)).toBe(false);
    },
  );

  it('a intencao com o numero LEMBRA o catalogo — a foto nao pergunta de novo', async () => {
    const r = await useCase.intencao(
      DE,
      'Quero adicionar fotos ao catálogo #0001',
    );

    expect(r.motivo).toBe('catalogo_intencao');
    expect(r.resposta).toContain('#0001 Catalogo Rosa Pink');
    expect(sessao.catalogoAtual(DE)?.numero).toBe('0001');
    expect(useCase.conversaAberta(DE)).toBe(true);
  });

  it('a intencao sem numero pergunta o catalogo, e abre a conversa', async () => {
    const r = await useCase.intencao(DE, 'vou mandar as fotos');

    expect(r.resposta).toContain('De qual catálogo é?');
    expect(useCase.conversaAberta(DE)).toBe(true);
  });

  it('sem catalogo aberto, a intencao diz isso', async () => {
    catalogos.listarAbertos.mockResolvedValue([]);
    const r = await useCase.intencao(DE, 'vou mandar as fotos');
    expect(r.motivo).toBe('catalogo_nenhum_aberto');
  });

  // -------------------------------------------------------------------------
  // A conversa aberta: recibo, catálogo e código antes da foto
  // -------------------------------------------------------------------------

  it('sem conversa aberta, nada e do catalogo', async () => {
    expect(await useCase.continuarConversa(DE, 'Ok')).toBeNull();
  });

  it('com a conversa aberta, "Ok" e recibo', async () => {
    sessao.abrirConversa(DE);
    const r = await useCase.continuarConversa(DE, 'Ok');
    expect(r).toEqual({ resposta: null, motivo: 'catalogo_recibo' });
  });

  it('"#0003" antes da foto fica lembrado', async () => {
    sessao.abrirConversa(DE);

    const r = await useCase.continuarConversa(DE, '#0003');

    expect(r?.motivo).toBe('catalogo_lembrado');
    expect(sessao.catalogoAtual(DE)?.numero).toBe('0003');
  });

  it('o nome do catalogo tambem vale: "Verão 2027"', async () => {
    sessao.abrirConversa(DE);
    const r = await useCase.continuarConversa(DE, 'Verão 2027');
    expect(sessao.catalogoAtual(DE)?.numero).toBe('0003');
    expect(r?.motivo).toBe('catalogo_lembrado');
  });

  it('numero sozinho e catalogo, nunca codigo — a base tem o codigo `2`', async () => {
    sessao.abrirConversa(DE);
    produtos.buscarCodigosPresentesEm.mockResolvedValue(['2']);

    await useCase.continuarConversa(DE, '2');

    expect(sessao.catalogoAtual(DE)?.numero).toBe('0002');
    expect(sessao.retirarCodigoAdiantado(DE)).toBeNull();
  });

  it('"CO26185 6x" antes da foto fica guardado para a proxima', async () => {
    sessao.abrirConversa(DE);

    const r = await useCase.continuarConversa(DE, 'CO26185 6x');

    expect(r?.motivo).toBe('codigo_adiantado');
    expect(sessao.retirarCodigoAdiantado(DE)).toEqual({
      codigoErp: 'CO26185',
      parcelas: 6,
      juros: null,
    });
  });

  it('"vendas da loja 2" NAO e referencia — segue para a Anastasia', async () => {
    sessao.abrirConversa(DE);

    expect(await useCase.continuarConversa(DE, 'vendas da loja 2')).toBeNull();
    expect(sessao.catalogoAtual(DE)).toBeNull();
  });

  it('o codigo mandado com a foto esperando catalogo e anotado nela', async () => {
    sessao.pendurar(DE, {
      arquivoId: 'catalogo/pendentes/x.jpg',
      mime: 'image/jpeg',
      codigoErp: null,
      parcelas: null,
    });

    const r = await useCase.resposta(DE, QUEM, 'AN24435');

    expect(r.motivo).toBe('codigo_antes_do_catalogo');
    expect(r.resposta).toContain('Falta só o catálogo');
  });

  // -------------------------------------------------------------------------
  // A foto que expira avisa
  // -------------------------------------------------------------------------

  it('a foto que ficou sem catalogo AVISA quando expira, em vez de sumir', async () => {
    const agora = Date.now();
    const relogio = jest.spyOn(Date, 'now').mockReturnValue(agora);
    try {
      sessao.pendurar(DE, {
        arquivoId: 'catalogo/pendentes/pc.jpg',
        mime: 'image/jpeg',
        codigoErp: null,
        parcelas: null,
      });

      // Meia hora e um minuto depois, sem resposta.
      relogio.mockReturnValue(agora + 31 * 60 * 1000);
      await (
        useCase as unknown as { varrerExpiradas: () => Promise<void> }
      ).varrerExpiradas();

      expect(armazenamento.remover).toHaveBeenCalledWith(
        'catalogo/pendentes/pc.jpg',
      );
      expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
        DE,
        expect.stringContaining('descartei'),
      );
    } finally {
      relogio.mockRestore();
    }
  });

  it('a foto que ainda esta no prazo NAO e descartada', async () => {
    sessao.pendurar(DE, {
      arquivoId: 'catalogo/pendentes/pc.jpg',
      mime: 'image/jpeg',
      codigoErp: null,
      parcelas: null,
    });

    await (
      useCase as unknown as { varrerExpiradas: () => Promise<void> }
    ).varrerExpiradas();

    expect(armazenamento.remover).not.toHaveBeenCalled();
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });
});

/**
 * A CONSULTA DE PECA — a opcao 2 do menu, pedida pelo Lucas em 15/09/2026.
 *
 * O que estes testes protegem: a consulta SO LE (nenhuma foto e tocada), vale
 * para UMA mensagem, e responde pelas duas portas — codigo e descricao.
 */
describe('ProcessarFotoCatalogoUseCase — consultar uma peca', () => {
  const DE = '558586467241@c.us';

  let catalogos: { atualizarFoto: jest.Mock };
  let produtos: { findByCodigoErp: jest.Mock };
  let listar: { execute: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: ProcessarFotoCatalogoUseCase;

  beforeEach(() => {
    catalogos = { atualizarFoto: jest.fn().mockResolvedValue(undefined) };
    produtos = { findByCodigoErp: jest.fn().mockResolvedValue(null) };
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
      CONFERENCIA_NULA,
    );
  });

  it('sem ninguem ter pedido consulta, devolve null — segue para os agentes', async () => {
    expect(await useCase.consulta(DE, 'BR26252')).toBeNull();
  });

  it('o codigo devolve descricao, preco e saldo', async () => {
    produtos.findByCodigoErp.mockResolvedValue({
      codigoErp: 'BR26252',
      descricaoEtiqueta: 'BRINCO ESMERALDA OB 18K',
      valorVenda: 7490.37,
      estoqueAtual: 3,
      familia: 'BRINCO',
      categoria: 'JOIA',
    });

    useCase.pedirConsulta(DE);
    const r = await useCase.consulta(DE, 'br26252');

    expect(r?.motivo).toBe('consulta_por_codigo');
    expect(r?.resposta).toContain('BRINCO ESMERALDA OB 18K');
    // O CENTAVO FICA: quem consulta preco vai repetir o numero para alguem.
    expect(r?.resposta).toContain('7.490,37');
    // DISPONIVEL, E NAO QUANTOS — 25/09/2026. A peca tem 3 no fixture, e o
    // numero nao pode aparecer: a regra do canal do catalogo passou a ser a
    // mesma da vendedora.
    expect(r?.resposta).toContain('disponível');
    // Sem "3 em estoque" — e nao basta procurar o "3" solto, que aparece no
    // preco (7.490,37). O que nao pode existir e a frase da quantidade.
    expect(r?.resposta).not.toMatch(/d+s+em estoque/);
    expect(r?.resposta).not.toContain('em estoque');
    // SO LE: nenhuma foto e tocada.
    expect(catalogos.atualizarFoto).not.toHaveBeenCalled();
  });

  it('peca sem saldo diz isso, em vez de mostrar "0"', async () => {
    produtos.findByCodigoErp.mockResolvedValue({
      codigoErp: 'BR26252',
      descricaoEtiqueta: 'BRINCO ESMERALDA',
      valorVenda: 100,
      estoqueAtual: 0,
      familia: 'BRINCO',
      categoria: 'JOIA',
    });

    useCase.pedirConsulta(DE);
    const r = await useCase.consulta(DE, 'BR26252');

    expect(r?.resposta).toContain('indisponível');
  });

  it('a descricao devolve a lista, com preco em cada linha', async () => {
    listar.execute.mockResolvedValue([
      {
        codigoErp: 'CB384',
        descricaoEtiqueta: 'ANEL ESMERALDA OB 18K',
        valorVenda: 15900,
        familia: 'ANEL',
        categoria: 'JOIA',
      },
      {
        codigoErp: 'CB512',
        descricaoEtiqueta: 'ANEL ESMERALDA GOTA OB 18K',
        valorVenda: 18900,
        familia: 'ANEL',
        categoria: 'JOIA',
      },
    ]);

    useCase.pedirConsulta(DE);
    const r = await useCase.consulta(DE, 'anel de esmeralda');

    expect(r?.motivo).toBe('consulta_por_descricao');
    expect(r?.resposta).toContain('CB384');
    expect(r?.resposta).toContain('CB512');
  });

  it('codigo que nao existe no catalogo responde, e nao cala', async () => {
    useCase.pedirConsulta(DE);
    const r = await useCase.consulta(DE, 'XX99999');

    expect(r?.motivo).toBe('consulta_sem_resultado');
    expect(r?.resposta).toContain('XX99999');
  });

  it('RESPONDIDA, a consulta acaba: o "obrigado" seguinte nao e busca', async () => {
    // Ate 16/09/2026 este teste usava uma busca SEM resultado (o mock devolve
    // [] por padrao) — e assim travava o defeito: depois de um "nao achei" a
    // espera sumia. A regra e sobre a consulta RESPONDIDA, entao a busca aqui
    // tem de achar.
    listar.execute.mockResolvedValue([
      {
        codigoErp: 'CB384',
        descricaoEtiqueta: 'ANEL ESMERALDA OB 18K',
        valorVenda: 15900,
        familia: 'ANEL',
        categoria: 'JOIA',
      },
    ]);

    useCase.pedirConsulta(DE);
    const r = await useCase.consulta(DE, 'anel');

    expect(r?.motivo).toBe('consulta_por_descricao');
    expect(useCase.esperandoConsulta(DE)).toBe(false);
    expect(await useCase.consulta(DE, 'obrigado')).toBeNull();
  });

  // O caso real de 16/09/2026, pelo WhatsApp: "2", "Anel de diamente" (com o
  // erro), "anel de esmeralda" — e a segunda tentativa voltava a lista de
  // catalogos, porque a espera tinha sido apagada no "nao achei".
  it('SEM RESULTADO na descricao, a proxima mensagem ainda e a consulta', async () => {
    useCase.pedirConsulta(DE);
    const primeira = await useCase.consulta(DE, 'Anel de diamente');
    expect(primeira?.motivo).toBe('consulta_sem_resultado');

    // A resposta pediu outra tentativa — entao a espera tem de continuar.
    expect(useCase.esperandoConsulta(DE)).toBe(true);

    listar.execute.mockResolvedValue([
      {
        codigoErp: 'AN100',
        descricaoEtiqueta: 'ANEL DIAMANTE OB 18K',
        valorVenda: 9800,
        familia: 'ANEL',
        categoria: 'JOIA',
      },
    ]);
    const segunda = await useCase.consulta(DE, 'anel de diamante');

    expect(segunda?.motivo).toBe('consulta_por_descricao');
    expect(segunda?.resposta).toContain('AN100');
    // E depois de achar, acaba.
    expect(useCase.esperandoConsulta(DE)).toBe(false);
  });

  it('SEM RESULTADO no codigo, a proxima mensagem ainda e a consulta', async () => {
    useCase.pedirConsulta(DE);
    const primeira = await useCase.consulta(DE, 'XX99999');
    expect(primeira?.motivo).toBe('consulta_sem_resultado');
    // "Confere o codigo — ou me manda o nome dela": o convite pede resposta.
    expect(useCase.esperandoConsulta(DE)).toBe(true);

    produtos.findByCodigoErp.mockResolvedValue({
      codigoErp: 'BR26252',
      descricaoEtiqueta: 'BRINCO ESMERALDA OB 18K',
      valorVenda: 7490.37,
      estoqueAtual: 3,
      familia: 'BRINCO',
      categoria: 'JOIA',
    });
    const segunda = await useCase.consulta(DE, 'BR26252');

    expect(segunda?.motivo).toBe('consulta_por_codigo');
    expect(useCase.esperandoConsulta(DE)).toBe(false);
  });

  describe('falaDeConsultar — o pedido sem o menu (16/09/2026)', () => {
    it.each([
      ['consultar peça'],
      ['Consultar Peça?'],
      ['quanto custa o BR26252'],
      ['qual o preço do anel de diamante'],
      ['anel de diamante'],
      ['BR26252'],
      ['preciso de uma ajuda com uma peça aqui'],
    ])('"%s" e pedido de consulta', (texto) => {
      expect(useCase.falaDeConsultar(texto)).toBe(true);
    });

    it.each([
      ['vou mandar a foto da peça'], // foto vence: e envio
      ['obrigado'],
      ['quais catálogos estão abertos?'],
      ['bom trabalho a todos'],
    ])('"%s" NAO e pedido de consulta', (texto) => {
      expect(useCase.falaDeConsultar(texto)).toBe(false);
    });
  });

  it('pedido sem a peca ("consultar peça") pergunta qual, sem procurar', async () => {
    const r = await useCase.consultarAgora(DE, 'consultar peça');

    expect(r.motivo).toBe('catalogo_consulta_pedida');
    expect(listar.execute).not.toHaveBeenCalled();
    expect(useCase.esperandoConsulta(DE)).toBe(true);
  });

  it('as palavras do pedido saem antes de procurar; as da peca ficam cruas', async () => {
    useCase.pedirConsulta(DE);
    await useCase.consulta(DE, 'quero ver o preço da Aliança de ouro?');

    const busca = listar.execute.mock.calls[0][0].busca as string;
    expect(busca).not.toMatch(/quero|ver|preço|\?/i);
    // COM acento: `normalizar` decide o que sai, mas o que fica vai cru —
    // "alianca" nao casaria com "ALIANÇA" no ILIKE.
    expect(busca).toContain('Aliança');
    expect(busca).toContain('ouro');
  });

  it('pedir consulta NAO abre conversa de catalogo', () => {
    // Quem quer ver preco nao esta mandando foto: com a conversa aberta, o
    // "#0003" seguinte viraria escolha de catalogo em vez de busca.
    useCase.pedirConsulta(DE);

    expect(useCase.conversaAberta(DE)).toBe(false);
  });
});

/**
 * A CONFERENCIA DA FOTO — 15/09/2026.
 *
 * O Lucas mandou a foto do canto de um notebook e recebeu de volta uma
 * ferradura de metal, bem iluminada, sobre fundo branco. `/images/edits`
 * regera a imagem e so sabe devolver imagem: sem peca na entrada, ele produz
 * a peca mais provavel.
 *
 * O que estes testes protegem:
 *
 * 1. FOTO SEM PECA NAO E GRAVADA NEM TRATADA — a geracao, que e a chamada
 *    cara, nem sai.
 * 2. "NAO DEU PARA CONFERIR" NAO E "NAO SERVE". Provedor fora do ar nao pode
 *    fechar o canal do catalogo.
 * 3. A resposta diz O QUE FOI VISTO, senao a pessoa reenvia a mesma foto.
 */
describe('ProcessarFotoCatalogoUseCase — a conferencia da foto', () => {
  const DE = '558586467241@c.us';
  const IMAGEM = {
    url: 'http://waha:3000/api/files/default/foto.jpg',
    mimetype: 'image/jpeg',
  };

  let catalogos: {
    listarAbertos: jest.Mock;
    criarFoto: jest.Mock;
    listarEmAprovacao: jest.Mock;
    atualizarFoto: jest.Mock;
  };
  let armazenamento: { guardar: jest.Mock; mover: jest.Mock };
  let whatsapp: { baixarMidia: jest.Mock; enviarTexto: jest.Mock };
  let tratar: { execute: jest.Mock };
  let conferencia: { disponivel: jest.Mock; conferir: jest.Mock };
  let useCase: ProcessarFotoCatalogoUseCase;

  const mandarFoto = () =>
    useCase.foto({
      de: DE,
      nomeRemetente: 'Yerlon',
      legenda: '0003',
      imagem: IMAGEM,
    });

  beforeEach(() => {
    catalogos = {
      listarAbertos: jest
        .fn()
        .mockResolvedValue([
          { id: 'uuid-3', numero: '0003', nome: 'Verão 2027' },
        ]),
      criarFoto: jest.fn().mockResolvedValue({ id: 'f-1' }),
      // O rearme da aprovacao roda no inicio do metodo foto: sem a fila, ele
      // quebra antes de a conferencia acontecer.
      listarEmAprovacao: jest.fn().mockResolvedValue([]),
      atualizarFoto: jest.fn().mockResolvedValue(undefined),
    };
    armazenamento = {
      guardar: jest.fn().mockResolvedValue('catalogo/pendentes/a.jpg'),
      mover: jest.fn().mockResolvedValue('catalogo/0003/originais/a.jpg'),
    };
    whatsapp = {
      baixarMidia: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('jpeg'),
        mimetype: 'image/jpeg',
      }),
      enviarTexto: jest.fn(),
    };
    tratar = { execute: jest.fn().mockResolvedValue(null) };
    conferencia = {
      disponivel: jest.fn(() => true),
      conferir: jest.fn().mockResolvedValue({ serve: true }),
    };

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      armazenamento as never,
      {
        findByCodigoErp: jest.fn().mockResolvedValue(null),
        buscarCodigosPresentesEm: jest.fn().mockResolvedValue([]),
      } as never,
      whatsapp as never,
      new SessaoCatalogoService(),
      tratar as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      conferencia,
    );
  });

  it('foto SEM peca nao e gravada, nem tratada — e a resposta diz o que viu', async () => {
    conferencia.conferir.mockResolvedValue({
      serve: false,
      motivo: 'sem_peca',
      viu: 'um teclado de notebook',
    });

    const r = await mandarFoto();

    expect(r.motivo).toBe('foto_recusada_sem_peca');
    expect(r.resposta).toContain('um teclado de notebook');
    expect(r.resposta).toContain('Manda de novo');
    // A GERACAO NEM SAI: e a chamada cara, e o ponto do recurso.
    expect(tratar.execute).not.toHaveBeenCalled();
    expect(armazenamento.guardar).not.toHaveBeenCalled();
    expect(catalogos.criarFoto).not.toHaveBeenCalled();
  });

  it('varias pecas pede uma de cada vez', async () => {
    conferencia.conferir.mockResolvedValue({
      serve: false,
      motivo: 'varias_pecas',
      viu: 'tres aneis',
    });

    const r = await mandarFoto();

    expect(r.motivo).toBe('foto_recusada_varias_pecas');
    expect(r.resposta).toContain('cada peça');
  });

  it('sem o que o modelo viu, a resposta ainda diz o que fazer', async () => {
    conferencia.conferir.mockResolvedValue({
      serve: false,
      motivo: 'sem_peca',
    });

    const r = await mandarFoto();

    expect(r.resposta).toContain('Não consegui identificar');
    expect(r.resposta).toContain('boa luz');
  });

  it('NAO DEU PARA CONFERIR (null) deixa a foto passar', async () => {
    // Timeout, cota, chave ausente. Indisponibilidade do provedor nao pode
    // fechar o canal do catalogo.
    conferencia.conferir.mockResolvedValue(null);

    const r = await mandarFoto();

    expect(r.motivo).not.toContain('recusada');
    expect(armazenamento.guardar).toHaveBeenCalled();
  });

  it('foto com peca segue o caminho de sempre', async () => {
    const r = await mandarFoto();

    expect(r.motivo).not.toContain('recusada');
    expect(armazenamento.guardar).toHaveBeenCalled();
    expect(catalogos.criarFoto).toHaveBeenCalled();
  });

  it('a conferencia recebe a imagem BAIXADA, e nao a URL', async () => {
    await mandarFoto();

    const [imagem] = conferencia.conferir.mock.calls[0] as [
      { conteudo: Buffer; mime: string },
    ];
    expect(imagem.conteudo.toString()).toBe('jpeg');
    expect(imagem.mime).toBe('image/jpeg');
  });
});
