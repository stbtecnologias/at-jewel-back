/**
 * O APELIDO DA EMPRESA — 28/10/2026.
 *
 * ==========================================================================
 * QUEM PERGUNTA DIZ "SÃO PAULO". O CADASTRO DIZ "SP".
 *
 * Medi vinte e três formas de pedir a filial de São Paulo contra as oito
 * empresas. Depois de o casamento passar a ser por PALAVRA (ver `casaComNome`),
 * sobrou uma classe que nenhuma normalização alcança — a palavra simplesmente
 * não está no cadastro:
 *
 *   "São Paulo"   ->  NÃO ACHAVA, e é a forma mais natural de perguntar
 *   "Sao Paulo"   ->  NÃO ACHAVA
 *
 * Porque o nome é `AT JEWEL LTDA - SP`. Não há `são`, não há `paulo`. Isso não
 * é acento, caixa nem traço: é um apelido que falta.
 *
 * É O MESMO PROBLEMA DO `shared/catalogo/sinonimos`, que nasceu em 08/10 por
 * "brinco de diamante" não achar as 259 joias com `DTS`. Lá a vendedora
 * escreve em português e o catálogo está em sigla; aqui a gestora fala a
 * cidade e o cadastro fala a sigla do CNPJ. Mesmo mecanismo, e por isso o
 * mesmo formato: **a chave é como ELA escreve; o valor, o que está no
 * cadastro.**
 *
 * ZERO MIGRAÇÃO, de propósito — decisão do Lucas em 28/10: *"não queria criar
 * tabelas ou colunas... dá pra resolver isso internamente?"*
 * ==========================================================================
 *
 * ==========================================================================
 * E UM DOS APELIDOS EXISTE POR UM ERRO DE DIGITAÇÃO NO ERP.
 *
 * A empresa 007 está cadastrada como **`AT DESING DE PRODUTOS LTDA`** —
 * "DESING", e não "DESIGN". Medido: quem escreve `design` não acha nada; quem
 * escreve `desing` acha as 28 vendas.
 *
 * O dado está errado na ORIGEM, e o lugar de consertar é o ERP. Enquanto ele
 * não for consertado, a agente não pode ser a única a pagar — então o apelido
 * entra, COM esta nota, para que o dia em que o ERP for corrigido alguém saiba
 * que esta linha pode sair.
 * ==========================================================================
 *
 * O QUE *NÃO* ENTRA AQUI: cidade de empresa que não tem cidade no nome. As
 * outras sete são `AT JEWEL`, `MP COMERCIO DE METAIS`, `AT SERVICOS`,
 * `AT HOLDING`, `AT HOME`, `FL COMERCIO` e `AT DESING` — nenhuma diz onde
 * fica, e inventar que a matriz "é Fortaleza" seria afirmar o que o cadastro
 * não diz. Entra quando a equipe disser.
 */

/** A chave é como ela escreve; o valor, o que está no cadastro. */
export const APELIDOS_DE_EMPRESA: Record<string, string> = {
  // A filial, pela cidade. O cadastro só tem a sigla.
  'sao paulo': 'sp',
  // O typo do ERP na empresa 007 — ver a nota acima.
  design: 'desing',
};
