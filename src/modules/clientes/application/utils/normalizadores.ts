/**
 * Normaliza um numero de telefone removendo tudo que nao for digito.
 * Ex: "(85) 9 8888-7777" -> "85988887777"
 *     "+55 85 98888-7777" -> "5585988887777"
 *
 * Usado antes de aplicar `hashField` para garantir que formatos diferentes
 * do mesmo numero produzam o mesmo hash.
 */
export function normalizarTelefone(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Formas equivalentes de um mesmo telefone brasileiro.
 *
 * MOTIVO: o mesmo numero circula em mais de um formato e todos precisam achar
 * o mesmo registro.
 *
 *   - NONO DIGITO. Contas de WhatsApp criadas antes da mudanca mantem o
 *     identificador antigo. O celular 5585 9 8646 7241 e entregue pelo WhatsApp
 *     como 5585 8646 7241. Comprovado em 17/08/2026: mensagem enviada para a
 *     forma com o 9 parou em ack=SERVER e nunca chegou ao aparelho.
 *   - DDI. A documentacao da API pede "so digitos, com DDD" e nao menciona o
 *     55, entao o integrador manda sem; o WhatsApp sempre manda com.
 *
 * Como o hash e exato, essas formas viram chaves diferentes — e o mesmo cliente
 * vira dois cadastros, ou a vendedora deixa de ser reconhecida. Aqui geramos as
 * formas equivalentes para BUSCAR por todas elas.
 *
 * Nao mexe no que e GRAVADO: `normalizarTelefone` continua sendo o que produz o
 * hash na escrita, e os hashes ja existentes seguem validos. Nenhum backfill.
 *
 * A forma recebida vem SEMPRE primeiro no resultado: e a mais provavel de casar,
 * e quem itera para na primeira.
 *
 *   variantesTelefone('5585986467241') -> ['5585986467241', '558586467241',
 *                                          '85986467241',   '8586467241']
 *   variantesTelefone('558533334444')  -> ['558533334444', '8533334444']
 *
 * Telefone FIXO nao ganha variante de nono digito: o assinante comecando em 2-5
 * identifica fixo, e inventar um 9 ali criaria falso positivo com outro numero
 * real. Formato irreconhecivel volta sozinho, sem palpite.
 */
export function variantesTelefone(valor: string): string[] {
  const base = normalizarTelefone(valor);
  if (base.length === 0) return [];

  // Separa o DDI 55 do numero nacional (DDD + 8 ou 9 digitos do assinante).
  let nacional: string | null = null;
  if (base.startsWith('55') && (base.length === 12 || base.length === 13)) {
    nacional = base.slice(2);
  } else if (base.length === 10 || base.length === 11) {
    nacional = base;
  }

  // Comprimento que nao corresponde a um telefone brasileiro: devolve como
  // veio. Melhor nao achar do que achar o registro errado.
  if (nacional === null) return [base];

  const ddd = nacional.slice(0, 2);
  const assinante = nacional.slice(2);

  const nacionais = new Set<string>([nacional]);
  if (assinante.length === 9 && assinante.startsWith('9')) {
    nacionais.add(ddd + assinante.slice(1));
  } else if (assinante.length === 8 && /^[6-9]/.test(assinante)) {
    nacionais.add(ddd + '9' + assinante);
  }

  // Formas COM DDI primeiro: o WhatsApp sempre entrega com o 55, e e o formato
  // canonico que a documentacao da API pede. Quem itera acha na frente.
  const formas: string[] = [base];
  for (const n of nacionais) {
    if (!formas.includes(`55${n}`)) formas.push(`55${n}`);
  }
  for (const n of nacionais) {
    if (!formas.includes(n)) formas.push(n);
  }
  return formas;
}
