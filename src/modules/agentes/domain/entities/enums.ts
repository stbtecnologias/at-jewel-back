// Agentes internos (painel) reimplementados do backend paralelo (atp):
//  anastasia — consultora estrategica/analytics para as proprietarias
//  elena     — especialista de catalogo/estoque para as vendedoras
// (NAO confundir com a Anastasia de triagem de WhatsApp, que vive no fluxo
// de atendimento — esses dois sao assistentes internos via painel.)
export type NomeAgente = 'anastasia' | 'elena';

export const NOMES_AGENTE: NomeAgente[] = ['anastasia', 'elena'];

export type PapelMensagem = 'user' | 'assistant';
