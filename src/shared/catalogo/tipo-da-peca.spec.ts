import {
  TIPOS_DE_JOIA,
  ehJoia,
  pedraDoTermo,
  pedrasDaPeca,
  prefixosDoTipo,
  tipoDaPeca,
} from './sinonimos';

/**
 * O TIPO DA PEÇA, E AS PEDRAS DELA — 16/11/2026.
 *
 * ==========================================================================
 * A COLUNA `familia` NÃO GUARDA O TIPO DA PEÇA.
 *
 * Guarda o tipo E o estilo, misturados. Medido em 16/11 no catálogo inteiro:
 *
 *   RIVEIRA    ->  73 peças com código CO (colar)  e  17 com PU (pulseira)
 *   SOLITARIO  ->  29 BR, 13 CO, 8 AN, 1 PI
 *
 * Um colar riviera é um colar. Mas o `quem_mais_vende` casa por igualdade na
 * `familia`, então ele some da conta: perguntada quantos colares a loja
 * vendeu em 2026, a agente responde 108 quando a verdade é 118.
 *
 * DENTRO DA JOIA O PREFIXO DO CÓDIGO É LIMPO: seis prefixos cobrem 6.043 das
 * 6.072 peças `JEWEL`. FORA DELA É LIXO: `CO` reúne BANDEJA, COLAR, CORSET,
 * LIVRO e SAIA. E fora dela a `familia` é limpa — VASO 182, BOWL 132.
 *
 * Daí a regra de duas pernas, cada uma no terreno onde foi medida.
 * ==========================================================================
 */
describe('o tipo da peça', () => {
  describe('dentro da joia, manda o prefixo do código', () => {
    it('o colar riviera é um colar, e não um "riviera"', () => {
      expect(
        tipoDaPeca({
          categoria: 'JEWEL',
          codigoErp: 'CO25112',
          familia: 'RIVEIRA',
        }),
      ).toBe('colar');
    });

    it('o brinco solitário é um brinco', () => {
      expect(
        tipoDaPeca({
          categoria: 'JEWEL',
          codigoErp: 'BR25120',
          familia: 'SOLITARIO',
        }),
      ).toBe('brinco');
    });

    it('a pulseira riviera é uma pulseira — o mesmo estilo, outro tipo', () => {
      expect(
        tipoDaPeca({
          categoria: 'JEWEL',
          codigoErp: 'PU25095',
          familia: 'RIVEIRA',
        }),
      ).toBe('pulseira');
    });

    /** Existe UMA peça cadastrada com `br` minúsculo. Medido em 16/11. */
    it('o código em minúscula casa igual', () => {
      expect(
        tipoDaPeca({ categoria: 'JEWEL', codigoErp: 'br12345', familia: '' }),
      ).toBe('brinco');
    });

    it('a cauda de prefixos raros também tem nome', () => {
      const tipos = ['AP0001', 'AL0001', 'TO0001', 'CJ0001', 'EX0001'].map(
        (codigoErp) => tipoDaPeca({ categoria: 'JEWEL', codigoErp }),
      );
      expect(tipos).toEqual([
        'anel',
        'anel',
        'tornozeleira',
        'conjunto',
        'colar',
      ]);
    });

    /**
     * SÃO 2 PEÇAS EM TODO O CATÁLOGO (prefixo `DI`). Cair na família é melhor
     * do que cair em "sem tipo": o cadastro ainda sabe alguma coisa.
     */
    it('prefixo que o dicionário não conhece cai na família', () => {
      expect(
        tipoDaPeca({
          categoria: 'JEWEL',
          codigoErp: 'DI0001',
          familia: 'DIAM',
        }),
      ).toBe('diam');
    });
  });

  describe('fora da joia, manda a família', () => {
    it('o vaso é vaso, e o prefixo dele não quer dizer nada', () => {
      expect(
        tipoDaPeca({
          categoria: 'HOME',
          codigoErp: 'C60123',
          familia: 'VASO',
        }),
      ).toBe('vaso');
    });

    /**
     * O PREFIXO `CO` FORA DA JOIA reúne BANDEJA, COLAR, CORSET, LIVRO e SAIA.
     * Se a perna errada atendesse aqui, o corset viraria colar.
     */
    it('o corset de código CO não vira colar', () => {
      expect(
        tipoDaPeca({
          categoria: 'AT WEAR',
          codigoErp: 'CO90001',
          familia: 'CORSET',
        }),
      ).toBe('corset');
    });
  });

  /**
   * OS 14 "COLARES" QUE NÃO SÃO `JEWEL` em 2026 são colares de verdade —
   * COLLAB VR, WISH, GOLDESIGN —, com ouro 18K e diamante. A `categoria` ali
   * é linha comercial, não classe de material.
   *
   * As duas pernas caem no MESMO vocabulário para que somem numa linha só.
   */
  it('o colar da COLLAB e o colar da JEWEL são a mesma palavra', () => {
    const daJoia = tipoDaPeca({
      categoria: 'JEWEL',
      codigoErp: 'CO26093',
      familia: 'COLAR',
    });
    const daCollab = tipoDaPeca({
      categoria: 'COLLAB VR',
      codigoErp: 'CO30001',
      familia: 'COLAR',
    });
    expect(daJoia).toBe('colar');
    expect(daCollab).toBe('colar');
  });

  it('sem código e sem família, diz que não sabe', () => {
    expect(tipoDaPeca({ categoria: 'HOME', codigoErp: '', familia: '' })).toBe(
      'sem tipo',
    );
    expect(tipoDaPeca({})).toBe('sem tipo');
  });

  /**
   * A JOIA É UM CONJUNTO DE TIPOS, NÃO UMA CATEGORIA — é o que permite dizer
   * "total de joia" incluindo o colar da COLLAB e excluindo o vaso.
   */
  describe('o que conta como joia', () => {
    it('os tipos de joia são os oito', () => {
      expect([...TIPOS_DE_JOIA].sort()).toEqual([
        'anel',
        'brinco',
        'colar',
        'conjunto',
        'piercing',
        'pingente',
        'pulseira',
        'tornozeleira',
      ]);
    });

    it('colar é joia; vaso e corset não são', () => {
      expect(ehJoia('colar')).toBe(true);
      expect(ehJoia('vaso')).toBe(false);
      expect(ehJoia('corset')).toBe(false);
      expect(ehJoia('sem tipo')).toBe(false);
    });
  });
});

