import { AtualizarCatalogoUseCase } from './catalogos.use-cases';

/**
 * O STATUS DO CATÁLOGO, E AS DUAS PORTAS QUE ELE NÃO PODE ATRAVESSAR.
 *
 * ============================================================================
 * Este spec nasceu em 22/10/2026 com a EXCLUSÃO QUE NÃO APAGA:
 *
 *   *"ainda acho melhor não apagar diretamente; podemos colocar excluir, mas
 *   internamente tratamos como desativada, onde elas não têm acesso"*.
 *
 * "Excluir" virou uma mudança de status, e isso colocou o status no caminho de
 * duas travas que já existiam por boas razões. Uma delas precisou abrir.
 * ============================================================================
 */
describe('atualizar o catálogo', () => {
  const montar = (atual: Record<string, unknown>) => {
    const repositorio = {
      buscarPorId: jest.fn().mockResolvedValue(atual),
      atualizar: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    };
    return {
      uc: new AtualizarCatalogoUseCase(repositorio as never),
      repositorio,
    };
  };

  const coletando = { id: 'cat-1', status: 'COLETANDO', referencias: [] };
  const publicado = { id: 'cat-1', status: 'PUBLICADO', referencias: [] };

  /* ESTE É O TESTE DA DECISÃO DE 22/10. */
  it('EXCLUIR o aprovado é permitido', async () => {
    const { uc, repositorio } = montar(publicado);

    await uc.execute('cat-1', { status: 'EXCLUIDO' });

    // Excluir não contradiz a aprovação: ela continua gravada lá dentro,
    // inteira, para quando ele voltar. E é justamente o aprovado que alguém
    // mais precisa poder tirar da frente.
    expect(repositorio.atualizar).toHaveBeenCalledWith('cat-1', {
      status: 'EXCLUIDO',
    });
  });

  it('mas tirar o aprovado de PUBLICADO por aqui continua barrado', async () => {
    const { uc, repositorio } = montar(publicado);

    await expect(uc.execute('cat-1', { status: 'COLETANDO' })).rejects.toThrow(
      /desfaça a aprovação/i,
    );
    expect(repositorio.atualizar).not.toHaveBeenCalled();
  });

  it('e publicar pelo PATCH nunca foi caminho', async () => {
    const { uc, repositorio } = montar(coletando);

    await expect(uc.execute('cat-1', { status: 'PUBLICADO' })).rejects.toThrow(
      /Aprovar catálogo/i,
    );
    expect(repositorio.atualizar).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // E A EXIGÊNCIA DE REFERÊNCIA PARA LIBERAR, QUE CAIU NO MESMO DIA.
  //
  // A razão escrita era "sem referência a IA não tem o que seguir, e a foto
  // volta tratada em qualquer estilo". Deixou de descrever o sistema no RF31,
  // em 20/10: a foto entra CRUA e o tratamento só acontece a pedido.
  // ==========================================================================
  it('libera para receber foto mesmo sem referência nenhuma', async () => {
    const { uc, repositorio } = montar({
      id: 'cat-1',
      status: 'RASCUNHO',
      referencias: [],
    });

    await uc.execute('cat-1', { status: 'COLETANDO' });

    expect(repositorio.atualizar).toHaveBeenCalledWith('cat-1', {
      status: 'COLETANDO',
    });
  });

  it('mas liberar um catálogo que não existe continua sendo erro', async () => {
    const { uc } = montar(null as never);

    await expect(uc.execute('cat-1', { status: 'COLETANDO' })).rejects.toThrow(
      /não encontrado/i,
    );
  });

  it('mudar só o nome não passa por trava nenhuma', async () => {
    const { uc, repositorio } = montar(publicado);

    await uc.execute('cat-1', { nome: 'Dia das Mães 2026' });

    expect(repositorio.buscarPorId).not.toHaveBeenCalled();
    expect(repositorio.atualizar).toHaveBeenCalledWith('cat-1', {
      nome: 'Dia das Mães 2026',
    });
  });
});
