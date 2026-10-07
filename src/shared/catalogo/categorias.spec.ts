import { categoriaDaBusca, categoriaEmPalavras } from './categorias';

/**
 * "O sistema mistura joia e item de decoração" — reunião de 06/10/2026, e
 * confirmado ao vivo em 07/10: pediram as esmeraldas com saldo e vieram seis
 * peças de casa (cilindro, vaso, copo, bowl, cinzeiro). Das 9 esmeraldas
 * disponíveis, 7 são HOME.
 *
 * A decisão do Lucas: **o padrão é joia**, e se ela pedir outra coisa a
 * agente traz.
 */
describe('categoriaDaBusca — o padrão é joia', () => {
  /* ESTE É O TESTE. O resto é contorno. */
  it('sem pedir nada, é joia', () => {
    expect(categoriaDaBusca()).toBe('JEWEL');
    expect(categoriaDaBusca('')).toBe('JEWEL');
    expect(categoriaDaBusca('   ')).toBe('JEWEL');
  });

  it('TODAS desliga o recorte — e é a única coisa que desliga', () => {
    expect(categoriaDaBusca('TODAS')).toBeUndefined();
    expect(categoriaDaBusca('todas')).toBeUndefined();
  });

  it('a categoria pedida passa, em qualquer caixa', () => {
    expect(categoriaDaBusca('HOME')).toBe('HOME');
    expect(categoriaDaBusca('home')).toBe('HOME');
    expect(categoriaDaBusca(' Collab VR ')).toBe('COLLAB VR');
  });

  /**
   * O modelo escreve "JOIAS", "Joia" ou até "ANEL" neste campo. Filtrar por um
   * valor que não existe devolveria zero — e zero é indistinguível de "a loja
   * não tem". Cair no padrão erra menos, e o texto do despacho diz em que
   * categoria a lista está, então o engano aparece.
   */
  it('valor inventado cai no padrão, e não em lista vazia', () => {
    expect(categoriaDaBusca('JOIAS')).toBe('JEWEL');
    expect(categoriaDaBusca('ANEL')).toBe('JEWEL');
    expect(categoriaDaBusca('decoracao')).toBe('JEWEL');
  });

  it('JEWEL vira JOIA na boca da agente', () => {
    expect(categoriaEmPalavras('JEWEL')).toBe('JOIA');
    expect(categoriaEmPalavras('HOME')).toBe('HOME');
  });
});
