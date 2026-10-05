import { ConsultarCarteiraVendedoraUseCase } from './consultar-carteira-vendedora.use-case';
import { ClienteRepository } from '../../../clientes/infrastructure/database/typeorm/repositories/cliente.repository';

/**
 * ==========================================================================
 * A CARTEIRA PARADA, EM PAGINAS — 05/10/2026.
 *
 * A gestora pediu quem estava parado na carteira da Keyciane. Eram 97, a
 * ferramenta devolvia dez, e nao havia como pedir o decimo primeiro. A agente
 * respondeu com honestidade:
 *
 *   "Ela nao pagina: sempre volta os 10 mais antigos, entao nao consigo
 *    avancar para o 11o em diante por aqui. Lista inteira dos 97,
 *    infelizmente, o sistema nao entrega."
 *
 * Nada ali estava errado. O teto de dez foi escolhido para a pergunta "me da
 * uma ideia de quem esta parado", e a pergunta que chegou foi outra: "quero
 * trabalhar os 97". Lista de trabalho se trabalha inteira.
 *
 * O QUE ESTES TESTES PROTEGEM NAO E O NUMERO 20 — e a PAGINACAO ser confiavel.
 * Uma lista paginada que repete ou pula nomes e pior que uma lista curta: a
 * gestora trabalharia a carteira achando que cobriu todo mundo.
 * ==========================================================================
 */
describe('a carteira parada, paginada', () => {
  function montar() {
    const clientes = {
      inativosDaCarteira: jest.fn().mockResolvedValue([]),
      contarInativosDaCarteira: jest.fn().mockResolvedValue(97),
    };
    const uc = new ConsultarCarteiraVendedoraUseCase(clientes as never);
    return { uc, clientes };
  }

  it('pede VINTE por vez, e pula o que ja foi mostrado', async () => {
    const { uc, clientes } = montar();

    await uc.semComprar('VD01', new Date('2026-04-05'), 20);

    expect(clientes.inativosDaCarteira).toHaveBeenCalledWith(
      'VD01',
      expect.any(Date),
      20, // o tamanho da pagina
      20, // quantos pular
    );
  });

  it('sem deslocamento, comeca do zero — o comportamento de sempre', async () => {
    const { uc, clientes } = montar();

    await uc.semComprar('VD01', new Date('2026-04-05'));

    expect(clientes.inativosDaCarteira).toHaveBeenCalledWith(
      'VD01',
      expect.any(Date),
      20,
      0,
    );
  });

  it('devolve o deslocamento junto, para quem formata dizer a faixa', async () => {
    // Sem isto, "do 21o ao 40o de 97" precisaria de alguem lembrando o que
    // pediu — e e um modelo de linguagem quem pede.
    const { uc } = montar();

    const pagina = await uc.semComprar('VD01', new Date('2026-04-05'), 40);

    expect(pagina.deslocamento).toBe(40);
    expect(pagina.total).toBe(97);
  });

  /**
   * QUEM PREENCHE ESTE CAMPO E UM MODELO DE LINGUAGEM, a partir de frases como
   * "me manda os proximos". Um -5 ou um 20,5 chegando ao SQL seria erro de
   * banco no meio de uma conversa; virar a primeira pagina e inofensivo.
   */
  it('deslocamento negativo vira zero, e nao um erro de banco', async () => {
    const { uc, clientes } = montar();

    await uc.semComprar('VD01', new Date('2026-04-05'), -5);

    expect(clientes.inativosDaCarteira).toHaveBeenCalledWith(
      'VD01',
      expect.any(Date),
      20,
      0,
    );
  });

  it('deslocamento fracionario e truncado', async () => {
    const { uc, clientes } = montar();

    await uc.semComprar('VD01', new Date('2026-04-05'), 20.7);

    expect(clientes.inativosDaCarteira).toHaveBeenCalledWith(
      'VD01',
      expect.any(Date),
      20,
      20,
    );
  });

  it('vendedora sem codigo do ERP continua devolvendo vazio', async () => {
    const { uc, clientes } = montar();

    const pagina = await uc.semComprar(null, new Date('2026-04-05'), 20);

    expect(pagina).toEqual({ clientes: [], total: 0 });
    expect(clientes.inativosDaCarteira).not.toHaveBeenCalled();
  });
});

/**
 * ==========================================================================
 * O SQL TEM DE TER DESEMPATE — e este e o teste que menos parece necessario.
 *
 * A ordenacao e `MAX(data_movimentacao) ASC NULLS FIRST`. Quem NUNCA comprou
 * tem `NULL` ali, e sao dezenas de clientes com a MESMA chave. Sem um segundo
 * criterio, o Postgres nao promete ordem nenhuma entre eles — e a ordem pode
 * mudar de uma consulta para a outra.
 *
 * COM `OFFSET` ISSO VIRA DADO ERRADO, SEM ERRO NENHUM: a pagina 2 repete
 * nomes da pagina 1 e pula outros. A gestora trabalharia a carteira inteira
 * convencida de que cobriu todo mundo, e alguns clientes nunca apareceriam.
 *
 * O teste le o SQL do arquivo, e nao uma copia: copiar o SQL para o teste e
 * testar a copia.
 * ==========================================================================
 */
describe('o SQL dos inativos', () => {
  const fonte: string = require('fs').readFileSync(
    require.resolve(
      '../../../clientes/infrastructure/database/typeorm/repositories/cliente.repository.ts',
    ),
    'utf8',
  );

  const sql = /SELECT c\.id,\s+c\.nome,[\s\S]*?LIMIT \$3 OFFSET \$4/.exec(fonte)?.[0];

  it('existe, e tem OFFSET', () => {
    expect(sql).toBeTruthy();
    expect(sql).toContain('LIMIT $3 OFFSET $4');
  });

  it('ordena com um segundo criterio, estavel entre as paginas', () => {
    expect(sql).toContain(
      'ORDER BY MAX(v.data_movimentacao) ASC NULLS FIRST, c.nome ASC',
    );
  });

  it('o metodo aceita o deslocamento', () => {
    // A assinatura e o contrato: sem o parametro, o OFFSET acima receberia
    // sempre o mesmo valor e a paginacao seria decorativa.
    expect(ClienteRepository.prototype.inativosDaCarteira.length).toBeGreaterThanOrEqual(3);
  });
});
