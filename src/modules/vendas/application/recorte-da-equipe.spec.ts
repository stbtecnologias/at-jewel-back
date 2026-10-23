import { AtendimentosController } from '../../atendimentos/infrastructure/http/controllers/atendimentos.controller';
import { MetasController } from '../../metas/infrastructure/http/controllers/metas.controller';
import { VendedorasController } from '../../vendedoras/infrastructure/http/controllers/vendedoras.controller';

/**
 * O RECORTE DA EQUIPE VALE EM TODA PORTA — 23/10/2026.
 *
 * ==========================================================================
 * O PEDIDO: *"o perfil de gerente de vendas não pode ver essas vendedoras e
 * tudo que contém elas — Faby Lima, Aline Pinho, Loja, Daniele Reis. Não
 * aparece na Helena e nem no painel: os rankings de vendas, as próprias
 * vendas."* E o complemento: *"a gestão (admin) vê todas; apenas gerente de
 * vendas vê a equipe dela."*
 *
 * O MECANISMO JÁ EXISTIA E NÃO ERA CONSULTADO. A equipe é da migração 67, de
 * 28/09; o cadastro foi feito em produção em 23/10. A tela de Vendas e as duas
 * agentes já perguntavam por ela — **estas três não**.
 *
 * ESTE ARQUIVO É IRMÃO DO `clientes.controller.spec.ts`, e pela mesma lição:
 * *"campo sensível não se protege no serializador, se protege em TODA porta
 * por onde ele sai"*. Aqui o que sai não é um telefone, é a existência de uma
 * vendedora e os números dela — e as portas são três.
 *
 * QUANDO ACRESCENTAR UMA ROTA QUE DEVOLVA VENDEDORA, acrescente o caso aqui.
 * ==========================================================================
 */

/** A equipe da gerente: duas vendedoras. A terceira é de fora. */
const DA_EQUIPE = ['v-1', 'v-2'];
const DE_FORA = 'v-9';

const REQ_GERENTE = { user: { sub: 'u-gerente' } };
const REQ_ADMIN = { user: { sub: 'u-admin' } };
/** Chave de API: o guard não popula `req.user`. É a integração do ERP. */
const REQ_CHAVE = {};

/**
 * O escopo dublado: a gerente tem equipe, a admin não (`null`), e é só isso
 * que separa quem vê tudo de quem vê a equipe.
 */
function escopoDublado() {
  return {
    equipeDoUsuario: jest.fn((sub: string) =>
      Promise.resolve(sub === 'u-gerente' ? DA_EQUIPE : null),
    ),
  };
}

