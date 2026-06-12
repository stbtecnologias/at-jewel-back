// Tipo da ocorrencia registrada contra um produto:
//  DEFEITO     — falha de fabricacao/qualidade detectada na peca
//  DEVOLUCAO   — cliente devolveu a peca (troca/arrependimento)
//  RECLAMACAO  — insatisfacao registrada sem devolucao da peca
export type TipoDefeito = 'DEFEITO' | 'DEVOLUCAO' | 'RECLAMACAO';

export const TIPOS_DEFEITO: TipoDefeito[] = ['DEFEITO', 'DEVOLUCAO', 'RECLAMACAO'];