/**
 * AS PEDRAS VÊM DE DUAS FONTES, E AS DUAS SÃO PARCIAIS.
 *
 * Medido em 16/11 nas 582 peças vendidas em 2026: juntas, as duas reconhecem
 * pedra em 337. O campo `tipo_pedra` sozinho perderia 43 peças; a etiqueta
 * sozinha perderia 49. É o mesmo arranjo que a ficha da peça já usava — esta
 * função é aquela, extraída para onde o `PEDRAS` mora.
 */
describe('as pedras da peça', () => {
  it('junta o campo e a etiqueta sem repetir', () => {
    expect(
      pedrasDaPeca('ESM', 'COLAR ESM 5.31 CT DTS 13.46 OB 18K').sort(),
    ).toEqual(['diamante', 'esmeralda']);
  });

  it('a etiqueta nomeia pedra que o campo não tem', () => {
    expect(pedrasDaPeca(null, 'BRINCO DTS 7.06 CTS CIT 18.25 CTS')).toEqual(
      expect.arrayContaining(['diamante', 'citrino']),
    );
  });

  it('o campo nomeia pedra que a etiqueta não tem', () => {
    expect(pedrasDaPeca('RBI', 'COLAR OB 18K 125G')).toEqual(['rubi']);
  });

  /**
   * O DICIONÁRIO É DE SIGLAS, E NÃO DE NOMES POR EXTENSO — `RBI` é rubi,
   * `CIT` é citrino, e as palavras inteiras não resolvem. `RUB` chega a ser
   * armadilha: é RUBELITA, não rubi, e está escrito lá desde 08/10.
   *
   * ISSO DEIXA UM BURACO, E ELE FOI MEDIDO: das 376 joias vendidas em 2026,
   * 58 não têm pedra reconhecida, e dessas **8** dizem a pedra por extenso
   * ("COLAR TURQUESA COM GOTA OPALA", "PINGENTE AMETISTA 30CT"). As outras 50
   * são corrente, elo cartier, fio e choker — ouro liso, sem pedra nenhuma.
   *
   * 8 peças em 376 é 2%, e alargar o dicionário mexeria na BUSCA DO CATÁLOGO,
   * que divide esse mesmo mapa. Fica medido e fica assim.
   */
  it('nome por extenso não resolve, e isso é sabido', () => {
    expect(pedrasDaPeca(null, 'COLAR TURQUESA COM GOTA OPALA OB 18K')).toEqual(
      [],
    );
  });

  /**
   * `CTS` É QUILATE, e está no dicionário de busca como qualquer sigla. Sem a
   * conferência contra o `PEDRAS`, toda etiqueta da casa teria uma pedra
   * chamada quilate — é o mesmo defeito que o teste pegou no metal.
   */
  it('sigla que não é pedra não entra', () => {
    expect(pedrasDaPeca(null, 'ANEL 3.01 CTS OB 18K 4.0G TAM 10')).toEqual([]);
    expect(pedrasDaPeca('CTS', null)).toEqual([]);
  });

  /**
   * `SAFAM` É SAFIRA AMARELA, e é sigla conhecida — eu tinha lido o
   * comentário da ficha ("SAFAM não é palavra") como se dissesse que ela não
   * resolve. Diz o contrário: resolve, e por isso não se mostra crua.
   */
  it('a sigla estranha que É pedra entra', () => {
    expect(pedrasDaPeca('SAFAM', null)).toEqual(['safira']);
  });

  it('sem nada, nenhuma pedra', () => {
    expect(pedrasDaPeca(null, null)).toEqual([]);
    expect(pedrasDaPeca('', '')).toEqual([]);
  });
});

