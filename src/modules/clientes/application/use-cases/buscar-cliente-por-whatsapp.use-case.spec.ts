import { randomBytes } from 'crypto';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { BuscarClientePorWhatsappUseCase } from './buscar-cliente-por-whatsapp.use-case';

function makeClienteRepoMock(): jest.Mocked<IClienteRepository> {
  return {
    criarComPerfil: jest.fn(),
    buscarPorId: jest.fn(),
    buscarPorCodigoErp: jest.fn(),
    buscarPorTelefone1Hash: jest.fn(),
    // O PADRAO E "NAO ACHOU": desde o RF41 o caminho do telefone de cadastro
    // roda SEMPRE que o `whatsapp_hash` falha, entao todo teste antigo passa
    // por aqui. Sem o padrao eles quebrariam por mock faltando, e nao por
    // comportamento.
    listarPorTelefone1Hash: jest.fn().mockResolvedValue([]),
    buscarPorEmailHash: jest.fn(),
    listar: jest.fn(),
    atualizar: jest.fn(),
  } as unknown as jest.Mocked<IClienteRepository>;
}

/** Um cliente qualquer, para quando o teste so precisa de id e nome. */
function umCliente(id: string, nome = 'Maria'): Cliente {
  return Cliente.create({
    id,
    nome,
    tipoPessoa: 'fisica',
    tabelaPreco: 'varejo',
    ativo: true,
  });
}

function makePerfilRepoMock(): jest.Mocked<IClientePerfilRepository> {
  return {
    buscarPorClienteId: jest.fn(),
    buscarPorWhatsappHash: jest.fn(),
    atualizar: jest.fn(),
    deletar: jest.fn(),
  } as unknown as jest.Mocked<IClientePerfilRepository>;
}

