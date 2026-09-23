import { aparaIdErp, normalizarIdErp } from './normalizar-id-erp';

describe('normalizarIdErp', () => {
  describe('as tres formas que o Safira manda o mesmo id', () => {
    // O caso que motivou a funcao: `Movimentacao.operacaoid` chega como numero
    // (9000000324) e `Operacoes.idErpOperacoes` como texto com zeros
    // ("009000000324"). Se as duas nao colapsarem na mesma chave, a
    // movimentacao entra sem saber que operacao e — calada.
    it('deve colapsar numero, texto com zeros e texto com espacos na mesma chave', () => {
      expect(normalizarIdErp(9000000324)).toBe('9000000324');
      expect(normalizarIdErp('009000000324')).toBe('9000000324');
      expect(normalizarIdErp('     9000000324')).toBe('9000000324');
      expect(normalizarIdErp('9000000324  ')).toBe('9000000324');
    });

    it('deve tratar iderpmovimentacao e id_mest como o mesmo registro', () => {
      // Do dump: id_mest 1294138, iderpmovimentacao "     1294138".
      expect(normalizarIdErp('     1294138')).toBe(normalizarIdErp(1294138));
    });

    it('deve descartar o .0 de numero inteiro serializado como float', () => {
      expect(normalizarIdErp('1294138.0')).toBe('1294138');
      expect(normalizarIdErp('9000000324.00')).toBe('9000000324');
      expect(normalizarIdErp(478146)).toBe('478146');
    });
  });

  describe('o que NAO e numero passa intacto', () => {
    // `codigo_erp` e escolhido pela loja e pode ter zero significativo.
    it('deve preservar codigo de negocio', () => {
      expect(normalizarIdErp('VEN')).toBe('VEN');
      expect(normalizarIdErp('DVE')).toBe('DVE');
      expect(normalizarIdErp('AN001')).toBe('AN001');
      expect(normalizarIdErp('0-12')).toBe('0-12');
    });

    it('deve apenas aparar o texto nao numerico', () => {
      expect(normalizarIdErp('  BR26252  ')).toBe('BR26252');
    });
  });

  describe('bordas', () => {
    it('deve devolver null para ausencia e vazio', () => {
      expect(normalizarIdErp(null)).toBeNull();
      expect(normalizarIdErp(undefined)).toBeNull();
      expect(normalizarIdErp('')).toBeNull();
      expect(normalizarIdErp('   ')).toBeNull();
      expect(normalizarIdErp('.0')).toBeNull();
    });

    // Se "000" virasse string vazia, a linha entraria sem identidade e o
    // UNIQUE nao pegaria a segunda.
    it('deve reduzir uma sequencia de zeros a "0", nunca a vazio', () => {
      expect(normalizarIdErp('000')).toBe('0');
      expect(normalizarIdErp('0')).toBe('0');
      expect(normalizarIdErp(0)).toBe('0');
    });

    // O id do Safira ja passa de 9 bilhoes. Converter para Number para tirar
    // zero funcionaria hoje e falharia calado quando passar de 2^53.
    it('deve tratar id maior que 2^53 sem perder digito', () => {
      const gigante = '00' + '9'.repeat(25);
      expect(normalizarIdErp(gigante)).toBe('9'.repeat(25));
    });
  });
});

/**
 * `aparaIdErp` e a mesma regra SEM o passo dos zeros. Ela alimenta o
 * `operacoes.id_erp_bruto` (migracao 63), que existe so para a resposta da API
 * devolver o id na grafia em que o integrador mandou.
 */
describe('aparaIdErp', () => {
  it('deve preservar os zeros a esquerda — e o ponto dela existir', () => {
    expect(aparaIdErp('009000000324')).toBe('009000000324');
    expect(aparaIdErp('000')).toBe('000');
  });

  // Nao sao valor: espaco e sujeira do dump do Safira, e o `.0` e so como o
  // JSON escreve inteiro. Gravar qualquer um dos dois foi vetado em 04/09.
  it('deve aparar espaco das pontas e o .0 de serializacao', () => {
    expect(aparaIdErp('     1294138')).toBe('1294138');
    expect(aparaIdErp('009000000324.0')).toBe('009000000324');
    expect(aparaIdErp(9000000324)).toBe('9000000324');
  });

  it('deve deixar o que nao e numero como chegou', () => {
    expect(aparaIdErp('  VEN ')).toBe('VEN');
  });

  it('deve devolver null para ausencia e vazio', () => {
    expect(aparaIdErp(null)).toBeNull();
    expect(aparaIdErp(undefined)).toBeNull();
    expect(aparaIdErp('   ')).toBeNull();
    expect(aparaIdErp('.0')).toBeNull();
  });
});
