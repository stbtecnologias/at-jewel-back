import { mascararEmail, mascararTelefone } from './mascara-de-contato';

/**
 * A MASCARA DE CONTATO — requisito RF-10, 28/09/2026.
 *
 * ==========================================================================
 * MASCARA, E NAO AUSENCIA — a diferenca e o desenho.
 *
 * O custo da peca SOME do JSON (ver `Produto.toPublic`), porque ninguem
 * precisa saber que existe. O telefone fica, mascarado, porque ele e o campo
 * que DISTINGUE uma cliente de outra na tela: some-lo faria duas homonimas
 * virarem a mesma linha, e quem precisa separar sem precisar ligar fica sem
 * saida.
 *
 * O teste que guarda isso e "o final visivel nao serve para discar".
 * ==========================================================================
 */
describe('mascararTelefone', () => {
  it('esconde tudo menos os dois ultimos digitos', () => {
    expect(mascararTelefone('(85) 98846-1045')).toBe('(••) •••••-••45');
  });

  it('preserva a forma — parenteses, hifen e espacos ficam', () => {
    // Um campo que muda de formato conforme quem olha parece defeito, e
    // desalinha a coluna da tabela.
    const original = '(85) 98846-1045';
    const mascarado = mascararTelefone(original)!;

    expect(mascarado).toHaveLength(original.length);
    expect(mascarado.replace(/[•\d]/g, '')).toBe(
      original.replace(/\d/g, ''),
    );
  });

  it('funciona em numero sem formatacao nenhuma', () => {
    expect(mascararTelefone('5585988461045')).toBe('•••••••••••45');
  });

  it('DOIS digitos, e nao quatro', () => {
    // Quatro digitos bastam para alguem reconhecer um numero que ja conhece,
    // que e exatamente o que a mascara deveria impedir. Dois dao 1 em 100 de
    // colisao: separam duas linhas e nao servem para discar.
    const visiveis = mascararTelefone('(85) 98846-1045')!.replace(/\D/g, '');
    expect(visiveis).toHaveLength(2);
  });

  it('numero curto demais e mascarado INTEIRO', () => {
    // Deixar os dois ultimos de um numero de quatro digitos nao esconde nada.
    expect(mascararTelefone('1234')).toBe('••••');
    expect(mascararTelefone('12')).toBe('••');
  });

  it('nulo e vazio passam adiante como estao', () => {
    expect(mascararTelefone(null)).toBeNull();
    expect(mascararTelefone('')).toBe('');
  });
});

describe('mascararEmail', () => {
  it('guarda a primeira letra e o dominio', () => {
    expect(mascararEmail('maria.silva@gmail.com')).toBe('m••••••••••@gmail.com');
  });

  it('o DOMINIO fica de proposito', () => {
    // `@gmail.com` nao identifica ninguem, e distinguir e-mail pessoal de
    // corporativo e informacao de atendimento.
    expect(mascararEmail('contato@atjewel.com.br')).toContain('@atjewel.com.br');
  });

  it('a parte local vai quase toda — e ela que carrega nome e sobrenome', () => {
    const r = mascararEmail('joao.pedro.almeida@empresa.com')!;
    expect(r).not.toContain('joao');
    expect(r).not.toContain('pedro');
    expect(r).not.toContain('almeida');
  });

  it('e-mail de uma letra so nao vira a propria letra sem mascara', () => {
    expect(mascararEmail('a@x.com')).toBe('a•@x.com');
  });

  it('texto sem @ e mascarado INTEIRO', () => {
    // Pode ser lixo de cadastro, e conteudo desconhecido e justamente o que
    // nao se deve assumir inofensivo.
    expect(mascararEmail('nao-tem-arroba')).toBe('••••••••••••••');
  });

  it('nulo e vazio passam adiante', () => {
    expect(mascararEmail(null)).toBeNull();
    expect(mascararEmail('')).toBe('');
  });
});
