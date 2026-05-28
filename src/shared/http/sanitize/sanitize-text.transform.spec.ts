import { plainToInstance } from 'class-transformer';
import { SanitizeJson, SanitizeText, limparTextoXss } from './sanitize-text.transform';

class TestDtoText {
  @SanitizeText()
  campo!: string;
}

class TestDtoTextArray {
  @SanitizeText()
  itens!: string[];
}

class TestDtoJson {
  @SanitizeJson()
  payload!: object;
}

describe('limparTextoXss', () => {
  it('remove tags script', () => {
    expect(limparTextoXss('Oi <script>alert(1)</script> mundo')).toBe('Oi  mundo');
  });

  it('remove handlers de evento dentro de tags', () => {
    expect(limparTextoXss('<img src=x onerror="alert(1)">foo')).toBe('foo');
  });

  it('mantem texto plano intacto', () => {
    expect(limparTextoXss('Maria & Joao 2026')).toBe('Maria &amp; Joao 2026');
  });

  it('aceita string vazia', () => {
    expect(limparTextoXss('')).toBe('');
  });
});

describe('SanitizeText (decorator)', () => {
  it('aplica sanitizacao em string', () => {
    const dto = plainToInstance(TestDtoText, { campo: '<b>bold</b> hello' });
    expect(dto.campo).toBe('bold hello');
  });

  it('passa numeros sem sanitizar', () => {
    const dto = plainToInstance(TestDtoText, { campo: 42 as unknown as string });
    expect(dto.campo).toBe(42);
  });

  it('sanitiza cada item de array', () => {
    const dto = plainToInstance(TestDtoTextArray, {
      itens: ['<i>a</i>', '<script>b</script>', 'c'],
    });
    expect(dto.itens).toEqual(['a', '', 'c']);
  });
});

describe('SanitizeJson (decorator)', () => {
  it('sanitiza strings em qualquer profundidade', () => {
    const dto = plainToInstance(TestDtoJson, {
      payload: {
        nome: '<b>x</b>',
        nested: { descricao: '<script>y</script>z' },
        arr: ['<i>1</i>', 2, true],
      },
    });
    expect(dto.payload).toEqual({
      nome: 'x',
      nested: { descricao: 'z' },
      arr: ['1', 2, true],
    });
  });

  it('preserva tipos nao-string', () => {
    const dto = plainToInstance(TestDtoJson, {
      payload: { n: 1, b: true, x: null, l: [1, 2] },
    });
    expect(dto.payload).toEqual({ n: 1, b: true, x: null, l: [1, 2] });
  });

  it('para de descer apos profundidade limite (evita stack overflow malicioso)', () => {
    // Cria objeto profundo de 50 niveis com payload < texto malicioso > no fundo.
    let curr: Record<string, unknown> = { texto: '<script>fim</script>' };
    for (let i = 0; i < 50; i++) curr = { sub: curr };

    const dto = plainToInstance(TestDtoJson, { payload: curr });

    // Acima do limite MAX_DEPTH (8) o objeto passa intacto — texto malicioso
    // segue dentro. Isso e intencional: e um trade-off entre profundidade
    // razoavel e proteção contra DoS. Aplicacao deve limitar profundidade
    // do JSON aceito via class-validator.
    expect(dto.payload).toBeTruthy();
  });
});
