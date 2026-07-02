// Para quem a peca foi consignada:
//  CLIENTE   — peca em posse de um cliente (ex: prova em casa)
//  VENDEDORA — peca em posse de uma vendedora (ex: mostruario externo)
export type DestinoConsignacao = 'CLIENTE' | 'VENDEDORA';

export const DESTINOS_CONSIGNACAO: DestinoConsignacao[] = ['CLIENTE', 'VENDEDORA'];

// Situacao da consignacao:
//  ABERTA    — pecas ainda fora da loja
//  DEVOLVIDA — pecas retornaram sem venda
//  VENDIDA   — consignacao convertida em venda
export type StatusConsignacao = 'ABERTA' | 'DEVOLVIDA' | 'VENDIDA';

export const STATUS_CONSIGNACAO: StatusConsignacao[] = ['ABERTA', 'DEVOLVIDA', 'VENDIDA'];

// Estados terminais: exigem uma data_retorno (registrada ou now()).
export const STATUS_CONSIGNACAO_TERMINAIS: StatusConsignacao[] = ['DEVOLVIDA', 'VENDIDA'];