describe('o recorte da equipe, porta por porta', () => {
  // =========================================================================
  // 1. VENDEDORAS — a lista dos filtros e a ficha
  // =========================================================================
  describe('vendedoras', () => {
    const VENDEDORAS = [
      { id: 'v-1', toPublic: () => ({ id: 'v-1', nome: 'Camila' }) },
      { id: 'v-2', toPublic: () => ({ id: 'v-2', nome: 'Ylka' }) },
      { id: DE_FORA, toPublic: () => ({ id: DE_FORA, nome: 'Faby' }) },
    ];

    function montar() {
      const escopo = escopoDublado();
      const listar = { execute: jest.fn().mockResolvedValue(VENDEDORAS) };
      const buscar = {
        execute: jest.fn((id: string) =>
          Promise.resolve(VENDEDORAS.find((v) => v.id === id)),
        ),
      };
      const porIdErp = {
        execute: jest.fn().mockResolvedValue(VENDEDORAS[2]),
      };
      const nada = { execute: jest.fn() } as never;
      const controller = new VendedorasController(
        nada, // criar
        buscar as never,
        porIdErp as never,
        listar as never,
        nada, // listarDisponiveis
        nada, // atualizar
        nada, // listarMetricas
        nada, // buscarMetricas
        nada, // refreshMetricas
        nada, // sugerir
        nada, // remover
        escopo as never,
      );
      return { controller, escopo, listar };
    }

    it('a gerente só recebe as da equipe dela', async () => {
      const { controller } = montar();

      const lista = await controller.listarVendedoras({} as never, REQ_GERENTE);

      expect(lista.map((v) => (v as { id: string }).id)).toEqual(['v-1', 'v-2']);
    });

    /* A GESTÃO VÊ TODAS — e é o outro lado do pedido, não um detalhe. */
    it('quem não tem equipe continua vendo todas', async () => {
      const { controller } = montar();

      const lista = await controller.listarVendedoras({} as never, REQ_ADMIN);

      expect(lista).toHaveLength(3);
    });

    /*
     * A CHAVE DE API VÊ TUDO, e tem de ver: as vendedoras nascem pela
     * integração do ERP (21 das 23 em agosto/2026). Recortar a integração
     * faria o Safira deixar de enxergar o que ele mesmo cadastrou.
     */
    it('chave de API (sem req.user) não é recortada', async () => {
      const { controller, escopo } = montar();

      const lista = await controller.listarVendedoras({} as never, REQ_CHAVE);

      expect(lista).toHaveLength(3);
      expect(escopo.equipeDoUsuario).not.toHaveBeenCalled();
    });

    /* FORA DA EQUIPE É "NÃO ACHEI" — dizer "você não pode" já conta que existe. */
    it('a ficha de quem é de fora responde 404, e não 403', async () => {
      const { controller } = montar();

      await expect(
        controller.buscarPorId(DE_FORA, REQ_GERENTE),
      ).rejects.toThrow(/não encontrada/i);
    });

    it('a ficha de quem é da equipe abre normalmente', async () => {
      const { controller } = montar();

      const v = await controller.buscarPorId('v-1', REQ_GERENTE);

      expect(v).toEqual({ id: 'v-1', nome: 'Camila' });
    });

    /* O ID DO ERP É OUTRA PORTA PARA A MESMA FICHA — e foi por uma porta
     * esquecida que a lição dos telefones nasceu. */
    it('pelo id do ERP também não escapa', async () => {
      const { controller } = montar();

      await expect(
        controller.buscarPeloIdErp('999', REQ_GERENTE),
      ).rejects.toThrow(/não encontrada/i);
    });
  });

  // =========================================================================
  // 2. METAS
  // =========================================================================
  describe('metas', () => {
    const METAS = [
      { id: 'm-1', tipo: 'POR_VENDEDORA' as const, referenciaId: 'v-1' },
      { id: 'm-2', tipo: 'POR_VENDEDORA' as const, referenciaId: DE_FORA },
      { id: 'm-3', tipo: 'GLOBAL' as const, referenciaId: null },
    ];

    function montar() {
      const escopo = escopoDublado();
      const listar = { execute: jest.fn().mockResolvedValue(METAS) };
      const buscar = {
        execute: jest.fn((id: string) =>
          Promise.resolve(METAS.find((m) => m.id === id)),
        ),
      };
      const progresso = { execute: jest.fn().mockResolvedValue({ pct: 10 }) };
      const nada = { execute: jest.fn() } as never;
      const controller = new MetasController(
        listar as never,
        buscar as never,
        nada, // criar
        nada, // atualizar
        nada, // remover
        progresso as never,
        escopo as never,
      );
      return { controller, progresso };
    }

    it('some a meta da vendedora de fora, e a GLOBAL fica', async () => {
      const { controller } = montar();

      const metas = await controller.listar(REQ_GERENTE);

      expect(metas.map((m) => (m as { id: string }).id)).toEqual(['m-1', 'm-3']);
    });

    it('a gestão vê todas as metas', async () => {
      const { controller } = montar();

      expect(await controller.listar(REQ_ADMIN)).toHaveLength(3);
    });

    it('a meta de fora não abre pelo id', async () => {
      const { controller } = montar();

      await expect(controller.buscar('m-2', REQ_GERENTE)).rejects.toThrow(
        /não encontrada/i,
      );
    });

    /*
     * O PROGRESSO É O NÚMERO, e era a porta mais fácil de esquecer: ele não
     * devolve a meta, devolve o quanto ela andou — e é justamente isso que
     * não pode sair.
     */
    it('o progresso da meta de fora também não sai', async () => {
      const { controller, progresso } = montar();

      await expect(controller.progresso('m-2', REQ_GERENTE)).rejects.toThrow(
        /não encontrada/i,
      );
      expect(progresso.execute).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. ATENDIMENTOS
  // =========================================================================
  describe('atendimentos', () => {
    function montar() {
      const escopo = escopoDublado();
      const auditoria = {
        resumo: jest.fn().mockResolvedValue({}),
        serie: jest.fn().mockResolvedValue([]),
        listar: jest.fn().mockResolvedValue({ itens: [], total: 0 }),
        detalhe: jest.fn().mockResolvedValue({}),
      };
      const linha = { execute: jest.fn().mockResolvedValue({ faixas: [] }) };
      const controller = new AtendimentosController(
        auditoria as never,
        linha as never,
        { execute: jest.fn() } as never,
        escopo as never,
      );
      return { controller, auditoria, linha };
    }

    it('o resumo, a série, a lista e o detalhe levam a equipe junto', async () => {
      const { controller, auditoria } = montar();

      await controller.resumo({} as never, REQ_GERENTE);
      await controller.serie({} as never, REQ_GERENTE);
      await controller.listar({} as never, REQ_GERENTE);
      await controller.detalhe('a-1', REQ_GERENTE);

      expect(auditoria.resumo).toHaveBeenCalledWith(
        expect.objectContaining({ equipe: DA_EQUIPE }),
      );
      expect(auditoria.serie).toHaveBeenCalledWith(
        expect.objectContaining({ equipe: DA_EQUIPE }),
        'DIA',
      );
      expect(auditoria.listar).toHaveBeenCalledWith(
        expect.objectContaining({ equipe: DA_EQUIPE }),
      );
      expect(auditoria.detalhe).toHaveBeenCalledWith('a-1', DA_EQUIPE);
    });

    /* A RÉGUA DO DIA É UMA FAIXA POR VENDEDORA, com o nome em cima dela. */
    it('a linha do tempo recebe a equipe', async () => {
      const { controller, linha } = montar();

      await controller.linhaDoTempo(REQ_GERENTE, '2026-10-23');

      expect(linha.execute).toHaveBeenCalledWith('2026-10-23', DA_EQUIPE);
    });

    it('para a gestão o recorte vai indefinido — e nada é filtrado', async () => {
      const { controller, auditoria, linha } = montar();

      await controller.resumo({} as never, REQ_ADMIN);
      await controller.linhaDoTempo(REQ_ADMIN);

      expect(auditoria.resumo).toHaveBeenCalledWith(
        expect.objectContaining({ equipe: undefined }),
      );
      expect(linha.execute).toHaveBeenCalledWith(undefined, undefined);
    });

    /*
     * FILTRAR POR QUEM NÃO SE ALCANÇA É "NÃO ACHEI".
     *
     * Sem isto, escolher no filtro uma vendedora de fora devolveria uma tela
     * vazia — que diz a mesma coisa com cara de defeito, e convida a tentar de
     * novo.
     */
    it('escolher no filtro uma vendedora de fora é 404', async () => {
      const { controller, auditoria } = montar();

      await expect(
        controller.listar({ vendedora_id: DE_FORA } as never, REQ_GERENTE),
      ).rejects.toThrow(/não encontrada/i);
      expect(auditoria.listar).not.toHaveBeenCalled();
    });

    it('e escolher uma da equipe continua valendo', async () => {
      const { controller, auditoria } = montar();

      await controller.listar({ vendedora_id: 'v-2' } as never, REQ_GERENTE);

      expect(auditoria.listar).toHaveBeenCalledWith(
        expect.objectContaining({ vendedoraId: 'v-2', equipe: DA_EQUIPE }),
      );
    });
  });
});
