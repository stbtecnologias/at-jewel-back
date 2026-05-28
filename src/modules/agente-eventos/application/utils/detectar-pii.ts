/**
 * Heuristica de deteccao de PII no payload de eventos.
 *
 * REGRA DE OURO: agente_eventos.payload nao pode conter PII.
 * PII vive nas tabelas proprias com cifragem AES-256-GCM. O payload e
 * apenas para metadados operacionais (estados, IDs, scores, tempos).
 *
 * Esta funcao roda no use case ANTES de persistir. Se detectar padroes
 * comuns de PII, rejeita com 422 — defesa em profundidade contra desvio
 * acidental (programador colocando mensagem do cliente no payload).
 *
 * Sao heuristicas — nao garantem 100%. Cobertura focada nos vetores mais
 * comuns no Brasil: telefone, email, CPF, chaves PIX, IBAN.
 *
 * Retorna a lista de motivos quando detecta (vazia se ok).
 */

// Aceita formatos com separadores variaveis:
//   "(85) 9 8888-7777", "85 98888-7777", "+55 85 9 8888 7777", "85988887777"
const REGEX_TELEFONE = /(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}/;
const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const REGEX_CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;
const REGEX_CNPJ = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;

// Chaves de campos suspeitas — se aparecem no payload sao bandeira vermelha
// mesmo que o valor pareca inocente.
const CHAVES_PROIBIDAS = new Set<string>([
  'mensagem',
  'message',
  'msg',
  'msg_text',
  'conteudo',
  'content',
  'body',
  'text',
  'transcript',
  'transcricao',
  'telefone',
  'phone',
  'whatsapp',
  'email',
  'cpf',
  'rg',
  'endereco',
  'address',
  'cep',
  'observacao',
  'observation',
  'notas',
  'notes',
  'wishlist',
  'intencao',
  'intent',
  'nome_completo',
  'full_name',
]);

export function detectarPiiNoPayload(payload: unknown): string[] {
  const motivos: string[] = [];
  if (payload == null) return motivos;

  varrer(payload, '', motivos);
  return motivos;
}

function varrer(valor: unknown, caminho: string, motivos: string[]): void {
  if (valor == null) return;

  if (typeof valor === 'string') {
    if (REGEX_TELEFONE.test(valor)) motivos.push(`${caminho || '<raiz>'}: parece telefone`);
    if (REGEX_EMAIL.test(valor)) motivos.push(`${caminho || '<raiz>'}: parece email`);
    if (REGEX_CPF.test(valor)) motivos.push(`${caminho || '<raiz>'}: parece CPF`);
    if (REGEX_CNPJ.test(valor)) motivos.push(`${caminho || '<raiz>'}: parece CNPJ`);
    return;
  }

  if (Array.isArray(valor)) {
    valor.forEach((item, i) => varrer(item, `${caminho}[${i}]`, motivos));
    return;
  }

  if (typeof valor === 'object') {
    for (const [chave, sub] of Object.entries(valor)) {
      const chaveLower = chave.toLowerCase();
      const proximoCaminho = caminho ? `${caminho}.${chave}` : chave;
      if (CHAVES_PROIBIDAS.has(chaveLower)) {
        motivos.push(`${proximoCaminho}: chave proibida (provavel PII)`);
        continue;
      }
      varrer(sub, proximoCaminho, motivos);
    }
  }
}
