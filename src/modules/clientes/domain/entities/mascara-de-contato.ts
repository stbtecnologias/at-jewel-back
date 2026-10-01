/**
 * ESCONDER CONTATO SEM APAGAR A LINHA — RF-10, 28/09/2026.
 *
 * ==========================================================================
 * SAIU DE DENTRO DO `cliente.entity` EM 01/10/2026, E O MOTIVO E UM CICLO.
 *
 * As duas funcoes nasceram ali, e o `ClientePerfil` passou a precisar da
 * primeira — o WhatsApp do perfil furava a mascara do cliente. Mas
 * `cliente.entity` ja importa `cliente-perfil.entity`, entao importar de
 * volta fecharia um ciclo.
 *
 * Ciclo de import entre declaracoes de funcao "funciona" por hoisting, e
 * quebra no dia em que a ordem de inicializacao mudar — com um `undefined is
 * not a function` que nao aponta para a causa. Um arquivo folha custa menos.
 *
 * O spec ja se chamava `mascara-de-contato.spec.ts` desde 28/09, apontando
 * para um modulo que nao existia. Agora existe.
 * ==========================================================================
 */

const DIGITOS_VISIVEIS = 2;

/**
 * `(85) 98846-1045` -> `(••) •••••-••45`.
 *
 * ==========================================================================
 * O FINAL FICA, E E DE PROPOSITO — mas dois digitos, nao quatro.
 *
 * Mascara existe para quem precisa DISTINGUIR sem precisar LIGAR: duas
 * clientes homonimas na tela viram a mesma linha se o telefone sumir inteiro,
 * e o dado deixa de servir para o trabalho.
 *
 * Dois digitos dao 1 em 100 de colisao — suficiente para separar duas linhas,
 * inutil para discar. Quatro seriam o suficiente para alguem reconhecer um
 * numero que ja conhece, que e exatamente o que a mascara deveria impedir.
 *
 * A FORMA E PRESERVADA (parenteses, hifen, espacos) para a tela nao quebrar o
 * alinhamento da coluna, e porque um campo que muda de formato conforme quem
 * olha parece defeito.
 * ==========================================================================
 */
export function mascararTelefone(valor: string | null): string | null {
  if (!valor) return valor;

  const digitos = valor.replace(/\D/g, '');
  // Numero curto demais para esconder alguma coisa: mascara tudo. Deixar os
  // dois ultimos de um numero de quatro digitos nao esconde nada.
  const manter = digitos.length > DIGITOS_VISIVEIS * 2 ? DIGITOS_VISIVEIS : 0;
  const trocar = digitos.length - manter;

  let vistos = 0;
  return valor.replace(/\d/g, (d) => (vistos++ < trocar ? '•' : d));
}

/**
 * `maria.silva@gmail.com` -> `m•••••@gmail.com`.
 *
 * O DOMINIO FICA porque ele nao identifica ninguem — `@gmail.com` e metade do
 * Brasil — e porque distingue e-mail pessoal de corporativo, que e informacao
 * de atendimento. A parte local vai quase toda: e ela que costuma carregar
 * nome e sobrenome.
 */
export function mascararEmail(valor: string | null): string | null {
  if (!valor) return valor;

  const arroba = valor.lastIndexOf('@');
  // Sem `@` nao e e-mail — pode ser lixo de cadastro. Mascara inteiro em vez
  // de devolver como esta: o conteudo desconhecido e justamente o que nao se
  // deve assumir inofensivo.
  if (arroba < 1) return '•'.repeat(valor.length);

  const local = valor.slice(0, arroba);
  const dominio = valor.slice(arroba);
  return `${local[0]}${'•'.repeat(Math.max(local.length - 1, 1))}${dominio}`;
}
