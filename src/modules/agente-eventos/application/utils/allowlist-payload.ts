/**
 * Allowlist de chaves permitidas no payload de agente_eventos (H-002).
 *
 * Camada PRIMARIA de defesa do payload, complementar ao detectarPiiNoPayload
 * (blocklist heuristica). A estrategia e defense-in-depth:
 *
 *   1. ALLOWLIST (este arquivo): so chaves de TOPO conhecidas e estritamente
 *      operacionais podem entrar. Qualquer chave desconhecida e rejeitada
 *      ANTES de qualquer inspecao de valor — fecha a porta para campos
 *      arbitrarios carregarem PII ou ruido de prompt injection.
 *   2. BLOCKLIST de PII (detectar-pii.ts): roda em seguida e varre os VALORES
 *      (recursivamente) atras de padroes de PII, mesmo dentro de chaves
 *      permitidas.
 *
 * REGRA DE OURO: agente_eventos.payload carrega apenas METADADOS operacionais
 * (estados, sugestoes, scores, tempos, correlacao). PII vive nas tabelas
 * proprias com cifragem AES-256-GCM. Nunca no payload.
 *
 * COMO ESTENDER: para suportar um novo metadado de evento, adicione a chave
 * (camelCase ou snake_case, conforme o emissor) a CHAVES_PAYLOAD_PERMITIDAS.
 * A chave deve ser um metadado nao-PII e ter caso de uso operacional claro
 * (LGPD Art. 6 III — necessidade). Documente a inclusao na PR.
 */

export const CHAVES_PAYLOAD_PERMITIDAS: ReadonlySet<string> = new Set<string>([
  // --- Metadados de triagem / roteamento (Anastasia) ---
  'estado', // estado atual da maquina de conversa
  'camposColetados', // quais campos da triagem ja foram coletados (lista de nomes)
  'vendedoraSugerida', // codigo/ID da vendedora sugerida pelo roteador
  'vendedoraAprovada', // codigo/ID da vendedora aprovada no handoff
  'totalSugestoes', // quantidade de vendedoras ranqueadas devolvidas
  'motivo', // motivo operacional (ex.: escalonamento, rejeicao) — texto curto controlado

  // --- Metadados de seguranca (Sofia) ---
  'suspeitaInjection', // flag booleana de deteccao de prompt injection
  'slaTipo', // tipo de SLA violado (repasse / primeiro_contato)

  // --- Metadados gerais / observabilidade ---
  'score', // score numerico (ranking, confianca)
  'correlationId', // ID de correlacao entre eventos da mesma conversa
  'duracaoMs', // duracao de uma operacao em milissegundos

  // --- Chaves legadas snake_case ainda emitidas (compatibilidade) ---
  // Mantidas porque emissores atuais (n8n) e eventos de transicao usam estes
  // nomes. Sao igualmente metadados nao-PII. Migrar para camelCase no futuro.
  'estado_anterior', // estado anterior numa transicao
  'estado_novo', // estado novo numa transicao
  'tempo_total_segundos', // duracao total de uma triagem em segundos
  'vendedora_id', // ID da vendedora referenciada (metadado, nao PII)
]);

/**
 * Valida que TODAS as chaves de TOPO do payload pertencem a allowlist.
 * Retorna a lista de chaves desconhecidas (vazia quando tudo ok).
 *
 * So inspeciona o nivel de topo de proposito: a allowlist controla a SUPERFICIE
 * de campos do evento; a varredura profunda de PII fica a cargo do
 * detectarPiiNoPayload. Nao ecoa valores — apenas nomes de chave.
 */
export function chavesForaDaAllowlist(payload: unknown): string[] {
  if (payload == null) return [];
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    // Payload precisa ser um objeto de metadados. Qualquer outra forma
    // (array, primitivo) e tratada como invalida pela ausencia de chaves
    // reconheciveis — sinalizamos com um marcador estavel e sem valor.
    return ['<payload-nao-e-objeto>'];
  }

  return Object.keys(payload as Record<string, unknown>).filter(
    (chave) => !CHAVES_PAYLOAD_PERMITIDAS.has(chave),
  );
}
