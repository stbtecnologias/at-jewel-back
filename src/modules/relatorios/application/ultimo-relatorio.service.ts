import { Injectable, Logger } from '@nestjs/common';
import type { Relatorio } from '../domain/relatorio';

/**
 * Duas horas, o mesmo TTL da memória de conversa do canal interno.
 *
 * E pelo mesmo motivo: "manda em PDF" se refere ao que acabou de ser
 * respondido. Um pedido feito no dia seguinte falaria de outra coisa, e o
 * arquivo sairia com o dado de ontem parecendo o de hoje.
 */
const TTL_MS = 2 * 60 * 60_000;

/** Teto de conversas guardadas ao mesmo tempo, como na memória de conversa. */
const MAX = 200;

interface Guardado {
  relatorio: Relatorio;
  em: number;
  /**
   * QUANTAS MENSAGENS SE PASSARAM desde que esta tabela foi montada.
   *
   * 0 = montada NESTA mensagem. 1 = na anterior, que é o caso normal do
   * "manda em PDF". Daí para cima a pessoa já perguntou outra coisa, e esta
   * tabela deixou de ser "o que acabou de sair".
   */
  idade: number;
}

/**
 * O ÚLTIMO RESULTADO QUE PODE VIRAR ARQUIVO — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * É O PASSO 2 DA CONCEPÇÃO DE 24/09, E A RAZÃO DELE É UMA SÓ.
 *
 * Havia dois caminhos para o PDF, e a diferença não era de esforço:
 *
 *   (a) o modelo REDIGITA os dados dentro do arquivo — e é exatamente ali que
 *       nasce o erro que ninguém confere: a Camila tem 4 contatos e o PDF sai
 *       com 3;
 *   (b) o arquivo é montado do RESULTADO DA FERRAMENTA.
 *
 * **Escolha do Lucas: (b).** *"O modelo decide o que vai no papel; o dado não
 * passa por ele."*
 *
 * Então a ferramenta, ao responder, guarda aqui a tabela que montou. Quando
 * vier "manda em PDF", o modelo escolhe só **o formato** — e o documento sai
 * deste dado, que é o mesmo que ela acabou de ler na tela.
 * ==========================================================================
 *
 * VIVE NA RAM, como a memória de conversa, e pela mesma razão: é "o que
 * estávamos falando agora", expira sozinho e não é registro. Reiniciar o
 * container apaga — e o efeito é a pessoa reperguntar, que é barato.
 *
 * A CHAVE É A MESMA da memória de conversa (`gestao:<id>`,
 * `vendedora:<id>`), e isso não é economia: é o que garante que o arquivo
 * saia do que AQUELA pessoa perguntou. Chaveando por telefone, um número que
 * trocasse de dono herdaria a tabela de quem tinha antes.
 */
@Injectable()
export class UltimoRelatorioService {
  private readonly logger = new Logger(UltimoRelatorioService.name);
  private readonly porChave = new Map<string, Guardado>();

  /**
   * A ferramenta acabou de responder, e isto é o que ela respondeu.
   *
   * Chamado por quem PRODUZ a tabela, e não por quem a escreve em texto: é o
   * que mantém o dado longe do modelo.
   */
  guardar(chave: string | null | undefined, relatorio: Relatorio): void {
    if (!chave) return;
    if (this.porChave.size >= MAX && !this.porChave.has(chave)) {
      this.descartarMaisAntigo();
    }
    this.porChave.set(chave, { relatorio, em: Date.now(), idade: 0 });
  }

  /**
   * CHEGOU MENSAGEM NOVA: o que estava guardado fica um passo mais velho.
   *
   * ========================================================================
   * SEM ISTO, O ARQUIVO MENTE — e mentiu em 21/10, às 14:14.
   *
   * O Lucas perguntou as vendas da Camila, depois perguntou o FATURAMENTO POR
   * EMPRESA de setembro, e então pediu "o pdf disso". Saiu um arquivo chamado
   * "faturamento-por-empresa-setembro.pdf" com as dez linhas das vendas da
   * Camila dentro. Um documento que parece certo e está errado — exatamente o
   * que a concepção de 24/09 queria evitar, reintroduzido por outro caminho.
   *
   * A causa é que "o último resultado" não sabia de QUAL pergunta era. A
   * ferramenta de faturamento não guarda tabela (ainda), então o guardado
   * continuou sendo o de duas perguntas atrás.
   *
   * Envelhecendo a cada mensagem, "o que acabou de sair" volta a significar
   * isso: uma pergunta respondida sem tabela empurra a anterior para fora do
   * alcance, e a agente passa a dizer que precisa consultar antes.
   * ========================================================================
   */
  envelhecer(chave: string | null | undefined): void {
    if (!chave) return;
    const g = this.porChave.get(chave);
    if (g) g.idade += 1;
  }

  /** O que dá para mandar em arquivo agora, ou `null` se não há nada vivo. */
  pegar(chave: string | null | undefined): Relatorio | null {
    if (!chave) return null;
    const g = this.porChave.get(chave);
    if (!g) return null;
    if (Date.now() - g.em > TTL_MS) {
      this.porChave.delete(chave);
      this.logger.debug('Último relatório expirou — nada a mandar.');
      return null;
    }
    // ====================================================================
    // SO VALE A TABELA DESTA MENSAGEM OU DA ANTERIOR.
    //
    // 1 e o caso normal: ela perguntou, leu, e agora pede o arquivo. 0
    // acontece quando consulta e pedido vem na MESMA frase ("me manda as
    // vendas da Camila em PDF"). Dai para cima, outra pergunta passou no
    // meio — e mandar esta tabela seria responder a pergunta errada com a
    // cara de certa.
    // ====================================================================
    if (g.idade > 1) {
      this.logger.debug(
        `Último relatório tem ${g.idade} mensagens — velho demais para virar arquivo.`,
      );
      return null;
    }
    return g.relatorio;
  }

  esquecer(chave: string): void {
    this.porChave.delete(chave);
  }

  private descartarMaisAntigo(): void {
    let alvo: string | null = null;
    let menor = Infinity;
    for (const [chave, g] of this.porChave) {
      if (g.em < menor) {
        menor = g.em;
        alvo = chave;
      }
    }
    if (alvo) this.porChave.delete(alvo);
  }
}
