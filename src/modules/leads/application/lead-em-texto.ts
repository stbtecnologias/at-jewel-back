import type { Lead } from '../domain/ports/repositories/lead-repository.port';

export const OCASIAO_LEGIVEL: Record<string, string> = {
  CASAMENTO: 'casamento',
  NOIVADO: 'noivado',
  ANIVERSARIO: 'aniversário',
  FORMATURA: 'formatura',
  DATA_COMEMORATIVA: 'data comemorativa',
  AUTOPRESENTE: 'presente para si',
  OUTRO: 'outra ocasião',
};

/**
 * O corpo do lead, igual nos DOIS avisos: o que sobe para a gestao e o que
 * desce para a vendedora.
 *
 * ==========================================================================
 * ESTA FUNCAO EXISTE PARA OS DOIS TEXTOS NAO DIVERGIREM.
 *
 * A gestao le "Nick Tesla — aneis de noivado, para noivado" e responde para
 * qual vendedora encaminhar. A vendedora recebe o MESMO paragrafo e liga.
 * Se um dos dois fosse montado a parte, bastaria acrescentar um campo de um
 * lado para a vendedora receber menos do que o ADM leu — e ninguem
 * perceberia, porque as duas mensagens nunca aparecem juntas na mesma tela.
 *
 * O QUE E ESPECIFICO DE CADA UM FICA FORA daqui: a linha de sugestao e a
 * pergunta "para qual vendedora encaminho?" sao da gestao; o telefone e da
 * vendedora, que sem ele nao tem como alcancar um lead.
 * ==========================================================================
 */
export function blocoDoLead(lead: Lead): string[] {
  const nome = lead.nome?.trim() || 'Cliente sem nome informado';
  const linhas = [`Chegou um lead novo.`, ``, nome];

  const detalhe: string[] = [];
  if (lead.produtosDesejados) detalhe.push(lead.produtosDesejados);
  if (lead.ocasiao) {
    detalhe.push(
      `para ${OCASIAO_LEGIVEL[lead.ocasiao] ?? lead.ocasiao.toLowerCase()}`,
    );
  }
  if (detalhe.length) linhas.push(detalhe.join(' — '));

  if (lead.origemContato) linhas.push(`Veio de: ${lead.origemContato}`);
  if (lead.clienteId) linhas.push('Já é cliente da casa.');

  if (lead.resumoTriagem) {
    linhas.push(``, lead.resumoTriagem.trim());
  }

  return linhas;
}

/**
 * O numero como uma pessoa le, para ela poder digitar no teclado.
 *
 * O DDI SAI quando esta ali: a vendedora liga do celular dela, no Brasil, e
 * "5585..." no meio de uma frase parece codigo, nao telefone. Numero que nao
 * tem a cara de brasileiro volta como veio — inventar formato em cima de um
 * numero estrangeiro entrega um telefone que nao existe.
 */
export function telefoneLegivel(numero: string): string {
  const digitos = numero.replace(/\D/g, '');
  const local =
    digitos.length > 11 && digitos.startsWith('55')
      ? digitos.slice(2)
      : digitos;

  if (local.length !== 10 && local.length !== 11) return numero;

  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const corte = resto.length - 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
