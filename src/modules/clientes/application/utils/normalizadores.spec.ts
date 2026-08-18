import { normalizarTelefone, variantesTelefone } from './normalizadores';

describe('normalizarTelefone', () => {
  it('remove tudo que nao e digito', () => {
    expect(normalizarTelefone('(85) 9 8888-7777')).toBe('85988887777');
    expect(normalizarTelefone('+55 85 98888-7777')).toBe('5585988887777');
  });
});

describe('variantesTelefone', () => {
  // O caso real de 17/08/2026: o numero cadastrado tem o nono digito, mas a
  // conta de WhatsApp e anterior a mudanca e e entregue sem ele.
  it('celular com DDI e nono digito gera as quatro formas', () => {
    expect(variantesTelefone('5585986467241')).toEqual([
      '5585986467241', // como veio — sempre primeiro
      '558586467241', // sem o nono digito
      '85986467241', // sem DDI
      '8586467241', // sem DDI e sem o nono digito
    ]);
  });

  it('e o caminho inverso encontra o mesmo conjunto', () => {
    const doWhatsapp = variantesTelefone('558586467241');
    expect(doWhatsapp).toContain('5585986467241');
    expect(doWhatsapp[0]).toBe('558586467241');
  });

  it('as duas formas do mesmo numero se alcancam', () => {
    const comNove = variantesTelefone('5585986467241');
    const semNove = variantesTelefone('558586467241');
    expect(comNove).toContain('558586467241');
    expect(semNove).toContain('5585986467241');
  });

  it('celular sem DDI gera a forma com DDI', () => {
    expect(variantesTelefone('85986467241')).toContain('5585986467241');
    expect(variantesTelefone('85986467241')).toContain('558586467241');
  });

  it('aceita numero formatado', () => {
    expect(variantesTelefone('+55 (85) 9 8646-7241')).toEqual(
      variantesTelefone('5585986467241'),
    );
  });

  // Fixo comeca com 2-5 no assinante. Inventar um 9 ali criaria um numero de
  // celular que pode ser de outra pessoa.
  it('telefone fixo NAO ganha variante de nono digito', () => {
    const fixo = variantesTelefone('558533334444');
    expect(fixo).toEqual(['558533334444', '8533334444']);
    expect(fixo.some((v) => v.includes('93333'))) .toBe(false);
  });

  it('formato irreconhecivel volta sozinho, sem palpite', () => {
    expect(variantesTelefone('123')).toEqual(['123']);
    expect(variantesTelefone('551199887766554433')).toEqual(['551199887766554433']);
  });

  it('vazio devolve lista vazia', () => {
    expect(variantesTelefone('')).toEqual([]);
    expect(variantesTelefone('abc')).toEqual([]);
  });

  it('nao repete formas', () => {
    const v = variantesTelefone('5585986467241');
    expect(new Set(v).size).toBe(v.length);
  });
});
