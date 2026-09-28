import {
  CombinadosService,
  TETO_ATIVOS,
  TETO_TEXTO,
} from './combinados.service';
import type { Combinado } from '../domain/ports/repositories/combinados-repository.port';

/**
 * OS COMBINADOS — ANA-16, 17, 18 e 23, 28/09/2026.
 *
 * ==========================================================================
 * O QUE ESTE ARQUIVO PROTEGE, E NAO E "a agente lembra".
 *
 * Lembrar e o banco que faz — a tabela existe e a consulta e trivial. O que
 * pode dar errado aqui e mais sutil, e e o que estes testes guardam:
 *
 *   1. A AGENTE NAO PODE MENTIR SOBRE O QUE FEZ. Dizer "pronto, esqueci"
 *      sobre um combinado que continua valendo e o pior desfecho possivel:
 *      a pessoa para de esperar aquilo, e aquilo continua acontecendo.
 *   2. O NUMERO E POSICAO, NAO ID. Quem conversa diz "tira o segundo", e
 *      resolver isso errado apaga o combinado de outra pessoa.
 *   3. OS TETOS EXISTEM POR CUSTO, e o custo e por MENSAGEM: cada combinado
 *      ativo entra no system prompt de toda resposta, de todo mundo.
 * ==========================================================================
 */
describe('CombinadosService', () => {
  let repo: {
    listarAtivos: jest.Mock;
    guardar: jest.Mock;
    remover: jest.Mock;
    contarAtivos: jest.Mock;
  };
  let svc: CombinadosService;

  const combinado = (id: string, texto: string): Combinado => ({
    id,
    agente: 'anastasia',
    texto,
    criadoEm: new Date('2026-09-28T10:00:00-03:00'),
    criadoPorId: 'u-1',
  });

  beforeEach(() => {
    repo = {
      listarAtivos: jest.fn().mockResolvedValue([]),
      guardar: jest
        .fn()
        .mockImplementation((_a, texto) =>
          Promise.resolve(combinado('c-novo', texto)),
        ),
      remover: jest.fn().mockResolvedValue(true),
      contarAtivos: jest.fn().mockResolvedValue(0),
    };
    svc = new CombinadosService(repo as never);
  });

  describe('guardar', () => {
    it('guarda e devolve OK', async () => {
      const r = await svc.guardar('anastasia', 'Sempre me avise das devoluções', 'u-1');

      expect(r.status).toBe('OK');
      expect(repo.guardar).toHaveBeenCalledWith(
        'anastasia',
        'Sempre me avise das devoluções',
        'u-1',
      );
    });

    it('normaliza o espaço — o que chega do ditado vem torto', async () => {
      await svc.guardar('anastasia', '  Me   avise \n das devoluções  ', null);

      expect(repo.guardar).toHaveBeenCalledWith(
        'anastasia',
        'Me avise das devoluções',
        null,
      );
    });

    it('recusa vazio, e não grava', async () => {
      expect((await svc.guardar('anastasia', '   ', null)).status).toBe('VAZIO');
      expect(repo.guardar).not.toHaveBeenCalled();
    });

    it('recusa texto longo demais', async () => {
      const r = await svc.guardar('anastasia', 'x'.repeat(TETO_TEXTO + 1), null);

      expect(r).toEqual({ status: 'LONGO', teto: TETO_TEXTO });
      expect(repo.guardar).not.toHaveBeenCalled();
    });

    it('CONFERE O TETO ANTES DE GRAVAR', async () => {
      // Gravar e depois avisar deixaria o combinado no banco, fora do prompt e
      // invisivel na lista — um combinado que existe e nao vale.
      repo.contarAtivos.mockResolvedValue(TETO_ATIVOS);

      const r = await svc.guardar('anastasia', 'mais um', null);

      expect(r).toEqual({ status: 'CHEIO', teto: TETO_ATIVOS });
      expect(repo.guardar).not.toHaveBeenCalled();
    });
  });

  describe('paraPrompt', () => {
    it('vazio quando não há combinado — o prompt fica como era', async () => {
      expect(await svc.paraPrompt('anastasia')).toBe('');
    });

    it('lista os ativos e AVISA que ela não dispara sozinha', async () => {
      // A frase e o que impede a agente de prometer um alerta automatico que
      // ela nao faz. Sem ela, "me avise as 8h" viraria um "combinado!" e
      // ninguem receberia nada.
      repo.listarAtivos.mockResolvedValue([
        combinado('c-1', 'Me avise das devoluções'),
      ]);

      const p = await svc.paraPrompt('anastasia');

      expect(p).toContain('Me avise das devoluções');
      expect(p).toContain('não fazem você avisar ninguém por conta própria');
    });

    it('diz que os combinados NÃO substituem as regras da persona', async () => {
      // Texto de usuario indo para o system prompt: o bloco chega rotulado
      // como o que e, e nao como regra de sistema.
      repo.listarAtivos.mockResolvedValue([combinado('c-1', 'qualquer coisa')]);

      expect(await svc.paraPrompt('anastasia')).toContain(
        'NÃO substituem as suas regras',
      );
    });
  });

  describe('os handlers, que são o que a agente chama', () => {
    it('lista numerada a partir de 1 — é o número que ela vai dizer', async () => {
      repo.listarAtivos.mockResolvedValue([
        combinado('c-1', 'primeiro'),
        combinado('c-2', 'segundo'),
      ]);

      const { linhas } = await svc.handlers('anastasia', 'u-1').listarCombinados();

      expect(linhas).toEqual(['1. primeiro', '2. segundo']);
    });

    it('esquecer pelo número remove o combinado DAQUELA posição', async () => {
      repo.listarAtivos.mockResolvedValue([
        combinado('c-1', 'primeiro'),
        combinado('c-2', 'segundo'),
      ]);

      const r = await svc
        .handlers('anastasia', 'u-1')
        .esquecerCombinado({ numero: 2 });

      expect(repo.remover).toHaveBeenCalledWith('c-2', 'u-1');
      expect(r).toEqual({ status: 'OK', texto: 'segundo' });
    });

    it.each([0, 3, -1, 99])(
      'número %s fora da lista NÃO remove nada',
      async (numero) => {
        repo.listarAtivos.mockResolvedValue([combinado('c-1', 'único')]);

        const r = await svc
          .handlers('anastasia', 'u-1')
          .esquecerCombinado({ numero });

        expect(r.status).toBe('NAO_ACHEI');
        expect(repo.remover).not.toHaveBeenCalled();
      },
    );

    it('se o banco disser que não removeu, a agente NÃO diz que esqueceu', async () => {
      // A corrida real: alguem removeu entre a lista e o esquecer. O `false`
      // do repositorio tem de virar "nao achei", e nao um OK otimista.
      repo.listarAtivos.mockResolvedValue([combinado('c-1', 'primeiro')]);
      repo.remover.mockResolvedValue(false);

      const r = await svc
        .handlers('anastasia', 'u-1')
        .esquecerCombinado({ numero: 1 });

      expect(r.status).toBe('NAO_ACHEI');
    });
  });
});