/**
 * O CAMINHO INVERSO — da palavra que a gestora fala para os prefixos.
 *
 * É o que conserta o `quem_mais_vende`: perguntada quantos colares, a
 * consulta precisa procurar `CO` e `EX`, e não a palavra COLAR na `familia`.
 *
 * DEVOLVE `null` PARA O QUE NÃO É TIPO DE JOIA, e isso preserva o que já
 * funcionava: "quantas rivieras vendemos" continua casando pela `familia`,
 * porque riviera é estilo e não tipo — e o vaso idem.
 */
describe('os prefixos de um tipo de joia', () => {
  it('colar inclui o prefixo raro EX', () => {
    expect(prefixosDoTipo('colar')).toEqual(['CO', 'EX']);
  });

  it('anel reúne os três prefixos dele', () => {
    expect(prefixosDoTipo('anel')).toEqual(['AN', 'AP', 'AL']);
  });

  it('aceita a palavra como a pessoa falou', () => {
    expect(prefixosDoTipo('  Colar ')).toEqual(['CO', 'EX']);
  });

  it('o que não é tipo de joia não tem prefixo nenhum', () => {
    expect(prefixosDoTipo('vaso')).toBeNull();
    expect(prefixosDoTipo('riviera')).toBeNull();
    expect(prefixosDoTipo('solitario')).toBeNull();
  });
});

/**
 * O NOME DA PEDRA COMO A PESSOA FALA — 16/11/2026.
 *
 * ==========================================================================
 * TRÊS CAMINHOS, E OS TRÊS SÃO NECESSÁRIOS.
 *
 * Medido em 16/11 contra o dicionário: `diamante` e `esmeralda` casam diretos;
 * `DTS` e `BRI` só casam por sigla; e `pérola`, `topázio` e `diamantes` NÃO
 * CASAM DE JEITO NENHUM — acento e plural. A gestora digita os dois.
 *
 * `brilhante` continua sem casar, e é correto: não está no dicionário, então
 * a resposta devolve a lista e pergunta qual.
 * ==========================================================================
 */
describe('o nome da pedra como a pessoa fala', () => {
  it('o nome exato casa', () => {
    expect(pedraDoTermo('diamante')).toBe('diamante');
    expect(pedraDoTermo('agua marinha')).toBe('agua marinha');
  });

  it('o acento não atrapalha', () => {
    expect(pedraDoTermo('pérola')).toBe('perola');
    expect(pedraDoTermo('topázio')).toBe('topazio');
    expect(pedraDoTermo('ágata')).toBe('agata');
  });

  it('o plural também casa', () => {
    expect(pedraDoTermo('diamantes')).toBe('diamante');
    expect(pedraDoTermo('esmeraldas')).toBe('esmeralda');
    expect(pedraDoTermo('PÉROLAS')).toBe('perola');
  });

  it('a sigla da etiqueta casa', () => {
    expect(pedraDoTermo('DTS')).toBe('diamante');
    expect(pedraDoTermo('BRI')).toBe('diamante');
    expect(pedraDoTermo('ESM')).toBe('esmeralda');
  });

  it('o que não é pedra não vira pedra', () => {
    expect(pedraDoTermo('brilhante')).toBeNull();
    expect(pedraDoTermo('CTS')).toBeNull();
    expect(pedraDoTermo('ouro branco')).toBeNull();
    expect(pedraDoTermo('')).toBeNull();
  });
});
