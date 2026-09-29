import {
  DIAS_ATE_PARADO,
  ESTADOS_EM_ABERTO,
  ESTADOS_FECHADOS,
  ESTADOS_LEAD,
  ROTULO_ESTADO_LEAD,
  ehEstadoLead,
} from './estado-lead';

/**
 * O FUNIL — ANA-03, 29/09/2026.
 *
 * O funil antigo era o da TRIAGEM, desligada em 24/09: os estados falavam de
 * roteamento, e o lead nascido do caminho novo caia em `TRIAGE_IN_PROGRESS`,
 * que nao quer dizer nada.
 */
describe('o funil do lead', () => {
  it('são os cinco estados aprovados, e nada além', () => {
    expect([...ESTADOS_LEAD]).toEqual([
      'NOVO', 'EM_ATENDIMENTO', 'GANHO', 'PERDIDO', 'PARADO',
    ]);
  });

  it('nenhum estado da triagem sobrevive', () => {
    for (const velho of [
      'TRIAGE_IN_PROGRESS', 'READY_FOR_ROUTING',
      'WAITING_OWNER_APPROVAL', 'IN_HUMAN_SERVICE', 'NEEDS_HUMAN',
    ]) {
      expect(ehEstadoLead(velho)).toBe(false);
    }
  });

  /*
   * PARADO CONTA COMO ABERTO, E ISSO E O PONTO.
   *
   * Parado nao e desfecho: e ausencia dele. A cliente que sumiu ha oito dias
   * pode voltar amanha. Trata-lo como fechado sumiria do funil quem ainda
   * pode comprar, e pioraria a conversao (ANA-13) sozinha a cada semana.
   */
  it('PARADO está entre os ABERTOS, não entre os fechados', () => {
    expect(ESTADOS_EM_ABERTO).toContain('PARADO');
    expect(ESTADOS_FECHADOS).not.toContain('PARADO');
  });

  it('só GANHO e PERDIDO são desfecho', () => {
    expect([...ESTADOS_FECHADOS]).toEqual(['GANHO', 'PERDIDO']);
  });

  it('aberto e fechado cobrem todos os estados, sem sobreposição', () => {
    const juntos = [...ESTADOS_EM_ABERTO, ...ESTADOS_FECHADOS];
    expect(juntos.sort()).toEqual([...ESTADOS_LEAD].sort());
    expect(new Set(juntos).size).toBe(ESTADOS_LEAD.length);
  });

  it('todo estado tem rótulo para quem lê', () => {
    for (const e of ESTADOS_LEAD) {
      expect(ROTULO_ESTADO_LEAD[e]).toBeTruthy();
    }
  });

  it('o prazo de PARADO é 7 dias', () => {
    expect(DIAS_ATE_PARADO).toBe(7);
  });

  it.each([null, undefined, 42, '', 'novo', {}])('%p não é estado', (v) => {
    expect(ehEstadoLead(v)).toBe(false);
  });
});
