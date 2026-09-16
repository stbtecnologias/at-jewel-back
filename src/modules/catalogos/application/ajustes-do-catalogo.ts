import type { PaletaDoCatalogo } from '../domain/ports/estilo-catalogo.port';
import {
  nomeDaModelo,
  type PaginaDoPdf,
  type PlanoDaMontagem,
} from './plano-da-montagem';

/**
 * O AJUSTE DO CATÁLOGO, PÁGINA POR PÁGINA — as ações e a regra de cada uma.
 *
 * ==========================================================================
 * UMA LISTA FECHADA, E O TEXTO DA TELA É NOSSO — 16/09/2026.
 *
 * A pessoa escreve do jeito dela ("na página 4 a modelo sorrindo, tira o
 * colar de turquesa"); o Claude traduz para AÇÕES desta lista; e cada ação é
 * CONFERIDA contra o plano da versão que a pessoa viu antes de valer. O que a
 * IA devolver fora disso vira "não entendi", nunca uma mudança.
 *
 * A DESCRIÇÃO QUE A TELA MOSTRA É MONTADA AQUI, a partir da ação conferida, e
 * não é a frase da IA. O que a pessoa confirma é o que vai ser feito — se a
 * IA dissesse "página 4" e apontasse para a 5, a descrição mostraria a 5.
 *
 * PREÇO, CÓDIGO E DESCRIÇÃO NÃO ESTÃO NA LISTA. Vêm do banco, e nenhum
 * caminho de ajuste escreve dinheiro.
 * ==========================================================================
 */

export type AcaoDeAjuste =
  | { tipo: 'refazer_modelo'; fotoId: string; instrucao: string }
  | {
      tipo: 'trocar_modelo';
      fotoId: string;
      novaFotoId: string;
      instrucao: string | null;
    }
  | { tipo: 'refazer_capa'; instrucao: string }
  | { tipo: 'refazer_fundo'; instrucao: string }
  | { tipo: 'trocar_frase'; frase: string }
  | { tipo: 'tirar_peca'; fotoId: string }
  | { tipo: 'mover_peca'; fotoId: string; pagina: number }
  | { tipo: 'mudar_cores'; paleta: PaletaDoCatalogo };

export type AcaoComDescricao = AcaoDeAjuste & { descricao: string };

/** O que se sabe da versão que a pessoa viu. */
export interface ContextoDoAjuste {
  paginas: PaginaDoPdf[];
  temTema: boolean;
  /** As peças que estão no PDF, pelo id da foto. */
  pecas: Map<string, { codigo: string | null; descricao: string | null }>;
}

/** Uma tarefa de geração de imagem que o ajuste pede. */
export type GeracaoPedida =
  | { tipo: 'modelo'; fotoId: string; instrucao: string | null }
  | { tipo: 'capa' | 'fundo'; instrucao: string };

const MAX_INSTRUCAO = 300;
const MAX_FRASE = 60;
const HEX = /^#[0-9a-f]{6}$/i;

/** Frase com preço ou parcela não é frase de capa. */
const PARECE_DINHEIRO = /r\$|\d+\s*x\b/i;

// ---------------------------------------------------------------------------
// O resumo que a IA lê
// ---------------------------------------------------------------------------

/**
 * O PDF em texto, página por página, com os números que a pessoa vê.
 *
 * Vai o CÓDIGO e a descrição de cada peça — é como a pessoa fala ("o colar de
 * turquesa") e como a IA acha o código. NÃO VAI PREÇO: não é ajustável, e
 * não há por que mandar dinheiro para fora.
 */
