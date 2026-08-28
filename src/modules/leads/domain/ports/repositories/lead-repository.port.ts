import type { EstadoConversaAgente } from '../../../../clientes/domain/entities/enums';

/** Origem do contato — mesmo enum de `clientes_perfil.origem_contato`. */
export type OrigemContato =
  | 'whatsapp'
  | 'instagram'
  | 'site'
  | 'indicacao'
  | 'loja_fisica'
  | 'outro';

/** Ocasiao — mesmo enum de `atendimentos.ocasiao`. */
export type OcasiaoLead =
  | 'CASAMENTO'
  | 'NOIVADO'
  | 'ANIVERSARIO'
  | 'FORMATURA'
  | 'DATA_COMEMORATIVA'
  | 'AUTOPRESENTE'
  | 'OUTRO';

export interface Lead {
  id: string;
  nome: string | null;
  apelido: string | null;
  /** Plaintext: a coluna e cifrada, o transformer decifra na leitura. */
  whatsapp: string;
  origemContato: OrigemContato | null;
  ocasiao: OcasiaoLead | null;
  produtosDesejados: string | null;
  resumoTriagem: string | null;
  vendedoraSugeridaCodigo: string | null;
  estado: EstadoConversaAgente;
  estadoAtualizadoEm: Date;
  clienteId: string | null;
  vinculadoEm: Date | null;
  direcionadoGestaoEm: Date | null;
  fechadoEm: Date | null;
  criadoEm: Date;
}

export interface CriarLeadInput {
  whatsapp: string;
  whatsappHash: string;
  nome?: string | null;
  apelido?: string | null;
  origemContato?: OrigemContato | null;
  ocasiao?: OcasiaoLead | null;
  produtosDesejados?: string | null;
  resumoTriagem?: string | null;
  vendedoraSugeridaCodigo?: string | null;
  /** Vem junto com `vinculadoEm` ou nao vem — ver `chk_lead_vinculo`. */
  clienteId?: string | null;
}

/**
 * Campos que a triagem preenche ao longo da conversa. Tudo opcional: a
 * Anastasia descobre as coisas fora de ordem, e `undefined` significa "nao
 * mexe", enquanto `null` apaga.
 */
export interface AtualizarLeadInput {
  nome?: string | null;
  apelido?: string | null;
  origemContato?: OrigemContato | null;
  ocasiao?: OcasiaoLead | null;
  produtosDesejados?: string | null;
  resumoTriagem?: string | null;
  vendedoraSugeridaCodigo?: string | null;
  estado?: EstadoConversaAgente;
  direcionadoGestaoEm?: Date | null;
}

export interface ILeadRepository {
  /**
   * O lead em andamento daquele numero, se houver. E o primeiro passo do
   * reconhecimento: mensagem que chega com lead aberto CONTINUA a conversa,
   * nao comeca outra.
   */
  buscarAbertoPorHash(whatsappHash: string): Promise<Lead | null>;

  /**
   * O lead mais recente daquele numero, aberto ou fechado. Serve para
   * reaproveitar nome e apelido de quem ja passou por aqui.
   */
  buscarUltimoPorHash(whatsappHash: string): Promise<Lead | null>;

  buscarPorId(id: string): Promise<Lead | null>;

  criar(input: CriarLeadInput): Promise<Lead>;

  atualizar(id: string, input: AtualizarLeadInput): Promise<Lead>;

  /** Preenche a ponte com o ERP. Grava `vinculado_em` junto, sempre. */
  vincularCliente(id: string, clienteId: string): Promise<Lead>;
}
