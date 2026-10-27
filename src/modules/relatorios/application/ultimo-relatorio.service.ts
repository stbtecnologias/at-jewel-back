import { Injectable, Logger } from '@nestjs/common';
import type { Relatorio } from '../domain/relatorio';
import type { RecorteDoPedido } from '../domain/recorte-do-pedido';
import { somarRelatorios } from '../domain/somar-relatorios';

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
  /**
   * Veio de uma ferramenta que montou TABELA de verdade, com colunas?
   *
   * O que vem do funil genérico é uma lista de uma coluna só — fiel, mas
   * pobre. Marcando quem é rico, a captura genérica deixa de atropelar as
   * ferramentas que já fazem melhor.
   */
  rico: boolean;
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

    // ====================================================================
    // A SEGUNDA TABELA DA MESMA MENSAGEM SE SOMA À PRIMEIRA — 27/10/2026.
    //
    // `set` sozinho é a razão pela qual *"as vendas da Ylka em 2025 e
    // 2026"* virou um PDF só com 2026: são duas chamadas, uma por ano — como
    // a instrução de `de`/`ate` manda —, e a segunda apagava a primeira
    // sem deixar sinal. Ver `somarRelatorios`.
    //
    // SÓ DENTRO DA MESMA MENSAGEM (`idade === 0`). Na seguinte a pessoa já
    // perguntou outra coisa, e somar ali juntaria duas perguntas num papel.
    // ====================================================================
    const atual = this.porChave.get(chave);
    if (atual?.rico && atual.idade === 0) {
      const somado = somarRelatorios(atual.relatorio, relatorio);
      if (somado) {
        this.logger.debug(
          `Duas tabelas na mesma mensagem — somadas em ${somado.linhas.length} linhas.`,
        );
        this.porChave.set(chave, {
          relatorio: somado,
          em: Date.now(),
          idade: 0,
          rico: true,
        });
        return;
      }
    }

    if (this.porChave.size >= MAX && !this.porChave.has(chave)) {
      this.descartarMaisAntigo();
    }
    this.porChave.set(chave, {
      relatorio,
      em: Date.now(),
      idade: 0,
      rico: true,
    });
  }

  /**
   * QUALQUER CONSULTA RESPONDEU, e o texto dela pode virar arquivo.
   *
   * ========================================================================
   * É O QUE FAZ *TODA* PERGUNTA TER PDF — pedido do Lucas em 21/10:
   * *"queria que todas as consultas virassem PDF ou CSV, assim elas podem
   * pedir quando quiser"*.
   *
   * O texto é o que a FERRAMENTA escreveu, não o que o modelo falou — ele
   * passa pelo mesmo funil onde mora a guarda de `tool_result` vazio. Então
   * a regra de 24/09 continua de pé: o dado não passa pelo modelo.
   *
   * UMA COLUNA SÓ, e isso é honesto em vez de esperto. Separar aquelas
   * linhas em colunas exigiria adivinhar onde um campo acaba e outro começa
   * — e um relatório com a coluna errada é pior que um com uma coluna só.
   * As ferramentas que montam tabela de verdade continuam ganhando desta,
   * porque `rico` manda.
   * ========================================================================
   */
  guardarTexto(
    chave: string | null | undefined,
    titulo: string,
    texto: string,
    opcoes?: { coluna?: string; recorte?: RecorteDoPedido | null },
  ): void {
    if (!chave) return;

    // NÃO ATROPELA O RICO DA MESMA MENSAGEM: a consulta de vendas guarda a
    // tabela com sete colunas antes de o texto dela chegar aqui.
    const atual = this.porChave.get(chave);
    if (atual && atual.rico && atual.idade === 0) return;

    // O MARCADOR DE LISTA SAI: "• Fulana — R$ 1.000" vira "Fulana — R$ 1.000".
    // O ponto existe para a frase no WhatsApp; numa tabela ele e sujeira na
    // frente de toda linha.
    // ====================================================================
    // OS DADOS SAO AS LINHAS MARCADAS COM "- ", E ISSO NAO E CHUTE.
    //
    // Conferido em 21/10: as 20 ferramentas que devolvem lista montam o
    // texto do MESMO jeito — `linhas.map((l) => `- ${l}`)`. O que esta fora
    // desse prefixo e recado para o MODELO, e foi o que vazou no primeiro
    // PDF de itens mais vendidos: "Repasse os numeros exatamente como estao"
    // saiu impresso num documento feito para gente.
    //
    // E SE NAO HOUVER NENHUMA, nao ha tabela — a resposta era prosa. Guardar
    // um paragrafo como se fosse lista produziria um PDF de uma linha so,
    // com cara de relatorio. Melhor a agente dizer que precisa consultar.
    // ====================================================================
    const dados = texto
      .split(String.fromCharCode(10))
      .filter((x) => /^\s*-\s+/.test(x))
      .map((x) => x.replace(/^\s*-\s+/, '').trim())
      .filter((x) => x.length > 0);
    if (dados.length === 0) {
      // ==================================================================
      // CONSULTA QUE RESPONDEU EM PROSA INVALIDA A TABELA ANTERIOR.
      //
      // Era so `return`, e isso deixava a tabela de antes no lugar. E o
      // caminho exato do arquivo errado das 14:14: ela pergunta outra coisa,
      // a resposta vem em frase ("nenhuma empresa teve movimento"), e o
      // "manda em PDF" seguinte mandaria a tabela de duas perguntas atras
      // com cara de ser a de agora.
      //
      // SO O QUE VEIO DE MENSAGEM ANTERIOR e descartado: no mesmo turno uma
      // ferramenta pode responder em frase depois de outra ter montado a
      // tabela, e ai a tabela e da pergunta de agora.
      // ==================================================================
      if (atual && atual.idade > 0) this.porChave.delete(chave);
      return;
    }

    // ====================================================================
    // DUAS COLUNAS QUANDO TODAS AS LINHAS TEM O TRAVESSAO.
    //
    // A casa escreve lista como "o que — quanto": "BRINCO AMETISTA ... — R$
    // 207.269". Quebrando no ULTIMO travessao, o valor ganha coluna propria,
    // alinhada a direita, e a tabela passa a somar com o olho.
    //
    // TODAS, e nao a maioria: com uma linha fora do padrao a segunda coluna
    // ficaria vazia naquela linha, e tabela com buraco e pior que lista.
    // ====================================================================
    const SEP = ' ' + String.fromCharCode(0x2014) + ' ';
    const partido = dados.every((d) => d.includes(SEP))
      ? dados.map((d) => {
          const corte = d.lastIndexOf(SEP);
          return {
            o: d.slice(0, corte).trim(),
            q: d.slice(corte + SEP.length).trim(),
          };
        })
      : null;

    if (this.porChave.size >= MAX && !this.porChave.has(chave)) {
      this.descartarMaisAntigo();
    }
    // ====================================================================
    // O RECORTE VAI NO TÍTULO — 26/10/2026.
    //
    // "Itens mais vendidos" vira "Itens mais vendidos — Camila · agosto de
    // 2026". Sem isto, dois PDFs de meses diferentes saem com o mesmo nome e
    // a mesma cara, e quem abre três dias depois não sabe qual é qual.
    //
    // E O CARIMBO MUDA DE PALAVRA quando o período já está no título:
    // "Posição em" é a posição do DADO, e vale para estoque e para o dia de
    // hoje, que envelhecem em horas. Num relatório de agosto lido em outubro
    // essa frase mente — ali o que a hora diz é só quando foi lido.
    //
    // O período não se repete nas duas: a decisão de 21/10 é que o recorte
    // mora no título, e não numa segunda linha que diga o mesmo.
    // ====================================================================
    const recorte = opcoes?.recorte;
    const comRecorte = recorte?.titulo
      ? `${titulo} — ${recorte.titulo}`
      : titulo;

    this.porChave.set(chave, {
      relatorio: {
        titulo: comRecorte,
        posicao: recorte?.periodo
          ? `Lido em ${agora()}`
          : `Posição em ${agora()}`,
        colunas: partido
          ? [
              { chave: 'o', titulo: opcoes?.coluna ?? titulo, peso: 4 },
              {
                chave: 'q',
                titulo: 'Valor',
                peso: 1.4,
                alinhamento: 'direita' as const,
                mono: true,
              },
            ]
          : [{ chave: 'o', titulo: opcoes?.coluna ?? titulo }],
        linhas: partido ?? dados.map((o) => ({ o })),
      },
      em: Date.now(),
      idade: 0,
      rico: false,
    });
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

    // ====================================================================
    // SERVIU, LOGO REJUVENESCEU — e isso e o "e em planilha tambem?".
    //
    // Sem esta linha a pergunta seguinte sobre a MESMA tabela chegaria com
    // idade 2 e seria recusada: ela pediu o PDF, leu, e pede a planilha do
    // mesmo recorte. Nao passou outra pergunta no meio — passou a resposta
    // desta.
    //
    // E nao reabre o buraco das 14:14: o que invalida a tabela e outra
    // CONSULTA ter respondido, nao o tempo. Ver o `delete` em `guardarTexto`.
    // ====================================================================
    g.idade = 0;
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

/** A data e a hora de agora, para o carimbo de posição do relatório. */
function agora(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
