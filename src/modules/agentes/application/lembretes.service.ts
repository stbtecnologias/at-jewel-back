import { Inject, Injectable, Logger } from '@nestjs/common';
import { LEMBRETES_REPOSITORY } from '../domain/ports/injection-tokens';
import type {
  ILembretesRepository,
  Lembrete,
} from '../domain/ports/repositories/lembretes-repository.port';
import {
  interpretarInstante,
  quandoEmPalavras,
} from '../../../shared/tempo/instante';

/**
 * Teto de tamanho do lembrete.
 *
 * Nao e limite de banco — a coluna e `text`. E o limite de uma coisa que vai
 * voltar como mensagem de WhatsApp: acima disso deixa de ser lembrete e vira
 * anotacao, e anotacao nao toca hora marcada.
 */
export const TETO_TEXTO = 400;

/**
 * Quantos PENDENTES uma pessoa pode ter.
 *
 * Diferente do teto dos combinados, que existe por custo de prompt: aqui o
 * custo e da propria pessoa. Cinquenta lembretes abertos e mais do que cabe
 * numa lista que ela vai ler no celular, e passar disso quase sempre e um
 * laco — alguem pedindo a mesma coisa de novo porque a primeira nao pareceu
 * ter funcionado.
 */
export const TETO_PENDENTES = 50;

/** Teto de meses do lembrete. Menor que o de agendar contato, que e 180. */
const DIAS_MAXIMOS = 365;

export type ResultadoGuardar =
  | { status: 'OK'; lembrete: Lembrete }
  | { status: 'VAZIO' }
  | { status: 'LONGO'; teto: number }
  | { status: 'CHEIO'; teto: number }
  | { status: 'HORARIO_INVALIDO' };

export type ResolucaoLembrete =
  | { status: 'ACHOU'; lembrete: Lembrete }
  | { status: 'AMBIGUO'; opcoes: Lembrete[] }
  | { status: 'NAO_ENCONTRADO'; abertos: Lembrete[] };

/**
 * OS LEMBRETES PESSOAIS DA GESTAO — 30/09/2026.
 *
 * ==========================================================================
 * POR QUE ISTO NAO MORA NO `FerramentasGestaoService`.
 *
 * Segue o precedente dos combinados (`processar-mensagem-gestao.use-case.ts`):
 * ferramenta ligada A PESSOA, e nao a dado de negocio, e montada fora — e o
 * unico lugar do codigo que ja recebe `usuarioId` na hora do despacho.
 *
 * A consequencia e a que importa: o dono entra por CLOSURE. Nenhuma das
 * quatro ferramentas aceita "de quem". Nao ha campo para o modelo preencher
 * errado, nem regra de prompt segurando escopo — e a mesma propriedade que
 * torna as ferramentas da Helena imunes a injecao.
 * ==========================================================================
 *
 * ==========================================================================
 * LEMBRETE NAO E COMBINADO, e a agente confundia os dois.
 *
 * Em 30/09 o Lucas pediu "me lembra de falar com as vendedoras daqui a 20
 * minutos" e ela ofereceu guardar um COMBINADO — que e regra permanente do
 * system prompt, e so faria ela repetir a frase quando ele voltasse.
 *
 *   combinado — vale sempre, em toda conversa, ate mandarem esquecer
 *   lembrete  — vale UMA vez, na hora marcada, e vai atras da pessoa
 *
 * A persona tem uma linha sobre isso. Esta e a metade que faz.
 * ==========================================================================
 */
@Injectable()
export class LembretesService {
  private readonly logger = new Logger(LembretesService.name);

  constructor(
    @Inject(LEMBRETES_REPOSITORY)
    private readonly repo: ILembretesRepository,
  ) {}

