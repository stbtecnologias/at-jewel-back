import { ConexoesService } from './conexoes.service';

/**
 * ==========================================================================
 * QUEM E ESTA SESSAO, EM PARTES — 10/11/2026.
 *
 * O aviso no Telegram quer o nome em negrito na primeira linha e a funcao
 * menor embaixo. Partir o rotulo da tela com expressao regular seria recriar
 * a divergencia que o `SessoesDaCasaService` existe para impedir — o
 * comentario dele diz, em maiusculas, que TODA traducao agente <-> sessao
 * passa por ali, depois de o `atwpp` ter aprendido do jeito ruim. Entao as
 * partes nascem la, e o rotulo da tela e composto delas.
 *
 * `null` E LISTA DE PERMISSAO, e nao "nao sei o nome". O `/ws` do WAHA
 * entrega todas as sessoes da instalacao, inclusive as descartaveis que
 * alguem cria na mao, e sobre `null` o aviso NAO FALA.
 *
 * A ORFA FALA, e leva o nome da sessao junto: o rotulo dela nao nomeia
 * ninguem, entao dois orfaos dariam dois avisos identicos.
 * ==========================================================================
 */

const UUID = '9ef62011-af97-4bde-83d8-a63142b45c73';

const monta = (vendedora: { nome: string } | null): ConexoesService =>
  new ConexoesService(
    {} as never,
    {
      ehDaCasa: (s: string) => s === 'default',
      partesDe: () => ({ nome: 'Anastasia', funcao: 'gestão' }),
    } as never,
    { buscarPorId: async () => vendedora } as never,
  );

describe('ConexoesService.identidadeDaSessao', () => {
  it('numero da casa vem com nome e funcao separados', async () => {
    expect(await monta(null).identidadeDaSessao('default')).toEqual({
      nome: 'Anastasia',
      funcao: 'gestão',
      sessao: 'default',
      orfa: false,
    });
  });

  it('vendedora que existe usa o nome dela', async () => {
    expect(
      await monta({ nome: 'MARINA' }).identidadeDaSessao(`vend-${UUID}`),
    ).toEqual({
      nome: 'MARINA',
      funcao: 'vendedora',
      sessao: `vend-${UUID}`,
      orfa: false,
    });
  });

  it('sessao de vendedora que nao existe mais e orfa, e FALA', async () => {
    const i = await monta(null).identidadeDaSessao(`vend-${UUID}`);

    expect(i?.orfa).toBe(true);
    expect(i?.nome).toBe('Vendedora desligada');
    expect(i?.sessao).toBe(`vend-${UUID}`);
  });

  it('sessao de nome desconhecido devolve null', async () => {
    expect(await monta(null).identidadeDaSessao('teste-criado-na-mao')).toBeNull();
  });
});