describe('BuscarClientePorWhatsappUseCase', () => {
  const ORIGINAL_ENV = { ...process.env };
  let useCase: BuscarClientePorWhatsappUseCase;
  let clienteRepo: jest.Mocked<IClienteRepository>;
  let perfilRepo: jest.Mocked<IClientePerfilRepository>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    clienteRepo = makeClienteRepoMock();
    perfilRepo = makePerfilRepoMock();
    useCase = new BuscarClientePorWhatsappUseCase(clienteRepo, perfilRepo);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('retorna null se whatsapp nao encontrado', async () => {
    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);

    const resultado = await useCase.execute('85988887777');

    expect(resultado).toBeNull();
    expect(clienteRepo.buscarPorId).not.toHaveBeenCalled();
  });

  it('busca por hash normalizado (remove formatacao)', async () => {
    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);

    await useCase.execute('(85) 9 8888-7777');

    const hashEsperado = hashField('85988887777');
    expect(perfilRepo.buscarPorWhatsappHash).toHaveBeenCalledWith(hashEsperado);
  });

  it('quando encontra perfil, busca cliente completo com perfil', async () => {
    const perfil = ClientePerfil.create({
      clienteId: 'uuid-cliente',
      whatsapp: '85988887777',
      whatsappHash: 'hash',
      estadoConversa: 'TRIAGE_IN_PROGRESS',
    });
    const cliente = Cliente.create({
      id: 'uuid-cliente',
      nome: 'Maria',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
      perfil,
    });
    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(perfil);
    clienteRepo.buscarPorId.mockResolvedValue(cliente);

    const resultado = await useCase.execute('85988887777');

    expect(resultado).toBe(cliente);
    expect(clienteRepo.buscarPorId).toHaveBeenCalledWith('uuid-cliente', {
      incluirPerfil: true,
    });
  });
  // Caso real de 17/08/2026: o cadastro tem o nono digito, mas a conta de
  // WhatsApp e anterior a mudanca e o evento chega sem ele. Sem tolerancia, o
  // lookup daria 404 e o agente criaria um cliente duplicado a cada conversa.
  it('encontra o cliente cadastrado COM nono digito quando o WhatsApp manda SEM', async () => {
    const clienteRepo = makeClienteRepoMock();
    const perfilRepo = makePerfilRepoMock();
    const useCase = new BuscarClientePorWhatsappUseCase(
      clienteRepo,
      perfilRepo,
    );

    const hashCadastrado = hashField('5585986467241');
    const perfil = ClientePerfil.create({
      clienteId: 'uuid-cliente',
      whatsapp: '5585986467241',
      whatsappHash: hashCadastrado,
      estadoConversa: 'TRIAGE_IN_PROGRESS',
    });
    const cliente = Cliente.create({
      id: 'uuid-cliente',
      nome: 'Maria',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
      perfil,
    });

    perfilRepo.buscarPorWhatsappHash.mockImplementation(async (hash: string) =>
      hash === hashCadastrado ? perfil : null,
    );
    clienteRepo.buscarPorId.mockResolvedValue(cliente);

    // Como o WhatsApp entrega: sem o nono digito.
    const resultado = await useCase.execute('558586467241');

    expect(resultado).toBe(cliente);
  });

  it('encontra o cliente cadastrado SEM DDI quando a busca vem COM DDI', async () => {
    const clienteRepo = makeClienteRepoMock();
    const perfilRepo = makePerfilRepoMock();
    const useCase = new BuscarClientePorWhatsappUseCase(
      clienteRepo,
      perfilRepo,
    );

    const hashCadastrado = hashField('85986467241');
    const perfil = ClientePerfil.create({
      clienteId: 'uuid-cliente',
      whatsapp: '85986467241',
      whatsappHash: hashCadastrado,
      estadoConversa: 'TRIAGE_IN_PROGRESS',
    });
    const cliente = Cliente.create({
      id: 'uuid-cliente',
      nome: 'Maria',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
      perfil,
    });

    perfilRepo.buscarPorWhatsappHash.mockImplementation(async (hash: string) =>
      hash === hashCadastrado ? perfil : null,
    );
    clienteRepo.buscarPorId.mockResolvedValue(cliente);

    expect(await useCase.execute('5585986467241')).toBe(cliente);
  });

  it('numero realmente desconhecido continua devolvendo null', async () => {
    const clienteRepo = makeClienteRepoMock();
    const perfilRepo = makePerfilRepoMock();
    const useCase = new BuscarClientePorWhatsappUseCase(
      clienteRepo,
      perfilRepo,
    );

    perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);

    expect(await useCase.execute('5511999990000')).toBeNull();
    expect(clienteRepo.buscarPorId).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // O TELEFONE DO CADASTRO — RF41, 20/10/2026.
  //
  // Em producao `clientes_perfil` tem 0 linhas e `clientes.telefone_1_hash`
  // esta preenchida em 774 de 1.110. Olhando so a primeira, o reconhecimento
  // nunca achava ninguem — e a conversa de cliente que existe no ERP tomava o
  // galho do lead.
  // ==========================================================================
  describe('a queda para o telefone do cadastro', () => {
    it('acha o cliente por `telefone_1_hash` quando nao ha perfil nenhum', async () => {
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);
      const cliente = umCliente('uuid-cliente');
      clienteRepo.listarPorTelefone1Hash.mockImplementation(
        async (hash: string) =>
          hash === hashField('5585986467241') ? [cliente] : [],
      );
      clienteRepo.buscarPorId.mockResolvedValue(cliente);

      expect(await useCase.execute('5585986467241')).toBe(cliente);
      // DE NOVO POR ID, para vir com perfil como no caminho do WhatsApp: quem
      // chama recebe a mesma coisa, venha de onde vier.
      expect(clienteRepo.buscarPorId).toHaveBeenCalledWith('uuid-cliente', {
        incluirPerfil: true,
      });
    });

    it('tenta as variantes tambem no telefone — cadastro SEM DDI, WhatsApp COM', async () => {
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);
      const cliente = umCliente('uuid-cliente');
      clienteRepo.listarPorTelefone1Hash.mockImplementation(
        async (hash: string) =>
          hash === hashField('85986467241') ? [cliente] : [],
      );
      clienteRepo.buscarPorId.mockResolvedValue(cliente);

      expect(await useCase.execute('5585986467241')).toBe(cliente);
    });

    // ========================================================================
    // E AQUI ELE NAO ADIVINHA.
    //
    // A coluna nao e unica desde a migracao 36: medido em 20/10, 19 numeros
    // servem a mais de um cliente e um deles serve a OITO — todos com
    // aparencia de numero real, conferidos um a um (mae e filha, fixo da
    // empresa). `buscarPorTelefone1Hash` devolveria o MAIS ANTIGO, e a
    // conversa iria para a pessoa errada em silencio.
    // ========================================================================
    it('telefone que serve a dois clientes e AMBIGUIDADE, e devolve null', async () => {
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);
      clienteRepo.listarPorTelefone1Hash.mockResolvedValue([
        umCliente('mais-antigo', 'Maria'),
        umCliente('mais-novo', 'Joana'),
      ]);

      expect(await useCase.execute('5585986467241')).toBeNull();
      // Nem o mais antigo: nao houve escolha nenhuma.
      expect(clienteRepo.buscarPorId).not.toHaveBeenCalled();
    });

    it('variantes diferentes apontando para clientes diferentes tambem e ambiguidade', async () => {
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);
      // O MOTIVO DE VARRER TODAS ANTES DE DECIDIR: parando na primeira que
      // acha, o resultado dependeria da ordem das variantes — e seria um
      // cliente legitimo, escolhido por acidente de ordenacao.
      clienteRepo.listarPorTelefone1Hash.mockImplementation(
        async (hash: string) => {
          if (hash === hashField('5585986467241'))
            return [umCliente('com-ddi')];
          if (hash === hashField('85986467241')) return [umCliente('sem-ddi')];
          return [];
        },
      );

      expect(await useCase.execute('5585986467241')).toBeNull();
    });

    it('o mesmo cliente achado por duas variantes NAO e ambiguidade', async () => {
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);
      const cliente = umCliente('uuid-cliente');
      // As quatro formas do mesmo numero podem cair no mesmo registro; isso e
      // o caso COMUM, e nao conflito. A deduplicacao e por `id`.
      clienteRepo.listarPorTelefone1Hash.mockResolvedValue([cliente]);
      clienteRepo.buscarPorId.mockResolvedValue(cliente);

      expect(await useCase.execute('5585986467241')).toBe(cliente);
    });

    it('o `whatsapp_hash` ganha: achando por ele, nao olha o telefone', async () => {
      const perfil = ClientePerfil.create({
        clienteId: 'uuid-cliente',
        whatsapp: '5585986467241',
        whatsappHash: hashField('5585986467241'),
        estadoConversa: 'TRIAGE_IN_PROGRESS',
      });
      const cliente = umCliente('uuid-cliente');
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(perfil);
      clienteRepo.buscarPorId.mockResolvedValue(cliente);

      expect(await useCase.execute('5585986467241')).toBe(cliente);
      // O numero que a pessoa USA para falar com a loja e unico por perfil:
      // achando por ele, nao existe ambiguidade a consultar.
      expect(clienteRepo.listarPorTelefone1Hash).not.toHaveBeenCalled();
    });

    it('cliente sem id na entidade nao conta como achado', async () => {
      perfilRepo.buscarPorWhatsappHash.mockResolvedValue(null);
      // `id` so existe depois de persistida; sem ele nao ha o que vincular.
      clienteRepo.listarPorTelefone1Hash.mockResolvedValue([
        Cliente.create({
          nome: 'Maria',
          tipoPessoa: 'fisica',
          tabelaPreco: 'varejo',
          ativo: true,
        }),
      ]);

      expect(await useCase.execute('5585986467241')).toBeNull();
      expect(clienteRepo.buscarPorId).not.toHaveBeenCalled();
    });
  });
});
