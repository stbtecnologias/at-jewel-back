import { Inject, Injectable } from '@nestjs/common';
import { VENDEDORA_REPOSITORY } from '../../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import {
  normalizarNome,
  preferirExato,
} from '../../../../shared/texto/nome-exato';

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
    const busca = normalizarNome(nome);
    const ativas = await this.repo.listar({ ativo: true });

    if (!busca) {
      return { status: 'NAO_ENCONTRADA', sugestoes: nomesDe(ativas) };
    }

    // EXATO PRIMEIRO, e a regra saiu daqui em 28/10/2026: ela vale igual
    // para empresa, onde a falta dela deixava a maior da casa inalcancavel.
    // Mora em `shared/texto/nome-exato`, e as duas buscas usam a mesma.
    const candidatas = preferirExato(
      ativas.filter((v) => normalizarNome(v.nome).includes(busca)),
      nome,
      (v) => v.nome,
    );
    if (candidatas.length === 1) return achou(candidatas[0]);
    if (candidatas.length > 1) {
      return { status: 'AMBIGUA', nomes: nomesDe(candidatas) };
    }

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

// O `normalizar` local saiu em 28/10/2026, junto da regra do exato: os dois
// moram em `shared/texto/nome-exato`, porque a busca de empresa precisava da
// MESMA regra — e te-la escrita duas vezes e o jeito de uma delas ficar atras.
