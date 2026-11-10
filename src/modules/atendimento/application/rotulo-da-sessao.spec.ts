import { ConexoesService } from './conexoes.service';

/**
 * ==========================================================================
 * O NOME DE UMA SESSAO, PARA QUEM NAO QUER A TELA INTEIRA — 10/11/2026.
 *
 * O aviso no Telegram precisa dizer DE QUEM e a conexao que caiu. O `listar()`
 * ja sabe traduzir, mas ele monta onze linhas e conta chats sessao por sessao
 * — trabalho demais para responder a uma pergunta de uma palavra.
 *
 * `null` E LISTA DE PERMISSAO, e nao "nao sei o nome". E o mesmo desenho do
 * `agenteDa`: sessao de teste, sessao criada na mao, qualquer coisa que a
 * casa nao reconhece cai em `null` — e sobre `null` o aviso NAO FALA. O `/ws`
 * do WAHA entrega todas as sessoes da instalacao, inclusive as descartaveis,
 * e sem esta barreira o Telegram apitaria a cada teste de alguem.
 *
 * A ORFA FALA. Vendedora desligada com sessao no ar e precisamente o que o
 * `ConexoesService` diz que nao pode existir em silencio.
 * ==========================================================================
 */

const UUID = '9ef62011-af97-4bde-83d8-a63142b45c73';

const monta = (vendedora: { nome: string } | null): ConexoesService =>
  new ConexoesService(
    {} as never,
    {
      ehDaCasa: (s: string) => s === 'default',
      rotuloDe: () => 'Anastasia (gestão)',
    } as never,
    { buscarPorId: async () => vendedora } as never,
  );

describe('ConexoesService.rotuloDaSessao', () => {
  it('numero da casa usa o rotulo que a tela ja usa', async () => {
    expect(await monta(null).rotuloDaSessao('default')).toBe('Anastasia (gestão)');
  });

  it('vendedora que existe vira "Vendedora: NOME"', async () => {
    expect(await monta({ nome: 'MARINA' }).rotuloDaSessao(`vend-${UUID}`)).toBe(
      'Vendedora: MARINA',
    );
  });

  it('sessao de vendedora que nao existe mais e orfa, e FALA', async () => {
    expect(await monta(null).rotuloDaSessao(`vend-${UUID}`)).toBe(
      'Vendedora desligada — conexão ainda ativa',
    );
  });

  it('sessao de nome desconhecido devolve null', async () => {
    expect(await monta(null).rotuloDaSessao('teste-criado-na-mao')).toBeNull();
  });
});
