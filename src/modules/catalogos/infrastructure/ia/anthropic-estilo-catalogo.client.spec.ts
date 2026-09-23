import { AnthropicEstiloCatalogoClient } from './anthropic-estilo-catalogo.client';

/**
 * O JSON DA DIRECAO DE ARTE, CONFERIDO — 16/09/2026.
 *
 * O que sai daqui vai para `fillColor` e para a capa impressa. Cor que nao e
 * cor quebraria o PDF; frase com preco seria a IA escrevendo dinheiro.
 */
describe('AnthropicEstiloCatalogoClient.interpretar', () => {
  const interpretar = (t: string) =>
    AnthropicEstiloCatalogoClient.interpretar(t);

  it('le o JSON, mesmo com texto em volta', () => {
    const r = interpretar(
      'Segue:\n{"cena": "praia", "paleta": {"fundo": "#F4ECE0", "destaque": "#2a9d8f", "texto": "#1d3557"}, "frase": "Dias de sol"}',
    );

    expect(r).toEqual({
      cena: 'praia',
      modelo: 'uma mulher elegante',
      paleta: { fundo: '#F4ECE0', destaque: '#2a9d8f', texto: '#1d3557' },
      frase: 'Dias de sol',
    });
  });

  it('le quem aparece; sem isso, o publico da casa', () => {
    expect(
      interpretar('{"cena": "escritorio", "modelo": "um homem maduro"}')
        ?.modelo,
    ).toBe('um homem maduro');
    expect(interpretar('{"cena": "praia"}')?.modelo).toBe(
      'uma mulher elegante',
    );
  });

  it('cor invalida cai na cor da casa, sem derrubar o resto', () => {
    const r = interpretar(
      '{"cena": "praia", "paleta": {"fundo": "areia", "destaque": "#2a9d8f"}}',
    );

    expect(r?.paleta).toEqual({
      fundo: '#ffffff',
      destaque: '#2a9d8f',
      texto: '#1a1a1a',
    });
    expect(r?.frase).toBeNull();
  });

  it.each(['A partir de R$ 990', 'Em 10x sem juros'])(
    'frase com preco ou parcela e descartada: %s',
    (frase) => {
      const r = interpretar(JSON.stringify({ cena: 'praia', frase }));
      expect(r?.frase).toBeNull();
    },
  );

  it('sem cena, ou sem JSON, nao ha direcao', () => {
    expect(interpretar('{"frase": "oi"}')).toBeNull();
    expect(interpretar('nao sei')).toBeNull();
    expect(interpretar('{quebrado')).toBeNull();
  });
});
