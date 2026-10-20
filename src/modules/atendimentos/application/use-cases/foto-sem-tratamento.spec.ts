import { ProcessarFotoCatalogoUseCase } from './processar-foto-catalogo.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';

/**
 * ============================================================================
 * RF31 — A FOTO ENTRA SEM TRATAMENTO, e a IA só age quando ela pede.
 *
 * Decisão do Lucas em 20/10/2026: *"por padrão não vai ser tratada. Ela vai
 * enviar a foto, você vai perguntar o catálogo e o código do produto e envia.
 * Mas ela pode pedir para tratar alguma foto — mas só se ela pedir."*
 *
 * É a inversão do fluxo. Até aqui TODA foto ia para a IA sozinha, e só a
 * versão gerada entrava no catálogo: `APROVADA` é a única que a montagem e a
 * exportação enxergam, e só se chegava lá vindo de `EM_APROVACAO`, que só o
 * tratamento produz. **Não existia caminho para uma foto crua entrar.**
 *
 * A aprovação existia porque a IA inventava uma imagem NOVA, e ninguém publica
 * o que não viu. Sem tratamento não há o que conferir — a foto é a que ela
 * mesma mandou e escolheu mandar.
 *
 * O QUE ESTE ARQUIVO PROTEGE: que ninguém religue o tratamento automático sem
 * perceber. O primeiro teste cai no instante em que o `tratarEAvisar` voltar
 * para dentro do `guardarFoto`.
 * ============================================================================
 */