  async guardar(
    donoId: string,
    texto: string,
    quandoIso: string,
  ): Promise<ResultadoGuardar> {
    const limpo = texto.trim().replace(/\s+/g, ' ');
    if (!limpo) return { status: 'VAZIO' };
    if (limpo.length > TETO_TEXTO) return { status: 'LONGO', teto: TETO_TEXTO };

    const quando = interpretarInstante(quandoIso, DIAS_MAXIMOS);
    if (!quando) return { status: 'HORARIO_INVALIDO' };

    // O TETO E CONFERIDO ANTES DE GRAVAR. Gravar e depois avisar deixaria o
    // quinquagesimo primeiro no banco, valendo, e a pessoa achando que nao
    // guardou — um lembrete que existe sem ninguem saber e pior que nenhum.
    if ((await this.repo.contarPendentes(donoId)) >= TETO_PENDENTES) {
      return { status: 'CHEIO', teto: TETO_PENDENTES };
    }

    const lembrete = await this.repo.guardar(donoId, limpo, quando);
    // O TEXTO NAO ENTRA NO LOG. So o id — e o bastante para investigar.
    this.logger.log(`Lembrete ${lembrete.id} guardado.`);
    return { status: 'OK', lembrete };
  }

  listar(donoId: string): Promise<Lembrete[]> {
    return this.repo.listar(donoId);
  }

  /**
   * Acha o lembrete que a pessoa quis dizer.
   *
   * ========================================================================
   * DOIS JEITOS DE APONTAR, E OS DOIS SAO DE GENTE.
   *
   * Por NUMERO ("cancela o segundo") e por TEXTO ("o lembrete da Faby"). O
   * numero e o padrao do `esquecer_combinado`; o texto e o do
   * `ResolverVendedoraPorNome`, com NFD, exato antes de parcial.
   *
   * A BUSCA E EM MEMORIA porque a coluna e cifrada — e isso nao e contorno,
   * e consequencia de nao existir hash ao lado. Sao poucos lembretes abertos
   * por pessoa, e carregar os dela e mais barato que manter um indice que
   * permitiria correlacionar lembretes iguais de pessoas diferentes.
   *
   * NUNCA ESCOLHE O PRIMEIRO no empate. Em 30/09 a auditoria achou uma
   * resolucao que devolvia sugestoes fora do escopo justamente por escolher
   * sozinha; aqui o empate volta como pergunta.
   * ========================================================================
   */
  async resolver(donoId: string, qual: string): Promise<ResolucaoLembrete> {
    const abertos = await this.repo.listar(donoId);
    if (abertos.length === 0) return { status: 'NAO_ENCONTRADO', abertos };

    const posicao = posicaoDe(qual);
    if (posicao !== null) {
      const alvo = abertos[posicao - 1];
      return alvo
        ? { status: 'ACHOU', lembrete: alvo }
        : { status: 'NAO_ENCONTRADO', abertos };
    }

    const alvoTexto = normalizar(qual);
    if (!alvoTexto) return { status: 'NAO_ENCONTRADO', abertos };

    const exatos = abertos.filter((l) => normalizar(l.texto) === alvoTexto);
    if (exatos.length === 1) return { status: 'ACHOU', lembrete: exatos[0] };
    if (exatos.length > 1) return { status: 'AMBIGUO', opcoes: exatos };

    const parciais = abertos.filter((l) =>
      normalizar(l.texto).includes(alvoTexto),
    );
    if (parciais.length === 1) return { status: 'ACHOU', lembrete: parciais[0] };
    if (parciais.length > 1) return { status: 'AMBIGUO', opcoes: parciais };

    return { status: 'NAO_ENCONTRADO', abertos };
  }

