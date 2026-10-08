import { RotearMensagemInternaUseCase } from './rotear-mensagem-interna.use-case';

/**
 * ==========================================================================
 * QUEM GERENCIA E VENDE TEM UM NUMERO SO — 07/10/2026.
 *
 * A Nathalia está cadastrada duas vezes, com o mesmo telefone: como
 * GERENTE_VENDAS no painel e como vendedora. E só tem o número da Helena.
 *
 * Até aqui o roteador parava na primeira identificação — vendedora ganhava e
 * a gestão nem era consultada. Metade do trabalho dela ficava sem canal: ela
 * via a própria carteira e não via a equipe.
 *
 * E o inverso era pior. Uma gerente que NÃO fosse vendedora ouvia "me chama
 * no outro número", apontando para um número que ninguém deu a ela — ficava
 * sem canal nenhum, e sem saber por quê.
 *
 * A REGRA NOVA, decidida pelo Lucas:
 *
 *   só vendedora          -> as coisas dela, como sempre
 *   só gerente de equipe  -> atendida na Helena, com as ferramentas de gestão
 *   as duas               -> os dois conjuntos na mesma conversa
 *
 * E QUEM VE A LOJA CONTINUA INDO PARA A ANASTASIA. O faturamento do grupo é
 * assunto daquele canal, e a Helena não tem — nem deve ter — ferramenta que
 * fale dele.
 * ==========================================================================
 */
/** Um duble que responde `false` a qualquer pergunta. Ver o bloco abaixo. */
const naoParaTudo = () =>
  new Proxy({}, { get: () => jest.fn(() => false) }) as never;

describe('o gerente de vendas na Helena', () => {
  const VENDEDORA = { id: 'vd-1', nome: 'Nathalia Alexandre', codigoErp: 'VD-0001', ativo: true };
  const GERENTE = { id: 'ad-1', nome: 'Nathalia', role: 'GERENTE_VENDAS' };
  const DIRETORIA = { id: 'ad-2', nome: 'Aline Pinho', role: 'ADMIN' };

  let identificarVendedora: { execute: jest.Mock };
  let identificarAdmin: { execute: jest.Mock };
  let canalVendedora: { execute: jest.Mock };
  let canalGestao: { execute: jest.Mock };
  let useCase: RotearMensagemInternaUseCase;

  beforeEach(() => {
    identificarVendedora = { execute: jest.fn().mockResolvedValue(null) };
    identificarAdmin = { execute: jest.fn().mockResolvedValue(null) };
    canalVendedora = {
      execute: jest.fn().mockResolvedValue({ resposta: 'da helena', motivo: 'conversa' }),
    };
    canalGestao = {
      execute: jest.fn().mockResolvedValue({ resposta: 'da anastasia', motivo: 'conversa' }),
    };

    useCase = new RotearMensagemInternaUseCase(
      identificarVendedora as never,
      identificarAdmin as never,
      canalVendedora as never,
      canalGestao as never,
      // ================================================================
      // O RESTO DO ROTEADOR NAO E EXERCITADO AQUI, e por isso vai num
      // Proxy: estes testes descrevem a decisao de QUEM atende, que
      // acontece antes do catalogo, da recepcao e da transcricao.
      //
      // `false` para tudo e o valor certo: cada um desses metodos responde
      // "tem foto esperando?", "e saudacao?", "fala de catalogo?" — e a
      // resposta que deixa a mensagem seguir o caminho reto e sempre nao.
      // ================================================================
      naoParaTudo(),
      naoParaTudo(),
      {
        numeroDoAgente: jest.fn().mockResolvedValue('5585999999999'),
        lidDoAgente: jest.fn().mockResolvedValue(null),
        baixarMidia: jest.fn(),
      } as never,
      { disponivel: () => false, transcrever: jest.fn() } as never,
      naoParaTudo(),
      // RF9: nao ha documento nestes testes, e o roteador so toca no leitor e
      // na analise quando a mensagem traz um.
      naoParaTudo(),
      naoParaTudo(),
    );
  });

  const escreve = (agente: 'ANASTASIA' | 'ELENA') =>
    useCase.execute({ de: '558586467241@c.us', texto: 'como foi a equipe hoje?', agente });

  /* ESTE É O TESTE. O resto é contorno. */
  it('gerente E vendedora: atendida na Helena, com o contexto de gestão junto', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    identificarAdmin.execute.mockResolvedValue(GERENTE);

    await escreve('ELENA');

    expect(canalVendedora.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        gestao: { usuarioId: 'ad-1', role: 'GERENTE_VENDAS' },
      }),
    );
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('só vendedora: nada muda — nenhum contexto de gestão', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    await escreve('ELENA');

    expect(canalVendedora.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ gestao: expect.anything() }),
    );
  });

  /**
   * O desvio custava o canal inteiro: ela ouvia "me chama no outro número"
   * apontando para um número que ninguém deu a ela.
   */
  it('só gerente de equipe: atendida na Helena, em vez de desviada', async () => {
    identificarAdmin.execute.mockImplementation((_tel: string, permissao?: string) =>
      // Gerente de equipe NÃO vê a loja: a consulta com permissão volta nula.
      Promise.resolve(permissao ? null : GERENTE),
    );

    const r = await escreve('ELENA');

    expect(canalGestao.execute).toHaveBeenCalled();
    expect(r.resposta).toBe('da anastasia'); // o conteúdo é de gestão...
    expect(r.motivo).not.toBe('desviado');   // ...mas sai pela Helena
  });

  it('quem VÊ A LOJA continua sendo desviado para a Anastasia', async () => {
    // A diretoria tem `analytics:read`: a consulta com permissão responde.
    identificarAdmin.execute.mockResolvedValue(DIRETORIA);

    const r = await escreve('ELENA');

    expect(canalGestao.execute).not.toHaveBeenCalled();
    expect(r.resposta).toContain('Anastasia');
  });

  /**
   * O caso que quase passou despercebido: sem o `!vendedora` no desvio, uma
   * vendedora que também fosse ADMIN seria mandada para a Anastasia e
   * perderia a própria carteira — o canal trocado sem ninguém decidir isso.
   */
  it('vendedora que também vê a loja NÃO é desviada', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    identificarAdmin.execute.mockResolvedValue(DIRETORIA);

    await escreve('ELENA');

    expect(canalVendedora.execute).toHaveBeenCalled();
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('na Anastasia, quem é as duas coisas continua caindo na gestão', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    identificarAdmin.execute.mockResolvedValue(GERENTE);

    await escreve('ANASTASIA');

    expect(canalGestao.execute).toHaveBeenCalled();
    expect(canalVendedora.execute).not.toHaveBeenCalled();
  });
});
