/**
 * VIOLACAO DE UNICIDADE — a traducao do erro 23505 do Postgres em frase.
 *
 * Mora fora do filtro de proposito: o filtro decide O QUE e erro de usuario;
 * aqui se decide COMO se diz. O mapa cresce a cada UNIQUE nova do banco, e
 * dentro do filtro esconderia as poucas linhas que de fato filtram.
 *
 * NAO importa o TypeORM — mesma razao do ramo do multer: este arquivo e do
 * `shared` e nao deve conhecer a biblioteca de acesso a banco. O reconhecimento
 * e pelo `code`, que e do Postgres e nao do driver.
 */

/** `unique_violation` no catalogo de erros do Postgres. */
const UNIQUE_VIOLATION = '23505';

/**
 * O erro como ele chega. O TypeORM embrulha o do driver em `QueryFailedError` e
 * copia os campos para cima — mas nem toda versao copia, entao os dois lugares
 * sao consultados.
 */
export interface ErroDoDriver extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  driverError?: { code?: string; constraint?: string; detail?: string };
}

interface Restricao {
  /** O registro, com artigo: "uma peca", "um cliente". */
  registro: string;
  /** O campo, com artigo: "o codigo", "o id do ERP". */
  campo: string;
  /**
   * O valor que o Postgres devolve NAO e o que a pessoa digitou — e um hash,
   * ou a concatenacao de varios UUIDs. Mostrar seria despejar dado de banco na
   * tela, que e exatamente o que este arquivo existe para impedir.
   */
  escondeValor?: true;
}

/**
 * Os cadastros. O que nao esta aqui cai na frase generica — nunca em 500, nunca
 * expondo nome de coluna.
 *
 * Nome da restricao: coluna com `UNIQUE` na criacao da tabela vira
 * `<tabela>_<coluna>_key` (padrao do Postgres); indice nomeado a mao mantem o
 * nome escrito na migracao.
 *
 * Conferido contra as migracoes em 23/09/2026. `clientes_email_hash_key` e
 * `clientes_telefone_1_hash_key` NAO entram: a migracao 36 os derrubou de
 * proposito — telefone e e-mail de cliente podem repetir.
 */
const POR_RESTRICAO: Record<string, Restricao> = {
  produtos_codigo_erp_key: { registro: 'uma peça', campo: 'o código' },
  uq_produtos_id_erp: { registro: 'uma peça', campo: 'o id do ERP' },

  clientes_codigo_erp_key: { registro: 'um cliente', campo: 'o código' },
  uq_clientes_id_erp: { registro: 'um cliente', campo: 'o id do ERP' },
  clientes_perfil_whatsapp_hash_key: {
    registro: 'um cliente',
    campo: 'o WhatsApp',
    escondeValor: true,
  },

  vendedoras_codigo_erp_key: { registro: 'uma vendedora', campo: 'o código' },
  uq_vendedoras_id_erp: { registro: 'uma vendedora', campo: 'o id do ERP' },
  vendedoras_email_hash_key: {
    registro: 'uma vendedora',
    campo: 'o e-mail',
    escondeValor: true,
  },
  vendedoras_whatsapp_interno_hash_key: {
    registro: 'uma vendedora',
    campo: 'o WhatsApp interno',
    escondeValor: true,
  },
  uq_vendedoras_whatsapp_externo_hash: {
    registro: 'uma vendedora',
    campo: 'o WhatsApp',
    escondeValor: true,
  },

  fornecedores_codigo_erp_key: { registro: 'um fornecedor', campo: 'o código' },
  uq_fornecedores_id_erp: { registro: 'um fornecedor', campo: 'o id do ERP' },

  empresas_codigo_erp_key: { registro: 'uma empresa', campo: 'o código' },
  uq_empresas_id_erp: { registro: 'uma empresa', campo: 'o id do ERP' },

  formas_pagamento_codigo_erp_key: {
    registro: 'uma forma de pagamento',
    campo: 'o código',
  },
  uq_formas_pagamento_id_erp: {
    registro: 'uma forma de pagamento',
    campo: 'o id do ERP',
  },

  grupos_estoque_codigo_erp_key: {
    registro: 'um grupo de estoque',
    campo: 'o código',
  },
  grupos_estoque_id_erp_key: {
    registro: 'um grupo de estoque',
    campo: 'o id do ERP',
  },

  locais_estoque_codigo_erp_key: {
    registro: 'um local de estoque',
    campo: 'o código',
  },
  locais_estoque_id_erp_key: {
    registro: 'um local de estoque',
    campo: 'o id do ERP',
  },

  estoque_codigo_erp_key: { registro: 'uma linha de estoque', campo: 'o código' },
  estoque_id_erp_key: { registro: 'uma linha de estoque', campo: 'o id do ERP' },
  /** `(empresa, grupo, produto, local)` — o valor sao quatro UUIDs. */
  uq_estoque_chave: {
    registro: 'uma linha de estoque',
    campo: 'essa combinação de empresa, grupo, peça e local',
    escondeValor: true,
  },

  operacoes_codigo_erp_key: { registro: 'uma operação', campo: 'o código' },
  operacoes_id_erp_key: { registro: 'uma operação', campo: 'o id do ERP' },
};

/** A frase quando a restricao nao esta no mapa. Sem coluna, sem valor. */
const GENERICA = 'Já existe um registro com esse valor.';

export function ehViolacaoDeUnicidade(e: unknown): e is ErroDoDriver {
  if (!(e instanceof Error)) return false;
  const erro = e as ErroDoDriver;
  return (erro.code ?? erro.driverError?.code) === UNIQUE_VIOLATION;
}

export function mensagemDeUnicidade(e: ErroDoDriver): string {
  const restricao = POR_RESTRICAO[e.constraint ?? e.driverError?.constraint ?? ''];
  if (!restricao) return GENERICA;

  const valor = restricao.escondeValor
    ? null
    : valorDoDetail(e.detail ?? e.driverError?.detail);

  if (restricao.escondeValor) {
    return 'Já existe ' + restricao.registro + ' com ' + restricao.campo + '.';
  }

  return valor
    ? 'Já existe ' + restricao.registro + ' com ' + restricao.campo + ' ' + valor + '.'
    : 'Já existe ' + restricao.registro + ' com ' + restricao.campo + ' informado.';
}

/**
 * O Postgres entrega o valor de graca:
 *
 *   Key (codigo_erp)=(C025109) already exists.
 *
 * E o que a PESSOA digitou, entao devolve-lo e devolver o proprio dado dela —
 * nao informacao de banco. O texto pode vir traduzido conforme o `lc_messages`
 * do servidor; nao casando, a frase cai no "informado", que continua correta.
 *
 * O teto de 80 existe porque `detail` de chave composta cresce sem limite, e a
 * mensagem vai para um toast.
 */
function valorDoDetail(detail: string | undefined): string | null {
  if (!detail) return null;
  const m = /^Key \(.+?\)=\((.+)\) already exists/.exec(detail);
  if (!m) return null;
  const valor = m[1].trim();
  return valor && valor.length <= 80 ? valor : null;
}
