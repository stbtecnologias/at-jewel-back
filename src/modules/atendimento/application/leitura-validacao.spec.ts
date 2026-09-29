import { validar } from './ler-conversa-whatsapp.use-case';

/**
 * A RECUSA QUE NAO DIZIA POR QUE — 29/09/2026.
 *
 * ==========================================================================
 * O `null` CALADO ERA A ULTIMA DE QUATRO CAMADAS MUDAS.
 *
 * Numa manha de depuracao a mensagem do cliente sumiu quatro vezes seguidas,
 * cada vez por um motivo diferente, e nenhuma das quatro dizia nada:
 *
 *   1. o webhook descartava `@lid` em silencio
 *   2. o `to` de saida vinha como objeto e morria no `typeof`
 *   3. o modelo ia vazio para a API por causa de um `??`
 *   4. ESTA: o JSON do modelo era recusado sem motivo, e a rodada ainda
 *      relatava "0 lidas, 0 ignoradas, 0 FALHAS"
 *
 * Por isso `validar` devolve o MOTIVO. Ele nomeia o campo, nunca o conteudo:
 * o que o modelo escreve aqui e resumo de conversa de cliente.
 * ==========================================================================
 */
describe('a validação da leitura', () => {
  const bom = JSON.stringify({
    sobre_joias: true,
    resultado: 'EM_ANDAMENTO',
    resumo: 'Cliente perguntou por um anel visto no Instagram.',
    nome: 'Lucas',
  });

  it('a resposta certa passa', () => {
    const r = validar(bom);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.leitura.sobreJoias).toBe(true);
      expect(r.leitura.resultado).toBe('EM_ANDAMENTO');
      expect(r.leitura.nome).toBe('Lucas');
    }
  });

  it('o modelo tagarela — JSON no meio de prosa — ainda passa', () => {
    const r = validar(`Claro! Aqui está:\n\n${bom}\n\nEspero ter ajudado.`);
    expect(r.ok).toBe(true);
  });

  describe('cada recusa diz o que faltou', () => {
    it.each([
      ['prosa sem JSON nenhum', 'Não consegui analisar essa conversa.', /objeto JSON/],
      ['chaves com lixo dentro', '{ isto nao e json }', /não é JSON válido/],
      [
        '`sobre_joias` como texto',
        JSON.stringify({ sobre_joias: 'sim', resultado: 'VENDA', resumo: 'x' }),
        /sobre_joias.*booleano.*string/,
      ],
      [
        '`resultado` inventado',
        JSON.stringify({ sobre_joias: true, resultado: 'TALVEZ', resumo: 'x' }),
        /resultado.*fora da lista/,
      ],
      [
        '`resumo` vazio',
        JSON.stringify({ sobre_joias: true, resultado: 'VENDA', resumo: '   ' }),
        /resumo.*ausente ou vazio/,
      ],
    ])('%s', (_rotulo, entrada, esperado) => {
      const r = validar(entrada);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(esperado);
    });
  });

  /*
   * O MOTIVO VAI PARA O LOG, ENTAO NAO PODE CARREGAR A CONVERSA.
   *
   * `resultado` e a unica excecao, e deliberada: sao tres rotulos fixos, e
   * saber QUAL o modelo inventou e o que conserta o prompt.
   */
  it('o motivo não leva o texto do resumo junto', () => {
    const segredo = 'Cliente mora na rua tal e pediu desconto';
    const r = validar(
      JSON.stringify({ sobre_joias: 'talvez', resultado: 'VENDA', resumo: segredo }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).not.toContain(segredo);
      expect(r.motivo).not.toContain('desconto');
    }
  });

  it('o nome é opcional; o resto não', () => {
    const semNome = validar(
      JSON.stringify({ sobre_joias: true, resultado: 'VENDA', resumo: 'x' }),
    );
    expect(semNome.ok).toBe(true);
    if (semNome.ok) expect(semNome.leitura.nome).toBeNull();
  });

  it('resumo gigante é cortado, não recusado', () => {
    const r = validar(
      JSON.stringify({ sobre_joias: true, resultado: 'VENDA', resumo: 'a'.repeat(900) }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.leitura.resumo.length).toBe(500);
  });
});

/**
 * A ORIGEM — ANA-02, 29/09/2026.
 *
 * ==========================================================================
 * O CAMPO EXTRA NAO PODE DERRUBAR O ESSENCIAL.
 *
 * Os outros campos recusam a leitura inteira quando vem errados, porque sem
 * eles ela nao serve. A origem e diferente: perder uma conversa porque o
 * modelo escreveu "tiktok" seria trocar o essencial pelo acessorio.
 *
 * E `null` e uma resposta legitima, nao uma falha. O primeiro lead lido em
 * 29/09 nasceu como `whatsapp` porque ninguem perguntava — a pessoa tinha
 * dito "vi um anel de voces no instagram" na primeira linha.
 * ==========================================================================
 */
describe('a origem do lead', () => {
  const com = (origem: unknown) =>
    validar(JSON.stringify({
      sobre_joias: true,
      resultado: 'EM_ANDAMENTO',
      resumo: 'Perguntou por um anel.',
      origem,
    }));

  it.each(['instagram', 'site', 'indicacao', 'loja_fisica', 'outro', 'whatsapp'])(
    '`%s` é aceita',
    (origem) => {
      const r = com(origem);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.leitura.origem).toBe(origem);
    },
  );

  it.each([
    ['inventada', 'tiktok'],
    ['maiúscula', 'INSTAGRAM'],
    ['número', 7],
    ['objeto', { rede: 'instagram' }],
    ['ausente', undefined],
    ['nula', null],
  ])('origem %s vira null e a leitura PASSA', (_rotulo, origem) => {
    const r = com(origem);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.leitura.origem).toBeNull();
  });

  /* Sem origem dita, o lead nasce pelo canal por onde entrou — que e verdade,
   * e nao um chute. Quem le o relatorio precisa poder confiar no campo. */
  it('a leitura sem origem não fica com campo preenchido por engano', () => {
    const r = validar(JSON.stringify({
      sobre_joias: true, resultado: 'VENDA', resumo: 'Fechou.',
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.leitura.origem).toBeNull();
  });
});
