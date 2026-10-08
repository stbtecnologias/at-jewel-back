import { canalEmPalavras, destinoDaVendedora } from './para-onde-falar';

/**
 * RF16. Medido na base em 08/10: das 7 vendedoras ativas, **7 têm o
 * corporativo e só 1 tem o interno**.
 *
 * Até aqui todo caminho em que o SISTEMA escreve para ela pedia o interno,
 * não achava e desistia calado — então seis das sete não recebiam nada, sem
 * erro em lugar nenhum. Decisão do Lucas em 08/10: o interno OU o
 * corporativo.
 */
describe('destinoDaVendedora — o interno ou o corporativo', () => {
  /* ESTE É O TESTE. O resto é contorno: seis das sete caem aqui. */
  it('sem o interno, fala pelo corporativo', () => {
    expect(
      destinoDaVendedora({ whatsappInterno: null, whatsappExterno: '8599990001' }),
    ).toEqual({ numero: '8599990001', canal: 'CORPORATIVO' });
  });

  /**
   * A ORDEM É DELIBERADA: o interno é o aparelho da loja, pareado como
   * sessão, e quando existe é por ali que a conversa dela acontece.
   */
  it('com os dois, o interno ganha', () => {
    expect(
      destinoDaVendedora({
        whatsappInterno: '8588880002',
        whatsappExterno: '8599990001',
      }),
    ).toEqual({ numero: '8588880002', canal: 'INTERNO' });
  });

  it('sem nenhum dos dois, não há para onde falar', () => {
    expect(destinoDaVendedora({})).toBeNull();
    expect(destinoDaVendedora(null)).toBeNull();
    expect(destinoDaVendedora(undefined)).toBeNull();
    expect(
      destinoDaVendedora({ whatsappInterno: null, whatsappExterno: null }),
    ).toBeNull();
  });

  /**
   * Campo em branco é campo vazio. O cadastro aceita espaço, e um número só
   * com espaço entregaria a mensagem no vazio em vez de cair no corporativo —
   * que é o defeito de volta, disfarçado de sucesso.
   */
  it('espaço em branco não é número', () => {
    expect(
      destinoDaVendedora({ whatsappInterno: '   ', whatsappExterno: '8599990001' }),
    ).toEqual({ numero: '8599990001', canal: 'CORPORATIVO' });
    expect(
      destinoDaVendedora({ whatsappInterno: '', whatsappExterno: '  ' }),
    ).toBeNull();
  });

  it('o número vem sem os espaços das bordas', () => {
    expect(destinoDaVendedora({ whatsappInterno: ' 8588880002 ' })?.numero).toBe(
      '8588880002',
    );
  });

  /** O log diz por onde saiu — e nunca o número, que é PII. */
  it('o canal tem nome para o log', () => {
    expect(canalEmPalavras('INTERNO')).toBe('pelo interno');
    expect(canalEmPalavras('CORPORATIVO')).toBe('pelo corporativo');
  });
});
