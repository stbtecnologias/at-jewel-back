import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgenteDaCasa } from '../domain/agente-da-casa';

/**
 * Qual sessao do WAHA e de qual agente — a unica fonte da verdade disso.
 *
 * ==========================================================================
 * SEM `WAHA_SESSION_ELENA`, NADA MUDA. E ISSO E DE PROPOSITO.
 *
 * A separacao so LIGA quando o segundo numero e configurado. Enquanto o env
 * nao existir, ha uma sessao da casa so e ela atende todo mundo, exatamente
 * como antes de 25/09/2026 — o codigo novo pode subir dias antes de o chip
 * chegar, sem ninguem ficar sem canal no meio.
 *
 * O CUSTO, E ELE FICA DITO: ligando o env ANTES de ler o QR, a vendedora que
 * escrever para a Anastasia ouve "me chama no outro numero" apontando para um
 * numero que ainda nao atende. A ordem certa e: configurar, subir, LER O QR, e
 * so entao anunciar para a equipe.
 * ==========================================================================
 *
 * TODA TRADUCAO AGENTE <-> SESSAO PASSA POR AQUI. Antes de 25/09 havia sete
 * lugares lendo `WAHA_SESSION` por conta propria — quatro deles dentro do
 * gateway. Com dois numeros isso viraria sete chances de divergir.
 */
@Injectable()
export class SessoesDaCasaService {
  constructor(private readonly config: ConfigService) {}

  /**
   * A sessao da Anastasia — a historica, e ela CONTINUA SENDO `WAHA_SESSION`.
   *
   * Nao ganhou um `WAHA_SESSION_ANASTASIA` para fazer par com o da Elena:
   * decisao do Lucas em 25/09, porque local e producao ja tem
   * `WAHA_SESSION=default` gravado, e um segundo nome para o mesmo valor cria
   * mais duvida do que simetria resolve.
   */
  get anastasia(): string {
    return this.config.get<string>('WAHA_SESSION')?.trim() || 'default';
  }

  /**
   * A sessao da Elena, ou `null` enquanto ninguem configurou o segundo numero.
   *
   * `null` NAO e erro: e o estado de um numero so, que e como o sistema viveu
   * ate aqui. Tambem devolve `null` se alguem apontar as duas para a mesma
   * sessao — nesse caso nao ha separacao nenhuma, e fingir que ha seria pior:
   * a vendedora ouviria "me chama no outro numero" no proprio numero certo.
   */
  get elena(): string | null {
    const nome = this.config.get<string>('WAHA_SESSION_ELENA')?.trim();
    if (!nome || nome === this.anastasia) return null;
    return nome;
  }

  /** true quando os dois numeros existem de fato. */
  get separadas(): boolean {
    return this.elena !== null;
  }

  /** As sessoes da casa, na ordem em que aparecem na tela de Conexoes. */
  get todas(): string[] {
    const elena = this.elena;
    return elena ? [this.anastasia, elena] : [this.anastasia];
  }

  /**
   * De quem e esta sessao — `null` quando nao e da casa.
   *
   * ISTO E LISTA DE PERMISSAO, e nao classificacao. Sessao de vendedora,
   * sessao de teste, sessao que alguem criou na mao: todas caem em `null`, que
   * e o unico valor seguro. O `atwpp` aprendeu isso do jeito ruim em 09/09,
   * quando "qualquer outra sessao -> Anastasia" fez a IA responder a cliente
   * pelo numero PESSOAL de uma vendedora.
   */
  agenteDa(sessao: string): AgenteDaCasa | null {
    if (sessao === this.anastasia) return 'ANASTASIA';
    if (this.elena !== null && sessao === this.elena) return 'ELENA';
    return null;
  }

  ehDaCasa(sessao: string): boolean {
    return this.agenteDa(sessao) !== null;
  }

  /**
   * Por qual sessao este agente fala.
   *
   * Sem o segundo numero, a Elena fala pela sessao unica — senao todo aviso de
   * vendedora sairia por uma sessao que nao existe, e o envio falharia calado.
   */
  sessaoDe(agente: AgenteDaCasa): string {
    if (agente === 'ELENA') return this.elena ?? this.anastasia;
    return this.anastasia;
  }

  /** O rotulo da linha na tela de Conexoes. */
  rotuloDe(sessao: string): string {
    const agente = this.agenteDa(sessao);
    if (agente === 'ELENA') return 'Elena (vendedoras e catálogo)';
    // Com um numero so ele ainda e "a loja", que e como a tela sempre o
    // chamou; separados, cada um ganha o nome de quem atende.
    return this.separadas ? 'Anastasia (gestão)' : 'Loja (Anastasia)';
  }
}
