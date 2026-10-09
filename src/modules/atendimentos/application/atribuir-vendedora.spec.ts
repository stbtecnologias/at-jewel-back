import { FerramentasGestaoService } from './ferramentas-gestao.service';

const SEM_FOTOS = {
  buscar: async () => ({ fotos: [], tinhamUrl: 0, cortadas: 0 }),
} as never;

/**
 * ATRIBUIR UM CLIENTE SEM DONA A UMA VENDEDORA — 09/10/2026.
 *
 * ==========================================================================
 * A PRIMEIRA ESCRITA DA AGENTE SOBRE CADASTRO DE CLIENTE.
 *
 * Nasceu da lista de Ouro: 19 dos 48 não têm vendedora, e o primeiro
 * colocado — 39 compras — é um deles. A gestão vê a lista e diz de quem é.
 *
 * Os testes aqui protegem as quatro formas de isso causar estrago:
 *
 * 1. TIRAR CLIENTE DE QUEM JÁ TEM. Decisão do Lucas em 09/10: ela só
 *    preenche o que está em branco. Carteira define o que cada vendedora vê
 *    e recebe; trocar isso por uma frase ambígua é caro demais.
 *
 * 2. GRAVAR NO HOMÔNIMO ERRADO. "Maria" casa muitas pessoas, e escolher a
 *    primeira poria o cliente de alguém na carteira de outra sem aviso.
 *
 * 3. EXISTIR PARA QUEM NÃO PODE. Sem `clientes:write` a ferramenta não é
 *    sequer declarada ao modelo — escopo é ausência de caminho, não recusa.
 *
 * 4. DIZER "PRONTO" SEM TER GRAVADO. O `WHERE` pode recusar numa corrida com
 *    a sincronização do ERP, que mexe nos clientes com frequência.
 * ==========================================================================
 */
