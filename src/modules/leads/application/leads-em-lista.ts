import type {
  Lead,
  StatusLeadVendedora,
} from '../domain/ports/repositories/lead-repository.port';
import { diasDeCalendario } from '../../../shared/tempo/dias-de-calendario';
import { OCASIAO_LEGIVEL, telefoneLegivel } from './lead-em-texto';

/**
 * O LEAD NUMA LINHA — para LISTA, e nao para aviso.
 *
 * ==========================================================================
 * POR QUE NAO E O `blocoDoLead`.
 *
 * Aquele monta o AVISO de um lead so: varias linhas, com o resumo inteiro da
 * triagem. Aqui sao varios leads numa mensagem, e o mesmo formato repetido
 * cinco vezes vira uma parede que ninguem le no celular.
 *
 * O que fica: nome, o que procura, a ocasiao, ha quanto tempo chegou e o
 * telefone. O que sai: o resumo da triagem, que e o campo longo — quem quiser
 * o detalhe pergunta por aquele lead.
 * ==========================================================================
 */
export function linhaDoLead(lead: Lead, comTelefone: boolean): string {
  const partes = [lead.nome?.trim() || 'sem nome'];

  const oQue: string[] = [];
  if (lead.produtosDesejados) oQue.push(lead.produtosDesejados);
  if (lead.ocasiao) {
    oQue.push(
      `para ${OCASIAO_LEGIVEL[lead.ocasiao] ?? lead.ocasiao.toLowerCase()}`,
    );
  }
  if (oQue.length) partes.push(oQue.join(', '));

  partes.push(chegadaLegivel(lead));
  if (comTelefone) partes.push(telefoneLegivel(lead.whatsapp));

  // O STATUS E A ULTIMA ANOTACAO — 22/09/2026, migracao 60.
  //
  // Sem eles, uma lista que agora inclui lead RESOLVIDO ficaria indistinguivel
  // de uma fila: "Aslan — anel de noivado — ontem" nao diz se ele comprou, se
  // nao quis, ou se ninguem ligou ainda.
  if (lead.statusVendedora) partes.push(SITUACAO[lead.statusVendedora]);
  const anotacao = ultimaAnotacao(lead.observacaoVendedora);
  if (anotacao) partes.push(anotacao);

  return partes.join(' — ');
}

/** O status como gente fala. Sai na linha da lista, ao lado do resto. */
const SITUACAO: Record<StatusLeadVendedora, string> = {
  NOVO: 'ainda sem contato',
  EM_CONTATO: 'em contato',
  VIROU_CLIENTE: 'virou cliente',
  NAO_VINGOU: 'nao vingou',
};

/**
 * A ULTIMA COISA QUE ELA ESCREVEU — e nao o historico inteiro.
 *
 * ==========================================================================
 * NUMA LISTA, A ULTIMA ANOTACAO E A RESPOSTA.
 *
 * A observacao empilha com a data ("21/09 · pediu para voltar dia 10" /
 * "22/09 · achou caro"). Despejar tudo isso vezes dez leads seria a parede de
 * texto que esta funcao existe para evitar — e a pergunta que a lista responde
 * ("como foi?") quase sempre se resolve na ultima frase.
 *
 * QUANDO HA MAIS, A LINHA DIZ QUANTAS. Teto silencioso mente por omissao: sem
 * o "+2 antes", quem le acha que aquela frase e tudo o que existe.
 * ==========================================================================
 */
export function ultimaAnotacao(observacao: string | null): string | null {
  const linhas = (observacao ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return null;

  const ultima = linhas[linhas.length - 1];
  // O "[...]" e a marca de corte do teto, e nao uma anotacao.
  const anteriores = linhas.filter((l) => l !== '[...]').length - 1;
  return anteriores > 0
    ? `"${ultima}" (+${anteriores} ${anteriores === 1 ? 'anotacao antes' : 'anotacoes antes'})`
    : `"${ultima}"`;
}

/**
 * Ha quanto tempo, como uma pessoa diria.
 *
 * O MARCO E O ENCAMINHAMENTO quando ele existe: para a vendedora, a pergunta
 * e "ha quanto tempo isso esta comigo", e nao "ha quanto tempo essa pessoa
 * falou com a loja". Sem encaminhamento, vale a chegada.
 *
 * EM DIAS, e nao em horas: a decisao que a lista alimenta e "esse eu
 * esqueci?", e para isso a diferenca entre 3h e 5h nao muda nada.
 *
 * DIA DE CALENDARIO, E NAO PERIODO DE 24 HORAS — corrigido em 22/09/2026,
 * depois de a Elena dizer "chegou hoje" sobre um lead encaminhado as 16h do
 * dia anterior. O porque inteiro esta em `diasDeCalendario`.
 */
export function chegadaLegivel(lead: Lead, agora = new Date()): string {
  const marco = lead.direcionadoVendedoraEm ?? lead.criadoEm;
  const dias = diasDeCalendario(new Date(marco), agora);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `ha ${dias} dias`;
}

/** O estado do lead em portugues de gente. */
export function estadoLegivel(estado: string): string {
  const mapa: Record<string, string> = {
    TRIAGE_IN_PROGRESS: 'em triagem',
    READY_FOR_ROUTING: 'esperando encaminhamento',
    WAITING_OWNER_APPROVAL: 'esperando aprovacao',
    IN_HUMAN_SERVICE: 'ja encaminhado',
    NEEDS_HUMAN: 'precisa de gente',
  };
  return mapa[estado] ?? estado.toLowerCase();
}
