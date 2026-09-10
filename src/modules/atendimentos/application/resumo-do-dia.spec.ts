import { resumoDoDia } from './ferramentas-gestao.service';
import type {
  PontoDaLinha,
  TipoPonto,
} from '../domain/ports/repositories/atendimento-repository.port';

/**
 * "COMO ESTA O CANAL DA VENDEDORA X?"
 *
 * Este arquivo guarda a resposta a essa pergunta. Duas coisas que ele protege:
 *
 *   1. conta PESSOAS, e nao mensagens. "Falou com 12" quando foram tres
 *      clientes e doze idas e vindas seria uma leitura errada com cara de
 *      numero certo — e ninguem perceberia olhando;
 *
 *   2. "escreveu e nao foi respondida" e o unico numero aqui que aponta uma
 *      falha. E o que a gestao procura sem saber pedir.
 */
describe('resumoDoDia', () => {
  let seq = 0;

  function ponto(
    tipo: TipoPonto,
    hora: number,
    extra: Partial<PontoDaLinha> = {},
  ): PontoDaLinha {
    seq += 1;
    return {
      id: `p-${seq}`,
      tipo,
      vendedoraId: 'vd-1',
      vendedoraNome: 'Marina',
      em: new Date(2026, 8, 8, hora, 0),
      clienteId: 'cli-1',
      clienteNome: 'Karina',
      combinadoEm: null,
      valor: null,
      desfecho: null,
      atendimentoId: 'at-1',
      sessao: null,
      chatId: null,
      relato: null,
      ...extra,
    };
  }

  beforeEach(() => {
    seq = 0;
  });

  it('dia sem nada devolve lista vazia', () => {
    expect(resumoDoDia([])).toEqual([]);
  });

  describe('com quantas pessoas ela falou', () => {
    it('conta clientes distintos, e nao mensagens', () => {
      const linhas = resumoDoDia([
        ponto('CONTATO_CLIENTE', 9, { clienteId: 'a' }),
        ponto('RESPOSTA_VENDEDORA', 9, { clienteId: 'a' }),
        ponto('CONTATO_CLIENTE', 10, { clienteId: 'a' }),
        ponto('CONTATO_CLIENTE', 11, { clienteId: 'b' }),
        ponto('RESPOSTA_VENDEDORA', 11, { clienteId: 'b' }),
      ]);

      expect(linhas[0]).toBe('Falou com 2 clientes pelo WhatsApp.');
    });

    it('uma cliente so fica no singular', () => {
      const linhas = resumoDoDia([ponto('CONTATO_CLIENTE', 9, { clienteId: 'a' })]);
      expect(linhas[0]).toBe('Falou com 1 cliente pelo WhatsApp.');
    });
  });

  describe('quem escreveu e nao foi respondida', () => {
    it('aparece, e e o numero que aponta a falha', () => {
      const linhas = resumoDoDia([
        // Falou com a "a" e respondeu.
        ponto('CONTATO_CLIENTE', 9, { clienteId: 'a' }),
        ponto('RESPOSTA_VENDEDORA', 9, { clienteId: 'a' }),
        // A "b" escreveu e ficou no vacuo.
        ponto('CONTATO_CLIENTE', 10, { clienteId: 'b' }),
      ]);

      expect(linhas).toContain('1 escreveu e ainda nao recebeu resposta dela.');
    });

    it('some quando ela respondeu todo mundo', () => {
      const linhas = resumoDoDia([
        ponto('CONTATO_CLIENTE', 9, { clienteId: 'a' }),
        ponto('RESPOSTA_VENDEDORA', 9, { clienteId: 'a' }),
      ]);

      expect(linhas.join(' ')).not.toContain('sem resposta');
      expect(linhas.join(' ')).not.toContain('nao recebeu');
    });

    /** Ela escrever primeiro nao conta como ninguem esperando. */
    it('nao acusa quando so ela escreveu', () => {
      const linhas = resumoDoDia([
        ponto('RESPOSTA_VENDEDORA', 9, { clienteId: 'a' }),
      ]);
      expect(linhas.join(' ')).not.toContain('nao recebeu');
    });
  });

  describe('o que ela marcou', () => {
    it('lista com cliente e hora, em ordem', () => {
      const linhas = resumoDoDia([
        ponto('AGENDAMENTO', 11, {
          clienteNome: 'Renata',
          combinadoEm: new Date(2026, 8, 8, 16, 0),
        }),
        ponto('AGENDAMENTO', 9, {
          clienteNome: 'Karina',
          combinadoEm: new Date(2026, 8, 8, 14, 0),
        }),
      ]);

      const marcados = linhas.find((l) => l.startsWith('Marcou'));
      expect(marcados).toBeDefined();
      // A de 14h vem antes da de 16h, mesmo tendo sido marcada depois.
      expect(marcados!.indexOf('Karina')).toBeLessThan(marcados!.indexOf('Renata'));
      expect(marcados).toContain('2 contatos');
    });

    /** O retorno previsto de uma consignacao nao e compromisso com cliente. */
    it('nao conta o retorno previsto de consignacao', () => {
      const linhas = resumoDoDia([
        ponto('CONSIGNACAO', 10, {
          combinadoEm: new Date(2026, 8, 15, 10, 0),
        }),
      ]);
      expect(linhas.join(' ')).not.toContain('Marcou');
    });
  });

  it('soma as vendas do dia', () => {
    const linhas = resumoDoDia([
      ponto('VENDA', 15, { valor: 1200 }),
      ponto('VENDA', 17, { valor: 800 }),
    ]);

    const venda = linhas.find((l) => l.startsWith('Vendeu'));
    expect(venda).toContain('2 vezes');
    expect(venda).toContain('2.000');
  });

  it('separa o que fechou em venda do que fechou sem', () => {
    const linhas = resumoDoDia([
      ponto('FECHAMENTO', 15, { desfecho: 'VENDA' }),
      ponto('FECHAMENTO', 16, { desfecho: 'SEM_VENDA' }),
    ]);

    expect(linhas).toContain('Fechou 2 atendimentos, 1 em venda.');
  });

  it('nomeia as clientes cuja cobranca venceu', () => {
    const linhas = resumoDoDia([
      ponto('EXPIRADA', 17, { clienteNome: 'Leticia' }),
      ponto('EXPIRADA', 18, { clienteNome: 'Renata' }),
    ]);

    const vencidas = linhas.find((l) => l.includes('venceram'));
    expect(vencidas).toContain('Leticia');
    expect(vencidas).toContain('Renata');
  });

  /**
   * A pergunta do Lucas, inteira: "Vendedora X falou com tantas pessoas hoje,
   * marcou uma para as 14 e outra para as 16, vendeu isso e ainda esta
   * aguardando contato com tantas pessoas."
   */
  it('monta o dia completo, na ordem em que se conta', () => {
    const linhas = resumoDoDia([
      ponto('ENCAMINHADO', 8, { clienteId: 'a', clienteNome: 'Karina' }),
      ponto('CONTATO_CLIENTE', 9, { clienteId: 'a' }),
      ponto('RESPOSTA_VENDEDORA', 9, { clienteId: 'a' }),
      ponto('AGENDAMENTO', 9, {
        clienteNome: 'Karina',
        combinadoEm: new Date(2026, 8, 8, 14, 0),
      }),
      ponto('CONTATO_CLIENTE', 10, { clienteId: 'b' }),
      ponto('AGENDAMENTO', 10, {
        clienteNome: 'Renata',
        combinadoEm: new Date(2026, 8, 8, 16, 0),
      }),
      ponto('CONTATO_CLIENTE', 11, { clienteId: 'c' }),
      ponto('VENDA', 15, { valor: 10900 }),
      ponto('EXPIRADA', 18, { clienteNome: 'Leticia' }),
    ]);

    expect(linhas[0]).toBe('Falou com 3 clientes pelo WhatsApp.');
    expect(linhas[1]).toBe('2 escreveram e ainda nao receberam resposta dela.');
    expect(linhas[2]).toContain('Marcou 2 contatos');
    expect(linhas[3]).toContain('Vendeu 1 vez');
    expect(linhas[4]).toContain('venceu sem resposta');
    expect(linhas[5]).toBe('Recebeu 1 cliente encaminhado.');
  });
});
