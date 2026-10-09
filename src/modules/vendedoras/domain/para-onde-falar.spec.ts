import { canalEmPalavras, destinoDaVendedora } from './para-onde-falar';

/**
 * RF16. Medido na base em 08/10: das 7 vendedoras ativas, **7 têm o
 * corporativo e só 1 tem o pessoal**. A empresa deu chip para todas; o que
 * quase ninguém tem é o número particular no sistema.
 *
 * Até aqui todo caminho em que o SISTEMA escreve para ela pedia o
 * `whatsapp_interno` — o PESSOAL — e só ele. Não achava e desistia calado,
 * então seis das sete não recebiam nada, sem erro em lugar nenhum.
 *
 * Decisão do Lucas em 08/10: os dois valem, e o corporativo vem primeiro.
 */
describe('destinoDaVendedora — os dois valem, o corporativo na frente', () => {
  /* ESTE É O TESTE. O resto é contorno: seis das sete caem aqui. */
  it('só com o corporativo, fala pelo corporativo', () => {
    expect(
      destinoDaVendedora({ whatsappInterno: null, whatsappExterno: '8599990001' }),
    ).toEqual({ numero: '8599990001', canal: 'CORPORATIVO' });
  });

  /**
   * A ORDEM É DELIBERADA, e inverteu em 08/10. O alinhamento de 07/10 pediu o
   * aparelho da empresa "para rastrear as comunicações": o corporativo pareia
   * a sessão no painel, então a conversa fica visível ao sistema. Mensagem
   * entregue no celular pessoal ninguém consegue auditar depois.
   */
  it('com os dois, o CORPORATIVO ganha', () => {
    expect(
      destinoDaVendedora({
        whatsappInterno: '8588880002',
        whatsappExterno: '8599990001',
      }),
    ).toEqual({ numero: '8599990001', canal: 'CORPORATIVO' });
  });

  /** "Olhe sempre os dois" — o pessoal segue valendo como segundo caminho. */
  it('só com o pessoal, fala pelo pessoal', () => {
    expect(
      destinoDaVendedora({ whatsappInterno: '8588880002', whatsappExterno: null }),
    ).toEqual({ numero: '8588880002', canal: 'PESSOAL' });
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
   * com espaço entregaria a mensagem no vazio em vez de cair no outro
   * caminho — que é o defeito de volta, disfarçado de sucesso.
   */
  it('espaço em branco não é número', () => {
    expect(
      destinoDaVendedora({ whatsappInterno: '8588880002', whatsappExterno: '   ' }),
    ).toEqual({ numero: '8588880002', canal: 'PESSOAL' });
    expect(
      destinoDaVendedora({ whatsappInterno: '  ', whatsappExterno: '' }),
    ).toBeNull();
  });

  it('o número vem sem os espaços das bordas', () => {
    expect(destinoDaVendedora({ whatsappExterno: ' 8599990001 ' })?.numero).toBe(
      '8599990001',
    );
  });

  /** O log diz por onde saiu — e nunca o número, que é PII. */
  it('o canal tem nome para o log', () => {
    expect(canalEmPalavras('CORPORATIVO')).toBe('pelo corporativo');
    expect(canalEmPalavras('PESSOAL')).toBe('pelo pessoal');
  });
});
