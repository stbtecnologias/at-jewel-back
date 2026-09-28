import { RecepcaoService } from '../recepcao.service';
import { RecepcionarUseCase } from './recepcionar.use-case';

/**
 * A recepcao do canal interno — pedido do Lucas em 15/09/2026.
 *
 * O QUE ESTES TESTES PROTEGEM:
 *
 * 1. SAUDACAO E A MENSAGEM SOZINHA. "Oi" e saudacao; "oi, como estao minhas
 *    vendas?" nao e, e tem de seguir para o agente. Errar para o lado do menu
 *    seria responder uma lista a quem ja perguntou.
 *
 * 2. O MENU E O DA PERMISSAO DE VERDADE. Ninguem ve linha que nao pode usar,
 *    e quem acumula papel ve as duas coisas.
 *
 * 3. O NUMERO SO VALE COM O MENU NA TELA, e por pouco tempo. Um "1" digitado
 *    depois nao pode acionar nada.
 */
describe('RecepcionarUseCase', () => {
  const DE = '558586467241@c.us';
  const MANHA = new Date('2026-09-15T09:00:00-03:00');

  let recepcao: RecepcaoService;
  let useCase: RecepcionarUseCase;

  beforeEach(() => {
    recepcao = new RecepcaoService();
    useCase = new RecepcionarUseCase(recepcao);
  });

  describe('o que e saudacao', () => {
    it.each([
      'oi',
      'Oi!',
      'Olá',
      'ola',
      'OLÁ 👋',
      'Bom dia',
      'bom dia!',
      'Boa tarde',
      'boa noite',
      'oi, tudo bem?',
      'Bom dia, tudo bem?',
      'menu',
      'ajuda',
      'opções',
    ])('%s é saudação', (texto) => {
      expect(useCase.ehSaudacao(texto)).toBe(true);
    });

    it.each([
      // Tem pergunta dentro: quem ja perguntou nao quer um menu.
      'oi, como estão minhas vendas?',
      'bom dia, quero mandar foto',
      'quanto vendi hoje?',
      'BR26252',
      'aprovo',
      '0003',
      // "oi" no meio de outra coisa nao abre menu.
      'passa um oi pra ela',
    ])('%s NÃO é saudação', (texto) => {
      expect(useCase.ehSaudacao(texto)).toBe(false);
    });
  });

  /**
   * A SAUDACAO NAO OFERECE NADA — 29/09/2026.
   *
   * ======================================================================
   * Pedido do Lucas: "Bom dia, Lucas! Em que posso ajudar hoje? ou algo
   * assim. Aí se a pessoa perguntar o que você pode fazer, aí você
   * passaria — mas não queria logo de cara".
   *
   * Quem diz "oi" esta abrindo conversa, nao pedindo um catalogo de
   * funcoes. Estes testes existem porque o reflexo contrario e forte: a
   * proxima pessoa a mexer aqui vai querer "ajudar" acrescentando o que
   * da para pedir, e e justamente isso que nao se quer.
   * ======================================================================
   */
  describe('a saudacao, que nao lista nada', () => {
    const perfis = [
      ['vendedora', { vendedora: true, gestao: false, catalogo: false }],
      ['gestao', { vendedora: false, gestao: true, catalogo: false }],
      ['catalogo', { vendedora: false, gestao: false, catalogo: true }],
    ] as const;

    it.each(perfis)('para %s, so o cumprimento e a pergunta', (_n, perfil) => {
      const r = useCase.saudar(DE, perfil, 'Marina Souza', MANHA);

      expect(r.resposta).toBe('Bom dia, Marina! Em que posso ajudar hoje?');
      expect(r.motivo).toBe('recepcao_saudacao');
    });

    it('e a frase e a MESMA para todo mundo — o perfil nao vaza na saudacao', () => {
      const respostas = perfis.map(
        ([, perfil]) => useCase.saudar(DE, perfil, 'Marina', MANHA).resposta,
      );

      expect(new Set(respostas).size).toBe(1);
    });
  });

  describe('a frase de cada perfil — so quando PERGUNTAM o que eu faco', () => {
    it('a vendedora ouve o que e dela, e nada de catalogo', () => {
      const r = useCase.oQuePossoFazer(
        { vendedora: true, gestao: false, catalogo: false },
        'Marina Souza',
        MANHA,
      );

      expect(r.motivo).toBe('recepcao_menu');
      // Sem cumprimento: quem pergunta "o que você faz" no meio da conversa
      // já foi cumprimentado, e um "bom dia" repetido soa a script.
      expect(r.resposta).not.toContain('Bom dia');
      expect(r.resposta).toContain('suas vendas');
      expect(r.resposta).not.toContain('catálogo');
    });

    it('o estoque ouve o convite da foto', () => {
      const r = useCase.oQuePossoFazer(
        { vendedora: false, gestao: false, catalogo: true },
        'Yerlon Alves',
        MANHA,
      );

      expect(r.resposta).toContain('foto com o código');
    });

    it('a gestao SEM catalogo nao ouve a linha de foto', () => {
      const r = useCase.oQuePossoFazer(
        { vendedora: false, gestao: true, catalogo: false },
        'Lucas',
        MANHA,
      );

      expect(r.resposta).toContain('vendas, metas, agenda e o funil');
      expect(r.resposta).not.toContain('foto');
    });

    it('quem acumula gestao e catalogo ouve as duas coisas', () => {
      // O caso do Yerlon: ADM que tambem fotografa. Sem isto ele nao saberia
      // que pode mandar a foto por aqui.
      const r = useCase.oQuePossoFazer(
        { vendedora: false, gestao: true, catalogo: true },
        'Yerlon',
        MANHA,
      );

      expect(r.resposta).toContain('vendas, metas, agenda e o funil');
      expect(r.resposta).toContain('foto para o catálogo');
    });

    it('sem nome cadastrado, so o cumprimento — nunca "Bom dia, !"', () => {
      const r = useCase.saudar(
        DE,
        { vendedora: false, gestao: false, catalogo: true },
        '   ',
        MANHA,
      );

      expect(r.resposta.startsWith('Bom dia! ')).toBe(true);
    });

    it('o cumprimento segue o relogio da loja', () => {
      const tarde = new Date('2026-09-15T15:00:00-03:00');
      const noite = new Date('2026-09-15T21:00:00-03:00');
      const perfil = { vendedora: false, gestao: false, catalogo: true };

      expect(useCase.saudar(DE, perfil, 'Yerlon', tarde).resposta).toContain(
        'Boa tarde, Yerlon!',
      );
      expect(useCase.saudar(DE, perfil, 'Yerlon', noite).resposta).toContain(
        'Boa noite, Yerlon!',
      );
    });
  });

  /**
   * O MENU NUMERADO SAIU EM 29/09/2026.
   *
   * ========================================================================
   * Pedido do Lucas: "mais natural, sem essa pegada de chatbot, e ser breve".
   *
   * Estes testes nao descrevem uma ausencia por descuido — descrevem a
   * GARANTIA que substituiu o menu: nada de lista numerada, e, sobretudo,
   * NENHUMA escolha armada.
   *
   * O segundo e o que importa. `RecepcaoService` continua de pe para um
   * desenho futuro (botoes do WhatsApp, por exemplo), e religar o menu sem
   * mostrar a lista faria um "2" digitado por outro motivo virar uma acao que
   * ninguem ofereceu. Este arquivo quebra se isso acontecer.
   * ========================================================================
   */
  describe('o menu numerado, que saiu', () => {
    const perfis = [
      ['vendedora', { vendedora: true, gestao: false, catalogo: false }],
      ['gestao', { vendedora: false, gestao: true, catalogo: false }],
      ['catalogo', { vendedora: false, gestao: false, catalogo: true }],
    ] as const;

    it.each(perfis)('a saudacao de %s nao traz lista numerada', (_nome, perfil) => {
      const r = useCase.saudar(DE, perfil, 'Yerlon', MANHA);

      expect(r.resposta).not.toMatch(/^\s*\d+\s*[—.-]/m);
      expect(r.resposta).not.toContain('Responde o número');
    });

    it.each(perfis)('a saudacao de %s nao ARMA escolha por numero', (_nome, perfil) => {
      useCase.saudar(DE, perfil, 'Yerlon', MANHA);

      // A garantia central: sem lista na tela, numero nao aciona nada.
      for (const digitado of ['1', '2', '3', '6']) {
        expect(useCase.escolhida(DE, digitado)).toBeNull();
      }
    });

    it('o fora-do-escopo tambem responde numa frase', () => {
      const r = useCase.naoSeiFazer(
        DE,
        { vendedora: false, gestao: true, catalogo: false },
        'Lucas Barbosa',
      );

      expect(r.resposta).toContain('Lucas, isso eu não faço por aqui.');
      expect(r.resposta).toContain('vendas, metas, agenda e o funil');
      expect(r.resposta).not.toMatch(/^\s*\d+\s*[—.-]/m);
      expect(useCase.escolhida(DE, '1')).toBeNull();
    });

    it('a resposta cabe numa mensagem de WhatsApp', () => {
      // "sem muito textão": o menu da gestao tinha 6 linhas e ~200 caracteres
      // de lista. A frase inteira tem de caber no que alguem le sem rolar.
      const r = useCase.saudar(
        DE,
        { vendedora: false, gestao: true, catalogo: true },
        'Yerlon',
        MANHA,
      );

      expect(r.resposta.split('\n')).toHaveLength(1);
      expect(r.resposta.length).toBeLessThan(200);
    });
  });
});