export function resumoDoPdf(
  ctx: ContextoDoAjuste,
  capa: { nome: string; tema: string | null; frase: string | null },
): string {
  const peca = (id: string) => {
    const p = ctx.pecas.get(id);
    return `${p?.codigo ?? 'sem código'} (${p?.descricao ?? 'sem descrição'})`;
  };

  const linhas = [
    ctx.temTema
      ? 'Catálogo COM TEMA: capa com arte, fundo decorado, páginas de modelo.'
      : 'Catálogo SEM TEMA: branco, sem arte, sem modelo, sem cores próprias.',
  ];
  for (const p of ctx.paginas) {
    switch (p.tipo) {
      case 'capa':
        linhas.push(
          `Página ${p.numero} — CAPA. Título: "${capa.nome}".` +
            (capa.tema ? ` Tema: "${capa.tema}".` : '') +
            (capa.frase ? ` Frase: "${capa.frase}".` : ''),
        );
        break;
      case 'modelo':
        linhas.push(`Página ${p.numero} — MODELO usando ${peca(p.fotoId)}.`);
        break;
      case 'grade':
        linhas.push(
          `Página ${p.numero} — JOIAS: ${p.fotoIds.map(peca).join('; ')}.`,
        );
        break;
      case 'contracapa':
        linhas.push(`Página ${p.numero} — CONTRACAPA (só a marca).`);
        break;
    }
  }
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Da resposta da IA para ações conferidas
// ---------------------------------------------------------------------------

/**
 * A resposta do Claude, traduzida e conferida.
 *
 * Cada item vira ação válida OU um "não entendi" com o motivo — nunca some
 * calado. Quem escreveu cinco pedidos tem de ver cinco respostas.
 */
export function traduzir(
  bruto: unknown,
  ctx: ContextoDoAjuste,
): { acoes: AcaoComDescricao[]; naoEntendi: string[] } {
  const r = (bruto ?? {}) as { acoes?: unknown; nao_entendi?: unknown };
  const acoes: AcaoComDescricao[] = [];
  const naoEntendi: string[] = [];

  if (Array.isArray(r.nao_entendi)) {
    for (const t of r.nao_entendi.slice(0, 10)) {
      if (typeof t === 'string' && t.trim()) {
        naoEntendi.push(t.trim().slice(0, 300));
      }
    }
  }

  for (const item of Array.isArray(r.acoes) ? r.acoes.slice(0, 20) : []) {
    const candidata = daIa(item as Record<string, unknown>, ctx);
    if (typeof candidata === 'string') {
      naoEntendi.push(candidata);
      continue;
    }
    const erro = checar(candidata, ctx);
    if (erro) naoEntendi.push(erro);
    else acoes.push({ ...candidata, descricao: descrever(candidata, ctx) });
  }

  return { acoes, naoEntendi };
}

/**
 * As ações que a TELA devolve para aplicar, conferidas de novo.
 *
 * A tela só as recebeu daqui, mas a rota é pública para quem tem o token: o
 * que chega pela rede é conferido como se fosse a primeira vez.
 */
export function conferir(
  brutas: unknown[],
  ctx: ContextoDoAjuste,
): { acoes: AcaoDeAjuste[]; erros: string[] } {
  const acoes: AcaoDeAjuste[] = [];
  const erros: string[] = [];
  for (const b of brutas) {
    const acao = normalizar(b);
    const erro = acao ? checar(acao, ctx) : 'Ajuste em formato desconhecido.';
    if (erro) erros.push(erro);
    else acoes.push(acao!);
  }
  return { acoes, erros };
}

/** O item da IA, que fala em PÁGINA e CÓDIGO, para a ação, que fala em id. */
function daIa(
  item: Record<string, unknown>,
  ctx: ContextoDoAjuste,
): AcaoDeAjuste | string {
  const tipo = typeof item?.tipo === 'string' ? item.tipo : '';
  const pagina = Number(item?.pagina);
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const instrucao = texto(item?.instrucao);
  const porCodigo = (): string | null => {
    const codigo = texto(item?.codigo).toUpperCase();
    for (const [id, p] of ctx.pecas) {
      if (p.codigo?.toUpperCase() === codigo) return id;
    }
    return null;
  };
  const daModelo = (): string | null => {
    const p = ctx.paginas.find((x) => x.numero === pagina);
    return p?.tipo === 'modelo' ? p.fotoId : null;
  };

  switch (tipo) {
    case 'refazer_modelo': {
      const fotoId = daModelo();
      if (!fotoId)
        return `A página ${pagina || '?'} não é uma página de modelo.`;
      return { tipo, fotoId, instrucao };
    }
    case 'trocar_modelo': {
      const fotoId = daModelo();
      if (!fotoId)
        return `A página ${pagina || '?'} não é uma página de modelo.`;
      const novaFotoId = porCodigo();
      if (!novaFotoId) {
        return `Não achei a peça ${texto(item?.codigo) || '(sem código)'} neste catálogo.`;
      }
      return { tipo, fotoId, novaFotoId, instrucao: instrucao || null };
    }
    case 'refazer_capa':
    case 'refazer_fundo':
      return { tipo, instrucao: instrucao || 'uma versão diferente da atual' };
    case 'trocar_frase':
      return { tipo, frase: texto(item?.frase) };
    case 'tirar_peca':
    case 'mover_peca': {
      const fotoId = porCodigo();
      if (!fotoId) {
        return `Não achei a peça ${texto(item?.codigo) || '(sem código)'} neste catálogo.`;
      }
      return tipo === 'tirar_peca'
        ? { tipo, fotoId }
        : { tipo, fotoId, pagina };
    }
    case 'mudar_cores':
      return {
        tipo,
        paleta: {
          fundo: texto(item?.fundo),
          destaque: texto(item?.destaque),
          texto: texto(item?.texto),
        },
      };
    default:
      return `Não sei fazer este ajuste${tipo ? ` (${tipo})` : ''}.`;
  }
}

/** A ação como chega da tela: só os campos conhecidos, nos tipos certos. */
function normalizar(b: unknown): AcaoDeAjuste | null {
  const a = (b ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (a.tipo) {
    case 'refazer_modelo':
      return { tipo: a.tipo, fotoId: s(a.fotoId), instrucao: s(a.instrucao) };
    case 'trocar_modelo':
      return {
        tipo: a.tipo,
        fotoId: s(a.fotoId),
        novaFotoId: s(a.novaFotoId),
        instrucao: s(a.instrucao) || null,
      };
    case 'refazer_capa':
    case 'refazer_fundo':
      return { tipo: a.tipo, instrucao: s(a.instrucao) };
    case 'trocar_frase':
      return { tipo: a.tipo, frase: s(a.frase) };
    case 'tirar_peca':
      return { tipo: a.tipo, fotoId: s(a.fotoId) };
    case 'mover_peca':
      return { tipo: a.tipo, fotoId: s(a.fotoId), pagina: Number(a.pagina) };
    case 'mudar_cores': {
      const p = (a.paleta ?? {}) as Record<string, unknown>;
      return {
        tipo: a.tipo,
        paleta: {
          fundo: s(p.fundo),
          destaque: s(p.destaque),
          texto: s(p.texto),
        },
      };
    }
    default:
      return null;
  }
}

/**
 * A REGRA DE CADA AÇÃO. `null` = vale; texto = o motivo de não valer, escrito
 * para quem pediu.
 */
function checar(acao: AcaoDeAjuste, ctx: ContextoDoAjuste): string | null {
  const semTema =
    'Este catálogo não tem tema — não há modelo, arte nem cores para ajustar. Escreva uma observação e monte de novo.';
  const naModelo = (id: string) =>
    ctx.paginas.some((p) => p.tipo === 'modelo' && p.fotoId === id);
  const codigo = (id: string) => ctx.pecas.get(id)?.codigo ?? 'a peça';

  switch (acao.tipo) {
    case 'refazer_modelo':
      if (!ctx.temTema) return semTema;
      if (!naModelo(acao.fotoId))
        return 'Essa peça não está numa página de modelo.';
      if (!acao.instrucao) return 'Faltou dizer o que mudar na foto da modelo.';
      if (acao.instrucao.length > MAX_INSTRUCAO)
        return 'A instrução da foto está longa demais.';
      return null;
    case 'trocar_modelo':
      if (!ctx.temTema) return semTema;
      if (!naModelo(acao.fotoId)) return 'Essa página não é de modelo.';
      if (!ctx.pecas.has(acao.novaFotoId))
        return 'A peça nova não está neste catálogo.';
      if (naModelo(acao.novaFotoId))
        return `${codigo(acao.novaFotoId)} já está numa página de modelo.`;
      if ((acao.instrucao?.length ?? 0) > MAX_INSTRUCAO)
        return 'A instrução da foto está longa demais.';
      return null;
    case 'refazer_capa':
    case 'refazer_fundo':
      if (!ctx.temTema) return semTema;
      if (acao.instrucao.length > MAX_INSTRUCAO)
        return 'A instrução da arte está longa demais.';
      return null;
    case 'trocar_frase':
      if (!ctx.temTema) return semTema;
      if (!acao.frase) return 'Faltou a frase da capa.';
      if (acao.frase.length > MAX_FRASE)
        return `A frase da capa passa de ${MAX_FRASE} letras.`;
      if (PARECE_DINHEIRO.test(acao.frase))
        return 'A frase da capa não pode ter preço nem parcela.';
      return null;
    case 'tirar_peca':
      if (!ctx.pecas.has(acao.fotoId)) return 'Essa peça não está no catálogo.';
      if (ctx.pecas.size === 1)
        return 'Essa é a única peça — o catálogo ficaria vazio.';
      return null;
    case 'mover_peca':
      if (!ctx.pecas.has(acao.fotoId)) return 'Essa peça não está no catálogo.';
      if (
        !Number.isInteger(acao.pagina) ||
        acao.pagina < 1 ||
        acao.pagina > ctx.paginas.length
      ) {
        return `O catálogo não tem a página ${acao.pagina || '?'}.`;
      }
      return null;
    case 'mudar_cores':
      if (!ctx.temTema) return semTema;
      if (
        ![acao.paleta.fundo, acao.paleta.destaque, acao.paleta.texto].every(
          (c) => HEX.test(c),
        )
      ) {
        return 'Não consegui definir as cores novas.';
      }
      return null;
  }
}

/** O que a tela mostra para a pessoa confirmar. Montado da AÇÃO, não da IA. */
function descrever(acao: AcaoDeAjuste, ctx: ContextoDoAjuste): string {
  const codigo = (id: string) => ctx.pecas.get(id)?.codigo ?? 'peça sem código';
  const paginaDe = (id: string) =>
    ctx.paginas.find(
      (p) =>
        (p.tipo === 'modelo' && p.fotoId === id) ||
        (p.tipo === 'grade' && p.fotoIds.includes(id)),
    )?.numero;

  switch (acao.tipo) {
    case 'refazer_modelo':
      return `Página ${paginaDe(acao.fotoId)}: refazer a foto da modelo — ${acao.instrucao}`;
    case 'trocar_modelo':
      return (
        `Página ${paginaDe(acao.fotoId)}: a modelo passa a usar ${codigo(acao.novaFotoId)}` +
        ` (${codigo(acao.fotoId)} vai para a página de joias)` +
        (acao.instrucao ? ` — ${acao.instrucao}` : '')
      );
    case 'refazer_capa':
      return `Capa: gerar outra arte — ${acao.instrucao}`;
    case 'refazer_fundo':
      return `Fundo das páginas: gerar outra arte — ${acao.instrucao}`;
    case 'trocar_frase':
      return `Capa: a frase passa a ser "${acao.frase}"`;
    case 'tirar_peca':
      return `Tirar ${codigo(acao.fotoId)} do catálogo (hoje na página ${paginaDe(acao.fotoId)})`;
    case 'mover_peca':
      return `Levar ${codigo(acao.fotoId)} da página ${paginaDe(acao.fotoId)} para a página ${acao.pagina}`;
    case 'mudar_cores':
      return `Cores: fundo ${acao.paleta.fundo}, detalhe ${acao.paleta.destaque}, títulos ${acao.paleta.texto}`;
  }
}

// ---------------------------------------------------------------------------
// As ações aplicadas ao plano
// ---------------------------------------------------------------------------

/**
 * O plano novo, e as imagens que precisam ser geradas para ele.
 *
 * NÃO TOCA NO PLANO RECEBIDO: devolve uma cópia. As páginas são as da versão
 * que a pessoa viu, e é contra ELAS que "página 3" é resolvido — os alvos de
 * `mover_peca` são capturados antes de qualquer mudança, senão tirar uma peça
 * antes deslocaria o destino da seguinte.
 *
 * `removidas` são os nomes de imagem que deixam de valer (a foto da modelo de
 * uma peça que saiu da página de modelo).
 */
export function aplicarNoPlano(
  plano: PlanoDaMontagem,
  acoes: AcaoDeAjuste[],
  ctx: ContextoDoAjuste,
): { plano: PlanoDaMontagem; gerar: GeracaoPedida[]; removidas: string[] } {
  const novo = structuredClone(plano);
  novo.arquivos = {};
  const gerar: GeracaoPedida[] = [];
  const removidas: string[] = [];

  // Os destinos, pelas páginas ORIGINAIS.
  const destinos = new Map<AcaoDeAjuste, (typeof novo.paginas)[number]>();
  for (const a of acoes) {
    if (a.tipo !== 'mover_peca') continue;
    const alvo = ctx.paginas.find((p) => p.numero === a.pagina);
    if (alvo) destinos.set(a, novo.paginas[alvo.indice]);
  }

  /** Tira a peça de onde ela estiver. Página de modelo sai inteira. */
  const retirar = (fotoId: string) => {
    for (const p of novo.paginas) {
      if (p.tipo === 'grade')
        p.fotoIds = p.fotoIds.filter((id) => id !== fotoId);
    }
    const i = novo.paginas.findIndex(
      (p) => p.tipo === 'modelo' && p.fotoId === fotoId,
    );
    if (i >= 0) {
      novo.paginas.splice(i, 1);
      removidas.push(nomeDaModelo(fotoId));
    }
  };

  for (const a of acoes) {
    switch (a.tipo) {
      case 'refazer_modelo':
        gerar.push({
          tipo: 'modelo',
          fotoId: a.fotoId,
          instrucao: a.instrucao,
        });
        break;

      case 'trocar_modelo': {
        // A peça nova toma o lugar da antiga na página de modelo, e a antiga
        // vai para onde a nova estava — ninguém sai do catálogo.
        const pagina = novo.paginas.find(
          (p) => p.tipo === 'modelo' && p.fotoId === a.fotoId,
        );
        const grade = novo.paginas.find(
          (p) => p.tipo === 'grade' && p.fotoIds.includes(a.novaFotoId),
        );
        if (pagina?.tipo === 'modelo') pagina.fotoId = a.novaFotoId;
        if (grade?.tipo === 'grade') {
          grade.fotoIds = grade.fotoIds.map((id) =>
            id === a.novaFotoId ? a.fotoId : id,
          );
        }
        removidas.push(nomeDaModelo(a.fotoId));
        gerar.push({
          tipo: 'modelo',
          fotoId: a.novaFotoId,
          instrucao: a.instrucao,
        });
        break;
      }

      case 'refazer_capa':
        gerar.push({ tipo: 'capa', instrucao: a.instrucao });
        break;

      case 'refazer_fundo':
        gerar.push({ tipo: 'fundo', instrucao: a.instrucao });
        break;

      case 'trocar_frase':
        if (novo.direcao) novo.direcao.frase = a.frase;
        break;

      case 'mudar_cores':
        if (novo.direcao) novo.direcao.paleta = a.paleta;
        break;

      case 'tirar_peca':
        retirar(a.fotoId);
        break;

      case 'mover_peca': {
        const destino = destinos.get(a);
        retirar(a.fotoId);
        if (destino?.tipo === 'grade' && novo.paginas.includes(destino)) {
          destino.fotoIds.push(a.fotoId);
          break;
        }
        // Destino que não é grade (capa, modelo, contracapa) ou que deixou de
        // existir: a peça ganha uma página de joias ali, antes da contracapa
        // no pior caso.
        const i = destino ? novo.paginas.indexOf(destino) : -1;
        const antesDaContracapa = novo.paginas.length - 1;
        const onde =
          i < 0 || destino?.tipo === 'contracapa' ? antesDaContracapa : i + 1;
        novo.paginas.splice(onde, 0, { tipo: 'grade', fotoIds: [a.fotoId] });
        break;
      }
    }
  }

  novo.paginas = novo.paginas.filter(
    (p) => p.tipo !== 'grade' || p.fotoIds.length > 0,
  );
  return { plano: novo, gerar, removidas };
}