describe('atribuir vendedora ao cliente', () => {
  const cliente = (parcial: Record<string, unknown> = {}) => ({
    id: 'cli-1',
    nome: 'Cliente Um',
    codigoErp: 'C-900',
    vendedoraCodigoErp: null,
    ...parcial,
  });

  let clientes: {
    buscarPorNomeParcial: jest.Mock;
    atribuirVendedoraSeSemDona: jest.Mock;
  };
  let vendedoras: { buscarPorCodigoErp: jest.Mock };
  let resolverVendedora: { execute: jest.Mock };
  let servico: FerramentasGestaoService;

  beforeEach(() => {
    clientes = {
      buscarPorNomeParcial: jest.fn().mockResolvedValue([cliente()]),
      atribuirVendedoraSeSemDona: jest.fn().mockResolvedValue(true),
    };
    vendedoras = { buscarPorCodigoErp: jest.fn() };
    resolverVendedora = {
      execute: jest.fn().mockResolvedValue({
        status: 'OK',
        id: 'vd-1',
        nome: 'Ylka Franck',
        codigoErp: 'SEED-VD02',
      }),
    };
    servico = new FerramentasGestaoService(
      resolverVendedora as never,
      { execute: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { porMes: jest.fn(), porPeriodo: jest.fn() } as never,
      { porRecorte: jest.fn(), porDatas: jest.fn() } as never,
      { vendedoraDaSessao: (s: string) => s } as never,
      { listarSessoes: jest.fn().mockResolvedValue([]) } as never,
      { itens: jest.fn() } as never,
      { execute: jest.fn() } as never,
      SEM_FOTOS,
      { execute: jest.fn() } as never,
      { vendas: jest.fn(), metas: jest.fn() } as never,
      { semComprar: jest.fn(), maioresCompradores: jest.fn() } as never,
      { execute: jest.fn() } as never,
      { resumo: jest.fn(), listar: jest.fn() } as never,
      { doDia: jest.fn() } as never,
      { execute: jest.fn() } as never,
      vendedoras as never,
      clientes as never,
      { listarAguardandoGestao: jest.fn() } as never,
      { entre: jest.fn().mockResolvedValue([]) } as never,
    );
  });

  const podeEscrever = () => servico.montar({ podeAtribuirCarteira: true });

  it('SEM a permissão, a ferramenta NÃO EXISTE', () => {
    // Não é "existe e recusa": é não existir. Sem a chave no objeto, o
    // cliente do LLM não declara a ferramenta, e o modelo não chega a
    // oferecer o que não pode fazer.
    expect(servico.montar().gestaoAtribuirVendedora).toBeUndefined();
    expect(
      servico.montar({ podeAtribuirCarteira: false }).gestaoAtribuirVendedora,
    ).toBeUndefined();
    expect(podeEscrever().gestaoAtribuirVendedora).toBeDefined();
  });

  it('grava quando o cliente está sem vendedora', async () => {
    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Cliente Um',
      vendedora: 'Ylka',
    });

    expect(clientes.atribuirVendedoraSeSemDona).toHaveBeenCalledWith(
      'cli-1',
      'SEED-VD02',
    );
    expect(r.mensagem).toContain('Cliente Um');
    expect(r.mensagem).toContain('Ylka Franck');
  });

  it('NÃO sobrescreve quem já tem vendedora — e diz de quem é', async () => {
    clientes.buscarPorNomeParcial.mockResolvedValue([
      cliente({ vendedoraCodigoErp: 'SEED-VD01' }),
    ]);
    vendedoras.buscarPorCodigoErp.mockResolvedValue({ nome: 'Marina' });

    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Cliente Um',
      vendedora: 'Ylka',
    });

    expect(clientes.atribuirVendedoraSeSemDona).not.toHaveBeenCalled();
    expect(r.mensagem).toContain('Marina');
    expect(r.mensagem).toContain('NÃO alterei nada');
  });

  it('com homônimo NÃO grava, e pede para escolher pelo código', async () => {
    clientes.buscarPorNomeParcial.mockResolvedValue([
      cliente({ id: 'cli-1', nome: 'Maria Silva', codigoErp: 'C-1' }),
      cliente({ id: 'cli-2', nome: 'Maria Souza', codigoErp: 'C-2' }),
    ]);

    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Maria',
      vendedora: 'Ylka',
    });

    expect(clientes.atribuirVendedoraSeSemDona).not.toHaveBeenCalled();
    expect(r.mensagem).toContain('C-1');
    expect(r.mensagem).toContain('C-2');
  });

  it('vendedora fora da equipe não recebe cliente nenhum', async () => {
    const r = await servico
      .montar({ podeAtribuirCarteira: true, equipe: ['vd-99'] })
      .gestaoAtribuirVendedora!({ cliente: 'Cliente Um', vendedora: 'Ylka' });

    expect(clientes.atribuirVendedoraSeSemDona).not.toHaveBeenCalled();
    // E não chega nem a PROCURAR o cliente: a vendedora é resolvida antes,
    // então a resposta não fala de um cliente que ela não podia alcançar.
    expect(clientes.buscarPorNomeParcial).not.toHaveBeenCalled();
    expect(r.mensagem).toContain('Nada foi alterado');
  });

  it('nome de vendedora ambíguo não grava', async () => {
    resolverVendedora.execute.mockResolvedValue({
      status: 'AMBIGUA',
      nomes: ['Ylka Franck', 'Ylka Moura'],
    });

    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Cliente Um',
      vendedora: 'Ylka',
    });

    expect(clientes.atribuirVendedoraSeSemDona).not.toHaveBeenCalled();
    expect(r.mensagem).toContain('Ylka Moura');
  });

  it('vendedora sem código no ERP não recebe carteira', async () => {
    resolverVendedora.execute.mockResolvedValue({
      status: 'OK',
      id: 'vd-1',
      nome: 'Ylka Franck',
      codigoErp: null,
    });

    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Cliente Um',
      vendedora: 'Ylka',
    });

    expect(clientes.atribuirVendedoraSeSemDona).not.toHaveBeenCalled();
    expect(r.mensagem).toContain('não tem código no ERP');
  });

  it('se a escrita não pegou, NÃO diz que deu certo', async () => {
    // A corrida real: a sincronização do ERP preencheu a coluna entre a
    // leitura e o UPDATE. O `WHERE` recusou, e a resposta tem de contar —
    // dizer "pronto" aqui seria a resposta confiante e errada.
    clientes.atribuirVendedoraSeSemDona.mockResolvedValue(false);

    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Cliente Um',
      vendedora: 'Ylka',
    });

    expect(r.mensagem).not.toContain('Pronto');
    expect(r.mensagem).toContain('NÃO');
  });

  it('cliente que não existe não vira gravação', async () => {
    clientes.buscarPorNomeParcial.mockResolvedValue([]);

    const r = await podeEscrever().gestaoAtribuirVendedora!({
      cliente: 'Fulano',
      vendedora: 'Ylka',
    });

    expect(clientes.atribuirVendedoraSeSemDona).not.toHaveBeenCalled();
    expect(r.mensagem).toContain('Nada foi alterado');
  });
});