describe('RF31 — a foto entra sem tratamento', () => {
  const DE = '558586467241@c.us';
  const QUEM = 'Yerlon Magalhães';
  const IMAGEM = {
    url: 'http://waha:3000/api/files/default/foto.jpg',
    mimetype: 'image/jpeg',
  };

  /** A conferência não participa: `null` = "não deu para conferir", segue. */
  const CONFERENCIA_NULA = {
    disponivel: () => true,
    conferir: jest.fn().mockResolvedValue(null),
  } as never;

  const NO_CATALOGO = {
    id: 'f-1',
    status: 'APROVADA',
    codigoErp: 'AN24435',
    arquivoId: 'catalogo/0003/originais/a.jpg',
    arquivoOriginalId: 'catalogo/0003/originais/a.jpg',
    remetente: QUEM,
    aprovadoPor: QUEM,
  };

  let catalogos: {
    listarAbertos: jest.Mock;
    criarFoto: jest.Mock;
    listarEmAprovacao: jest.Mock;
    atualizarFoto: jest.Mock;
    buscarFotoPorId: jest.Mock;
    buscarPorId: jest.Mock;
  };
  let tratar: { execute: jest.Mock };
  let sessao: SessaoCatalogoService;
  let useCase: ProcessarFotoCatalogoUseCase;

  const mandarFoto = (legenda: string) =>
    useCase.foto({ de: DE, nomeRemetente: QUEM, legenda, imagem: IMAGEM });

  /** O tratamento não é esperado por quem o dispara — e isso é de propósito. */
  const deixarRodar = () => new Promise((r) => setImmediate(r));

  const criadaCom = () =>
    catalogos.criarFoto.mock.calls[0]?.[0] as {
      status?: string;
      aprovadoPor?: string;
    };

  beforeEach(() => {
    catalogos = {
      listarAbertos: jest
        .fn()
        .mockResolvedValue([
          { id: 'uuid-3', numero: '0003', nome: 'Verão 2027' },
        ]),
      criarFoto: jest.fn().mockResolvedValue({ id: 'f-1' }),
      listarEmAprovacao: jest.fn().mockResolvedValue([]),
      atualizarFoto: jest.fn().mockResolvedValue({ status: 'EM_APROVACAO' }),
      buscarFotoPorId: jest.fn().mockResolvedValue(NO_CATALOGO),
      buscarPorId: jest
        .fn()
        .mockResolvedValue({ numero: '0003', nome: 'Verão 2027' }),
    };
    tratar = { execute: jest.fn().mockResolvedValue(null) };
    sessao = new SessaoCatalogoService();

    useCase = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      {
        guardar: jest.fn().mockResolvedValue('catalogo/pendentes/a.jpg'),
        mover: jest.fn().mockResolvedValue('catalogo/0003/originais/a.jpg'),
        remover: jest.fn(),
        ler: jest.fn(),
      } as never,
      {
        findByCodigoErp: jest.fn().mockResolvedValue({
          descricaoEtiqueta: 'ANEL MASCULINO ESMERALDA OB 18K',
          valorVenda: 26990,
        }),
        buscarCodigosPresentesEm: jest.fn().mockResolvedValue(['AN24435']),
      } as never,
      {
        baixarMidia: jest.fn().mockResolvedValue({
          conteudo: Buffer.from('jpeg'),
          mimetype: 'image/jpeg',
        }),
        enviarTexto: jest.fn(),
        enviarImagem: jest.fn(),
      } as never,
      sessao,
      tratar as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      CONFERENCIA_NULA,
    );
  });

  /* ESTE É O TESTE: religar o tratamento automático o derruba. */
  it('a foto COM código entra no catálogo, e a IA NÃO é chamada', async () => {
    const r = await mandarFoto('0003 AN24435');
    await deixarRodar();

    expect(tratar.execute).not.toHaveBeenCalled();
    expect(criadaCom().status).toBe('APROVADA');
    expect(criadaCom().aprovadoPor).toBe(QUEM);
    expect(r.resposta).toContain('Foto no catálogo');
    // E a frase deixou de prometer o que não vai acontecer.
    expect(r.resposta).not.toContain('tratando');
  });

  it('a foto SEM código espera o código — e também não é tratada', async () => {
    const r = await mandarFoto('0003');
    await deixarRodar();

    expect(tratar.execute).not.toHaveBeenCalled();
    expect(criadaCom().status).toBe('RECEBIDA');
    expect(r.resposta).toContain('assim que tiver o código');
  });

  it('a resposta CONVIDA a tratar — senão a opção existe e ninguém sabe', async () => {
    const r = await mandarFoto('0003 AN24435');

    expect(r.resposta).toContain('"trata"');
  });

  it('"trata" chama a IA, e leva o pedido de estilo junto', async () => {
    await mandarFoto('0003 AN24435');
    const r = await useCase.tratarAPedido(DE, 'trata deixando o fundo branco');
    await deixarRodar();

    expect(r?.motivo).toBe('foto_em_tratamento');
    expect(tratar.execute).toHaveBeenCalledWith(
      'f-1',
      'deixando o fundo branco',
    );
  });

  it('"trata" avisa que a peça SAI do catálogo até a nova ser aprovada', async () => {
    await mandarFoto('0003 AN24435');
    const r = await useCase.tratarAPedido(DE, 'trata');

    expect(r?.resposta).toContain('sai do catálogo');
  });

  it('sem foto guardada, "trata" não é comigo — segue para os agentes', async () => {
    expect(await useCase.tratarAPedido(DE, 'trata')).toBeNull();
  });

  it('"trata de novo" é REFAZER, e não é deste caminho', async () => {
    await mandarFoto('0003 AN24435');

    expect(await useCase.tratarAPedido(DE, 'trata de novo')).toBeNull();
    expect(tratar.execute).not.toHaveBeenCalled();
  });

  it('dois "trata" seguidos não gastam duas gerações', async () => {
    await mandarFoto('0003 AN24435');
    await useCase.tratarAPedido(DE, 'trata');
    await deixarRodar();

    // A segunda chega com a foto já na mão da IA.
    catalogos.buscarFotoPorId.mockResolvedValue({
      ...NO_CATALOGO,
      status: 'PROCESSANDO',
    });
    const segunda = await useCase.tratarAPedido(DE, 'trata');

    expect(segunda?.motivo).toBe('tratar_em_andamento');
    expect(tratar.execute).toHaveBeenCalledTimes(1);
  });

  it('texto qualquer NÃO é pedido de tratamento', async () => {
    await mandarFoto('0003 AN24435');

    expect(await useCase.tratarAPedido(DE, 'quanto vendi hoje?')).toBeNull();
    expect(await useCase.tratarAPedido(DE, 'aprovo')).toBeNull();
  });

  /**
   * A FALHA DA IA NÃO PODE TIRAR DO CATÁLOGO O QUE JÁ ESTAVA LÁ.
   *
   * O `TratarFotoUseCase` devolve a foto para `RECEBIDA` quando o provedor não
   * responde. Antes do RF31 isso era inofensivo — a foto nunca tinha entrado.
   * Agora ela JÁ ESTÁ no catálogo, e sumir dali por um erro de provedor seria
   * o pior tipo de defeito: o silencioso.
   */
  it('tratamento que falha devolve a foto ao catálogo', async () => {
    tratar.execute.mockResolvedValue({
      foto: { ...NO_CATALOGO, status: 'RECEBIDA', aprovadoPor: null },
      recado: null,
    });

    await mandarFoto('0003 AN24435');
    await useCase.tratarAPedido(DE, 'trata');
    await deixarRodar();

    expect(catalogos.atualizarFoto).toHaveBeenCalledWith(
      'f-1',
      expect.objectContaining({ status: 'APROVADA', aprovadoPor: QUEM }),
    );
  });
});