  /**
   * As quatro ferramentas prontas para o `chatComFerramentas`.
   *
   * Todas as frases sao montadas AQUI, no servidor, e nao pelo modelo — e a
   * mesma regra de `mensagemDoAgendamento`: o veredito vem primeiro, para a
   * agente nao anunciar sucesso sobre um resultado negativo.
   */
  handlers(usuarioId: string) {
    const listaNumerada = (itens: Lembrete[]) =>
      itens.map((l, i) => `${i + 1}. ${linhaDe(l)}`);

    return {
      guardarLembrete: async ({
        texto,
        quandoIso,
      }: {
        texto: string;
        quandoIso: string;
      }) => {
        const r = await this.guardar(usuarioId, texto, quandoIso);
        switch (r.status) {
          case 'OK':
            return {
              mensagem:
                `Guardado: "${r.lembrete.texto}". ` +
                `Eu te aviso ${quandoEmPalavras(r.lembrete.quando)}.`,
            };
          case 'VAZIO':
            return {
              mensagem:
                'NÃO GUARDEI — não veio o que lembrar. Pergunte o que é.',
            };
          case 'LONGO':
            return {
              mensagem:
                `NÃO GUARDEI — passou de ${r.teto} caracteres. ` +
                'Peça uma versão mais curta.',
            };
          case 'CHEIO':
            return {
              mensagem:
                `NÃO GUARDEI — já são ${r.teto} lembretes esperando. ` +
                'Diga que é preciso cancelar algum antes.',
            };
          case 'HORARIO_INVALIDO':
            return {
              mensagem:
                'NÃO GUARDEI — o horário não serve: precisa ser no futuro e ' +
                'dentro de um ano. Pergunte para quando é, sem escolher você.',
            };
        }
      },

      meusLembretes: async () => {
        const abertos = await this.listar(usuarioId);
        return abertos.length === 0
          ? { linhas: ['Nenhum lembrete guardado.'] }
          : { linhas: listaNumerada(abertos) };
      },

      remarcarLembrete: async ({
        qual,
        quandoIso,
      }: {
        qual: string;
        quandoIso: string;
      }) => {
        const quando = interpretarInstante(quandoIso, DIAS_MAXIMOS);
        if (!quando) {
          return {
            mensagem:
              'NÃO REMARQUEI — o horário não serve: precisa ser no futuro e ' +
              'dentro de um ano. Pergunte para quando é.',
          };
        }

        const r = await this.resolver(usuarioId, qual);
        if (r.status !== 'ACHOU') return { mensagem: naoAchei(r, listaNumerada) };

        const ok = await this.repo.remarcar(r.lembrete.id, usuarioId, quando);
        if (!ok) {
          return { mensagem: 'NÃO REMARQUEI — esse lembrete não está mais aberto.' };
        }
        this.logger.log(`Lembrete ${r.lembrete.id} remarcado.`);
        return {
          mensagem:
            `Remarcado: "${r.lembrete.texto}" — agora ${quandoEmPalavras(quando)}.`,
        };
      },

      cancelarLembrete: async ({ qual }: { qual: string }) => {
        const r = await this.resolver(usuarioId, qual);
        if (r.status !== 'ACHOU') return { mensagem: naoAchei(r, listaNumerada) };

        const ok = await this.repo.cancelar(r.lembrete.id, usuarioId);
        if (!ok) {
          return { mensagem: 'NÃO CANCELEI — esse lembrete não está mais aberto.' };
        }
        this.logger.log(`Lembrete ${r.lembrete.id} cancelado.`);
        return { mensagem: `Cancelado: "${r.lembrete.texto}".` };
      },
    };
  }
}

/** Uma linha de lista: a hora, o texto, e o aviso quando o lembrete se perdeu. */
function linhaDe(l: Lembrete): string {
  const base = `${quandoEmPalavras(l.quando)} — ${l.texto}`;
  return l.estado === 'PERDIDO' ? `${base} (NÃO FOI ENVIADO na hora)` : base;
}

/** A resposta dos dois caminhos que nao acharam. Devolve a PERGUNTA a ser feita. */
function naoAchei(
  r: Exclude<ResolucaoLembrete, { status: 'ACHOU' }>,
  listaNumerada: (itens: Lembrete[]) => string[],
): string {
  if (r.status === 'AMBIGUO') {
    return (
      'NÃO FIZ NADA — mais de um lembrete bate com isso:\n' +
      listaNumerada(r.opcoes).join('\n') +
      '\n\nPergunte qual, pelo número.'
    );
  }
  return r.abertos.length === 0
    ? 'NÃO FIZ NADA — não há lembrete nenhum guardado.'
    : 'NÃO FIZ NADA — não achei esse lembrete. Os que existem:\n' +
        listaNumerada(r.abertos).join('\n');
}

/**
 * "2", "o 2", "segundo" -> 2. Qualquer outra coisa -> `null`, e a busca vai
 * por texto.
 *
 * So digitos de verdade viram posicao: um lembrete chamado "ligar as 3" nao
 * pode virar "o terceiro" so porque tem um numero dentro.
 */
function posicaoDe(qual: string): number | null {
  const m = qual.trim().match(/^(?:o |a )?(\d{1,2})[oa°º]?$/i);
  if (m) return Number(m[1]);

  const ordinais: Record<string, number> = {
    primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
    quarto: 4, quarta: 4, quinto: 5, quinta: 5,
  };
  const n = ordinais[normalizar(qual).replace(/^(o|a) /, '')];
  return n ?? null;
}

function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
