import { Inject, Injectable } from '@nestjs/common';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';

export type ResolucaoVendedora =
  | { status: 'ACHOU'; id: string; nome: string; codigoErp: string | null }
  | { status: 'NAO_ENCONTRADA'; sugestoes: string[] }
  | { status: 'AMBIGUA'; nomes: string[] };

/**
 * Teto da lista de nomes devolvida quando nao acha ou fica ambiguo.
 *
 * Alto de proposito. Com 6, uma equipe de 8 virava "as ativas sao <seis
 * nomes>" — uma frase que soa completa e nao e, e o ADM procuraria em vao
 * quem ficou de fora. Equipe de joalheria nao chega perto disso; se um dia
 * chegar, a lista cortada precisa vir com aviso, nao em silencio.
 */
const MAXIMO_SUGESTOES = 20;

/**
 * "a Marina" -> a vendedora.
 *
 * SO EXISTE PARA A GESTAO. A vendedora nunca precisa disto: no canal dela o
 * `vendedoraId` vem por closure, do telefone, e nenhuma ferramenta aceita "de
 * quem". Aqui e o oposto — o ADM pergunta pelos outros, entao alguem precisa
 * traduzir o nome falado num id. Manter este use case fora do caminho da
 * vendedora e o que garante que a assimetria continue existindo.
 *
 * COMO CASA O NOME: primeiro nome, nome completo ou pedaco, sem acento e sem
 * caixa. Quem fala no WhatsApp escreve "marina", nao "Marina Albuquerque".
 *
 * AMBIGUIDADE PARA O FLUXO em vez de escolher a primeira. Duas Marinas e uma
 * pergunta, nao um palpite: agendar ou relatar na vendedora errada e um erro
 * silencioso, que so aparece quando alguem reclama.
 *
 * INATIVA NAO CONTA — quem saiu da equipe nao entra em relatorio nem em agenda.
 */
@Injectable()
export class ResolverVendedoraPorNomeUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(nome: string): Promise<ResolucaoVendedora> {
    const busca = normalizar(nome);
    const ativas = await this.repo.listar({ ativo: true });

    if (!busca) {
      return { status: 'NAO_ENCONTRADA', sugestoes: nomesDe(ativas) };
    }

    // Exato primeiro: com "Marina Albuquerque" e "Marina Souza" na equipe,
    // quem escreveu o nome inteiro nao deve receber pergunta de volta.
    const exatas = ativas.filter((v) => normalizar(v.nome) === busca);
    if (exatas.length === 1) return achou(exatas[0]);
    if (exatas.length > 1) return { status: 'AMBIGUA', nomes: nomesDe(exatas) };

    const parciais = ativas.filter((v) => normalizar(v.nome).includes(busca));
    if (parciais.length === 1) return achou(parciais[0]);
    if (parciais.length > 1) return { status: 'AMBIGUA', nomes: nomesDe(parciais) };

    // Nao achou: devolve a equipe para o agente poder dizer quem existe, em vez
    // de um "nao encontrei" seco que obriga a adivinhar o nome certo.
    return { status: 'NAO_ENCONTRADA', sugestoes: nomesDe(ativas) };
  }
}

/**
 * `Vendedora.id` e opcional no dominio — a entidade existe antes de ser salva.
 * Linha vinda do banco sempre tem id, entao este caminho nao acontece na
 * pratica; tratamos como "nao encontrada" em vez de forcar o tipo, para nunca
 * seguir adiante com id vazio e consultar a agenda de ninguem.
 */
function achou(v: {
  id?: string | null;
  nome: string;
  codigoErp?: string | null;
}): ResolucaoVendedora {
  if (!v.id) return { status: 'NAO_ENCONTRADA', sugestoes: [] };
  return { status: 'ACHOU', id: v.id, nome: v.nome, codigoErp: v.codigoErp ?? null };
}

function nomesDe(vs: { nome: string }[]): string[] {
  return vs.slice(0, MAXIMO_SUGESTOES).map((v) => v.nome);
}

/** Sem acento, sem caixa, sem espaco sobrando — "MARÍNA " casa com "marina". */
function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    // Faixa dos sinais diacriticos combinantes, escapada de proposito: escrever
    // os acentos literalmente aqui torna a linha ilegivel e fragil a copia.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
