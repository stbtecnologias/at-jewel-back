import { EstrategiaDeVendasService } from './estrategia-de-vendas.service';

/**
 * O DOSSIÊ QUE VIRA PLANO DE VENDAS — RF38.
 *
 * ============================================================================
 * O QUE ESTE SPEC PROTEGE é a divisão de trabalho, e não o texto.
 *
 * A receita é do Lucas, em 22/10: *"clientes que estão há algum tempo sem
 * comprar, clientes que sempre compram no mês em que estamos, as peças que a
 * vendedora mais solicita — e faz um plano estratégico de vendas, com sugestão
 * com base no perfil da vendedora"*.
 *
 * O serviço junta as cinco leituras e devolve TEXTO com nome, data e número
 * como o banco os deu. **Ele não escreve o plano** — quem escreve é a agente.
 * É a mesma divisão de 24/09: o dado não passa pelo modelo, a redação passa.
 * ============================================================================
 */
describe('a estratégia de vendas', () => {
  const EM_OUTUBRO = new Date('2026-10-22T10:00:00-03:00');

  const montar = (over: Record<string, unknown> = {}) => {
    const desempenho = {
      vendas: jest
        .fn()
        .mockResolvedValue({ quantidade: 3, receita: 90000, ticketMedio: 30000 }),
      metas: jest.fn().mockResolvedValue([]),
    };
    const carteira = {
      semComprar: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
      porEpoca: jest.fn().mockResolvedValue({ clientes: [], total: 0 }),
    };
    const vendas = { itens: jest.fn().mockResolvedValue({ linhas: [] }) };
    Object.assign(desempenho, over.desempenho ?? {});
    Object.assign(carteira, over.carteira ?? {});
    Object.assign(vendas, over.vendas ?? {});

    return {
      servico: new EstrategiaDeVendasService(
        desempenho as never,
        carteira as never,
        vendas as never,
      ),
      desempenho,
      carteira,
      vendas,
    };
  };

  /* ESTE É O TESTE: as cinco leituras, e nenhuma inventada. */
  it('junta as cinco leituras, com o recorte de cada uma', async () => {
    const { servico, desempenho, carteira, vendas } = montar();

    await servico.montar('vd-1', 'Camila', 'SEED-VD01', EM_OUTUBRO);

    expect(desempenho.vendas).toHaveBeenCalledWith('vd-1', 'MES', EM_OUTUBRO);
    expect(desempenho.metas).toHaveBeenCalledWith('vd-1');
    // O mês do ano é o de HOJE: é o que torna "quem compra agora" útil.
    expect(carteira.porEpoca).toHaveBeenCalledWith('SEED-VD01', { mes: 10 });
    // E as peças dela, do ano — o perfil não se lê numa semana.
    expect(vendas.itens).toHaveBeenCalledWith('ANO', 8, 'vd-1', EM_OUTUBRO);
  });

  it('os clientes parados são os de mais de 90 dias', async () => {
    const { servico, carteira } = montar();

    await servico.montar('vd-1', 'Camila', 'SEED-VD01', EM_OUTUBRO);

    const desde = carteira.semComprar.mock.calls[0][1] as Date;
    const dias = Math.round(
      (EM_OUTUBRO.getTime() - desde.getTime()) / 86_400_000,
    );
    expect(dias).toBe(90);
  });

  it('o texto traz nome, data e valor como vieram', async () => {
    const { servico } = montar({
      carteira: {
        semComprar: jest.fn().mockResolvedValue({
          clientes: [
            {
              nome: 'Juliana Karla',
              ultimaCompra: new Date('2026-05-10T12:00:00-03:00'),
              quantidade: 2,
              valorTotal: 1000,
            },
          ],
          total: 1,
        }),
        porEpoca: jest.fn().mockResolvedValue({
          clientes: [
            {
              nome: 'Monique Bruna',
              quantidade: 3,
              anos: 3,
              valorTotal: 45000,
              ultimaCompra: new Date('2025-10-02T12:00:00-03:00'),
            },
          ],
          total: 1,
        }),
      },
    });

    const texto = await servico.montar(
      'vd-1',
      'Camila',
      'SEED-VD01',
      EM_OUTUBRO,
    );

    expect(texto).toContain('Juliana Karla');
    expect(texto).toContain('10/05/2026');
    expect(texto).toContain('Monique Bruna');
    // "Em 3 anos diferentes" é o que separa hábito de coincidência, e é a
    // informação que faz a agente escolher por quem começar.
    expect(texto).toContain('3 anos diferentes');
    expect(texto).toContain('R$');
  });

  // ==========================================================================
  // SEM CARTEIRA, O PLANO AINDA EXISTE — e isso não é detalhe: vendedora sem
  // código no ERP não tem carteira, e ainda assim vende.
  // ==========================================================================
  it('sem código no ERP, não pergunta pela carteira e segue', async () => {
    const { servico, carteira } = montar();

    const texto = await servico.montar('vd-1', 'Camila', null, EM_OUTUBRO);

    expect(carteira.semComprar).not.toHaveBeenCalled();
    expect(carteira.porEpoca).not.toHaveBeenCalled();
    expect(texto).toContain('3 vendas');
  });

  it('sem nada para planejar, diz isso em vez de devolver um plano vazio', async () => {
    const { servico } = montar({
      desempenho: {
        vendas: jest
          .fn()
          .mockResolvedValue({ quantidade: 0, receita: 0, ticketMedio: 0 }),
        metas: jest.fn().mockResolvedValue([]),
      },
    });

    const texto = await servico.montar('vd-1', 'Camila', null, EM_OUTUBRO);

    expect(texto).toMatch(/não há de onde tirar/i);
  });

  it('o nome entra no texto — é o plano DELA', async () => {
    const { servico } = montar();

    expect(await servico.montar('vd-1', 'Camila', null, EM_OUTUBRO)).toContain(
      'Camila',
    );
    // E no canal dela o nome é "você": a mesma receita, outra pessoa falando.
    expect(await servico.montar('vd-1', 'você', null, EM_OUTUBRO)).toContain(
      'você',
    );
  });
});
