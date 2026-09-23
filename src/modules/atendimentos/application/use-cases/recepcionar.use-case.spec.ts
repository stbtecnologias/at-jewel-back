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

  describe('o menu de cada perfil', () => {
    it('a vendedora vê o dela, e nada de catálogo', () => {
      const r = useCase.saudar(
        DE,
        { vendedora: true, gestao: false, catalogo: false },
        'Marina Souza',
        MANHA,
      );

      expect(r.motivo).toBe('recepcao_menu');
      expect(r.resposta).toContain('Bom dia, Marina!');
      expect(r.resposta).toContain('1 — Minhas vendas');
      expect(r.resposta).not.toContain('catálogo');
    });

    it('o estoque vê as três do catálogo', () => {
      const r = useCase.saudar(
        DE,
        { vendedora: false, gestao: false, catalogo: true },
        'Yerlon Alves',
        MANHA,
      );

      expect(r.resposta).toContain('1 — Enviar foto para o catálogo');
      expect(r.resposta).toContain('2 — Consultar uma peça');
      expect(r.resposta).toContain('3 — Ver os catálogos abertos');
    });

    it('a gestão SEM catálogo não recebe a linha de foto', () => {
      const r = useCase.saudar(
        DE,
        { vendedora: false, gestao: true, catalogo: false },
        'Lucas',
        MANHA,
      );

      expect(r.resposta).toContain('1 — Panorama do dia');
      expect(r.resposta).not.toContain('Enviar foto');
    });

    it('quem acumula gestão e catálogo vê as duas coisas', () => {
      // O caso do Yerlon: ADM que também fotografa. Até aqui o texto dele ia
      // inteiro para a Anastasia, e o caminho do catálogo só existia se ele
      // soubesse dizer a frase certa.
      const r = useCase.saudar(
        DE,
        { vendedora: false, gestao: true, catalogo: true },
        'Yerlon',
        MANHA,
      );

      expect(r.resposta).toContain('1 — Panorama do dia');
      // O catalogo e a ULTIMA linha da gestao, e desde 21/09 ela e a 7a:
      // o funil entrou no meio da lista.
      expect(r.resposta).toContain('7 — Enviar foto para o catálogo');
    });

    it('sem nome cadastrado, só o cumprimento — nunca "Bom dia, !"', () => {
      const r = useCase.saudar(
        DE,
        { vendedora: false, gestao: false, catalogo: true },
        '   ',
        MANHA,
      );

      expect(r.resposta.startsWith('Bom dia! Aqui')).toBe(true);
    });

    it('o cumprimento segue o relógio da loja', () => {
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

  describe('o número depois do menu', () => {
    const estoque = { vendedora: false, gestao: false, catalogo: true };

    it('"1" vira a ação da primeira linha', () => {
      useCase.saudar(DE, estoque, 'Yerlon', MANHA);

      expect(useCase.escolhida(DE, '1')?.acao).toEqual({
        tipo: 'catalogo_foto',
      });
    });

    it('o número da vendedora vira a FRASE que ela teria escrito', () => {
      useCase.saudar(
        DE,
        { vendedora: true, gestao: false, catalogo: false },
        'Marina',
        MANHA,
      );

      const acao = useCase.escolhida(DE, '1')?.acao;
      expect(acao).toEqual({
        tipo: 'frase',
        texto: 'como estão minhas vendas hoje?',
      });
    });

    it('sem menu na tela, número não é escolha', () => {
      // O "1" de quem nunca viu menu — ou de quem ja escolheu — segue o
      // caminho de sempre.
      expect(useCase.escolhida(DE, '1')).toBeNull();
    });

    it('a escolha CONSOME o menu: o segundo "1" já é do fluxo', () => {
      useCase.saudar(DE, estoque, 'Yerlon', MANHA);

      expect(useCase.escolhida(DE, '1')).not.toBeNull();
      expect(useCase.escolhida(DE, '1')).toBeNull();
    });

    it('número fora da lista não é escolha', () => {
      useCase.saudar(DE, estoque, 'Yerlon', MANHA);

      // O menu do estoque tem três linhas.
      expect(useCase.escolhida(DE, '7')).toBeNull();
    });

    it('número acompanhado de texto não é escolha', () => {
      useCase.saudar(DE, estoque, 'Yerlon', MANHA);

      expect(useCase.escolhida(DE, '1 peça de ouro')).toBeNull();
    });

    it('o menu vence em dez minutos', () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-09-15T09:00:00-03:00'));
        useCase.saudar(DE, estoque, 'Yerlon', MANHA);

        jest.setSystemTime(new Date('2026-09-15T09:10:01-03:00'));
        expect(useCase.escolhida(DE, '1')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('o menu de um remetente não vale para outro', () => {
      useCase.saudar(DE, estoque, 'Yerlon', MANHA);

      expect(useCase.escolhida('558599999999@c.us', '1')).toBeNull();
    });
  });
});
