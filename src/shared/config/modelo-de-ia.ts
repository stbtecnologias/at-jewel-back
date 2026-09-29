import type { ConfigService } from '@nestjs/config';

/**
 * O modelo de uma agente, com padrao que sobrevive a variavel EM BRANCO.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE, E NAO UM `??` EM CADA LUGAR — 29/09/2026.
 *
 * O idioma espalhado pelo projeto era:
 *
 *     this.config.get<string>('ANTHROPIC_MODEL_X') ?? 'claude-sonnet-5'
 *
 * O `??` so age em `null` e `undefined`. Com a chave DECLARADA e vazia —
 * `ANTHROPIC_MODEL_LEITOR=` no `.env`, que e o que acontece quando alguem
 * comenta o valor ou copia um `.env` pela metade — a string vazia vence o
 * padrao e viaja ate a API, que responde:
 *
 *     400 invalid_request_error: model: String should have at least 1 character
 *
 * O custo real: o leitor de conversas nasceu em 09/09/2026 e NUNCA rodou uma
 * vez. Ninguem percebeu porque, sem numero de vendedora conectado, nada
 * chegava ate ele. No primeiro teste com trafego real, falhou na primeira
 * tentativa — e o erro so apareceu porque estavamos olhando.
 *
 * O `.env.example` sempre trouxe os valores certos. Isso nao ajuda quem ja
 * tem um `.env` — que e todo mundo que trabalha aqui ha mais de um dia.
 * ==========================================================================
 *
 * O `trim` importa: uma chave com espaco (`MODEL=" "`) e tao vazia quanto uma
 * sem nada, e passaria pelo `||` cru.
 */
export function modeloDeIa(
  config: { get<T>(chave: string): T | undefined },
  chave: string,
  padrao: string,
): string {
  const configurado = config.get<string>(chave)?.trim();
  return configurado || padrao;
}

/** O tipo real do Nest, para quem injeta o `ConfigService` de verdade. */
export type ConfigDeModelo = Pick<ConfigService, 'get'>;
