import { NotFoundException } from '@nestjs/common';
import { ConexoesService } from './conexoes.service';
import { SessoesDaCasaService } from './sessoes-da-casa.service';

/**
 * A LISTA DE CONEXOES E DERIVADA, E O NOME DA SESSAO E BARREIRA.
 *
 * Duas coisas diferentes sao protegidas aqui:
 *
 *   1. cadastrar uma vendedora tem que bastar para ela aparecer com o botao de
 *      Conectar — foi o pedido do Lucas em 08/09, e o jeito de nao ter cadastro
 *      de conexao a manter em lugar nenhum;
 *
 *   2. o nome da sessao entra no CAMINHO da URL do WAHA levando a nossa API
 *      key junto. Sem `exigirValida`, as rotas do painel virariam um proxy
 *      aberto para o WAHA inteiro.
 */
describe('ConexoesService', () => {
  const ID_MARINA = '11111111-2222-3333-4444-555555555555';
  const SESSAO_MARINA = `vend-${ID_MARINA}`;

  let waha: {
    listarSessoes: jest.Mock;
    contarChats: jest.Mock;
  };
  let vendedoras: { listar: jest.Mock; buscarPorId: jest.Mock };
  let service: ConexoesService;

  function vendedora(id: string, nome: string) {
    return { id, nome };
  }

  beforeEach(() => {
    waha = {
      listarSessoes: jest.fn().mockResolvedValue([]),
      contarChats: jest.fn().mockResolvedValue(3),
    };
    vendedoras = {
      listar: jest.fn().mockResolvedValue([]),
      buscarPorId: jest.fn().mockResolvedValue(null),
    };
    // Um numero so — `WAHA_SESSION` = 'default' e nenhuma Elena. E o estado
    // de producao ate o segundo chip ser conectado, e o que estes testes
    // descrevem. O servico vai INTEIRO: e ele quem responde "e da casa?".
    const config = {
      get: jest.fn((k: string) => (k === 'WAHA_SESSION' ? 'default' : undefined)),
    };

    service = new ConexoesService(
      waha as never,
      new SessoesDaCasaService(config as never),
      vendedoras as never,
    );
  });

  describe('o nome da sessao', () => {
    it('deriva do id da vendedora, e volta dele', () => {
      expect(service.nomeDaSessao(ID_MARINA)).toBe(SESSAO_MARINA);
      expect(service.vendedoraDaSessao(SESSAO_MARINA)).toBe(ID_MARINA);
    });

    it('nao confunde a sessao da loja com a de uma vendedora', () => {
      expect(service.vendedoraDaSessao('default')).toBeNull();
    });
  });

  describe('exigirValida — a barreira', () => {
    it('deixa passar a sessao da loja', async () => {
      await expect(service.exigirValida('default')).resolves.toBeUndefined();
    });

    it('deixa passar a vendedora que existe', async () => {
      vendedoras.buscarPorId.mockResolvedValue(vendedora(ID_MARINA, 'Marina'));
      await expect(service.exigirValida(SESSAO_MARINA)).resolves.toBeUndefined();
    });

    /** Desligada ainda passa: a sessao dela pode estar no ar, e desconectar
     *  precisa continuar possivel. Quem some da lista e outra coisa. */
    it('deixa passar vendedora desligada — ela precisa poder ser desconectada', async () => {
      vendedoras.buscarPorId.mockResolvedValue(vendedora(ID_MARINA, 'Marina'));
      vendedoras.listar.mockResolvedValue([]);
      await expect(service.exigirValida(SESSAO_MARINA)).resolves.toBeUndefined();
    });

    it('recusa vendedora que nao existe', async () => {
      vendedoras.buscarPorId.mockResolvedValue(null);
      await expect(service.exigirValida(SESSAO_MARINA)).rejects.toThrow(
        NotFoundException,
      );
    });

    /**
     * O QUE ESTE TESTE REALMENTE PROTEGE.
     *
     * Cada uma destas strings, se passasse, viraria uma chamada ao WAHA com a
     * nossa API key — para uma sessao alheia, para outro endpoint, ou para
     * fora do host. Nenhuma delas casa com o formato `vend-<uuid>`.
     */
    it.each([
      ['sessao alheia', 'outra-empresa'],
      ['travessia de caminho', '../sessions/default'],
      ['barra no meio', 'vend-11111111-2222-3333-4444-555555555555/auth/qr'],
      ['prefixo sem uuid', 'vend-qualquercoisa'],
      ['uuid solto, sem prefixo', '11111111-2222-3333-4444-555555555555'],
      ['vazio', ''],
      ['curinga', '*'],
    ])('recusa %s', async (_rotulo, entrada) => {
      await expect(service.exigirValida(entrada)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listar', () => {
    it('a loja vem primeiro, mesmo sem nenhuma vendedora', async () => {
      const linhas = await service.listar();
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        sessao: 'default',
        papel: 'LOJA',
        vendedoraId: null,
      });
    });

    /** O PEDIDO DO LUCAS: cadastrou, aparece com o botao de conectar. */
    it('vendedora nova aparece sem sessao nenhuma no WAHA, como STOPPED', async () => {
      vendedoras.listar.mockResolvedValue([vendedora(ID_MARINA, 'Marina Duarte')]);

      const linhas = await service.listar();

      expect(linhas[1]).toMatchObject({
        sessao: SESSAO_MARINA,
        rotulo: 'Vendedora: Marina Duarte',
        vendedoraId: ID_MARINA,
        papel: 'VENDEDORA',
        status: 'STOPPED',
        numero: null,
      });
    });

    it('casa o estado que o WAHA reporta com a vendedora certa', async () => {
      vendedoras.listar.mockResolvedValue([vendedora(ID_MARINA, 'Marina Duarte')]);
      waha.listarSessoes.mockResolvedValue([
        {
          nome: SESSAO_MARINA,
          status: 'WORKING',
          me: { id: '558598712344@c.us', pushName: 'Marina' },
          atividadeEm: 1788866158986,
        },
      ]);

      const [, marina] = await service.listar();

      expect(marina).toMatchObject({
        status: 'WORKING',
        numero: '558598712344@c.us',
        chats: 3,
      });
    });

    /** So a conectada custa a chamada extra da contagem. */
    it('nao conta chats de quem nao esta conectada', async () => {
      vendedoras.listar.mockResolvedValue([vendedora(ID_MARINA, 'Marina Duarte')]);
      await service.listar();
      expect(waha.contarChats).not.toHaveBeenCalled();
    });

    /**
     * UM NUMERO LIGADO QUE NINGUEM ENXERGA E O QUE NAO PODE EXISTIR.
     *
     * A vendedora sai da empresa, some da lista de ativas — e a sessao dela
     * continua conectada, lendo tudo. Sem esta linha, so o WAHA saberia.
     */
    it('mostra a sessao orfa de quem foi desligada', async () => {
      vendedoras.listar.mockResolvedValue([]);
      waha.listarSessoes.mockResolvedValue([
        {
          nome: SESSAO_MARINA,
          status: 'WORKING',
          me: { id: '558598712344@c.us' },
          atividadeEm: null,
        },
      ]);

      const linhas = await service.listar();

      expect(linhas).toHaveLength(2);
      expect(linhas[1]).toMatchObject({
        sessao: SESSAO_MARINA,
        papel: 'ORFA',
        vendedoraId: ID_MARINA,
        status: 'WORKING',
      });
    });

    it('nao duplica a vendedora que ja tem sessao', async () => {
      vendedoras.listar.mockResolvedValue([vendedora(ID_MARINA, 'Marina Duarte')]);
      waha.listarSessoes.mockResolvedValue([
        { nome: 'default', status: 'WORKING', me: null, atividadeEm: null },
        { nome: SESSAO_MARINA, status: 'WORKING', me: null, atividadeEm: null },
      ]);

      const linhas = await service.listar();

      expect(linhas).toHaveLength(2);
      expect(linhas.filter((l) => l.sessao === SESSAO_MARINA)).toHaveLength(1);
    });
  });
});
