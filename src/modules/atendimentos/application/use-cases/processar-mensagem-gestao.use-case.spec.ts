import { ConfigService } from '@nestjs/config';
import { ProcessarMensagemGestaoUseCase } from './processar-mensagem-gestao.use-case';

/**
 * O CANAL DA GESTÃO, NA PARTE QUE ENTREGA ARQUIVO — RF36 e RF37.
 *
 * ============================================================================
 * ESTE SPEC NASCEU DE DOIS DEFEITOS QUE SAÍRAM NO MESMO DIA, 21/10/2026.
 *
 * 14:57 — "quais peças mais vendidas em julho" (ela listou as dez), "gera o
 * pdf", e a resposta foi *"Me perdi no meio da resposta e não cheguei a
 * escrever nada"*. O PDF ESTAVA PRONTO: a ferramenta rodou, o arquivo foi
 * montado, e o modelo encerrou o turno sem escrever uma palavra. O guarda do
 * texto vazio devolveu a desculpa e descartou o anexo, porque o webhook não
 * manda arquivo sem texto.
 *
 * E o outro, que este spec só agora alcança: `envelhecer` — o conserto do
 * arquivo com a tabela errada das 14:14 — foi escrito e NÃO CHAMADO de lugar
 * nenhum. O spec do serviço chamava direto, então passava. Prova por
 * existência, não por conteúdo: o canal da gestão não tinha spec, e era
 * justamente o canal onde o conserto precisava estar ligado.
 * ============================================================================
 *
 * Só o que é próprio deste caminho é exercitado aqui. O escopo das ferramentas
 * (quem vê a loja, quem vê a própria equipe) tem specs seus, no
 * `ferramentas-gestao.service.spec.ts`.
 */
describe('ProcessarMensagemGestaoUseCase — o arquivo e a tabela', () => {
  const PDF = {
    conteudo: Buffer.from('%PDF-1.3'),
    mime: 'application/pdf',
    nome: 'itens-mais-vendidos-21-10-2026.pdf',
    legenda: 'Itens mais vendidos — 10 linhas',
  };

  const MSG = {
    usuarioId: 'ad-1',
    nome: 'Lucas Barbosa',
    role: 'ADMIN',
    texto: 'gera o pdf',
  };

  let llm: { chatComFerramentas: jest.Mock; chat: jest.Mock };
  let memoria: { carregar: jest.Mock; registrar: jest.Mock };
  let montarArquivo: { execute: jest.Mock };
  let ultimoRelatorio: {
    guardar: jest.Mock;
    guardarTexto: jest.Mock;
    pegar: jest.Mock;
    envelhecer: jest.Mock;
  };
  let useCase: ProcessarMensagemGestaoUseCase;

  beforeEach(() => {
    llm = {
      chatComFerramentas: jest.fn().mockResolvedValue({ texto: 'ok', tokens: 1 }),
      chat: jest.fn(),
    };
    memoria = { carregar: jest.fn(() => []), registrar: jest.fn() };
    montarArquivo = { execute: jest.fn().mockResolvedValue(null) };
    ultimoRelatorio = {
      guardar: jest.fn(),
      guardarTexto: jest.fn(),
      pegar: jest.fn(),
      envelhecer: jest.fn(),
    };

    useCase = new ProcessarMensagemGestaoUseCase(
      { montar: jest.fn(() => ({})) } as never,
      memoria as never,
      { possui: jest.fn().mockResolvedValue(true) } as never,
      { equipeDoUsuario: jest.fn().mockResolvedValue(null) } as never,
      { paraPrompt: jest.fn().mockResolvedValue(''), handlers: jest.fn(() => ({})) } as never,
      { handlers: jest.fn(() => ({})) } as never,
      llm as never,
      { get: jest.fn(() => undefined) } as unknown as ConfigService,
      montarArquivo as never,
      ultimoRelatorio as never,
    );
  });

  /* ESTE É O TESTE DAS 14:57. */
  it('turno sem texto COM arquivo manda o arquivo, e não a desculpa', async () => {
    llm.chatComFerramentas.mockResolvedValue({
      texto: '',
      tokens: 0,
      arquivo: PDF,
    });

    const r = await useCase.execute(MSG);

    expect(r.arquivo).toBe(PDF);
    expect(r.resposta).not.toContain('Me perdi');
    // O webhook só manda o anexo depois de mandar o texto: frase vazia aqui
    // significa arquivo nenhum lá.
    expect(r.resposta.trim().length).toBeGreaterThan(0);
    expect(r.motivo).toBe('conversa');
  });

  it('e o turno entra na memória, porque produziu resposta', async () => {
    // O "e em planilha também?" de daqui a pouco precisa saber que já saiu um
    // arquivo. O turno que não produz NADA é que não entra.
    llm.chatComFerramentas.mockResolvedValue({
      texto: '',
      tokens: 0,
      arquivo: PDF,
    });

    await useCase.execute(MSG);

    expect(memoria.registrar).toHaveBeenCalledTimes(1);
  });

  it('sem artefato nenhum, a desculpa continua sendo a resposta', async () => {
    llm.chatComFerramentas.mockResolvedValue({ texto: '', tokens: 0 });

    const r = await useCase.execute(MSG);

    expect(r.resposta).toContain('Me perdi');
    expect(r.motivo).toBe('falha_agente');
    expect(memoria.registrar).not.toHaveBeenCalled();
  });

  /* ESTE É O TESTE DO FIO SOLTO: `envelhecer` escrito e não chamado. */
  it('toda mensagem envelhece a tabela guardada', async () => {
    await useCase.execute(MSG);

    expect(ultimoRelatorio.envelhecer).toHaveBeenCalledTimes(1);
  });

  it('envelhece sob a MESMA chave da memória de conversa', async () => {
    await useCase.execute(MSG);

    // Duas chaves diferentes para a mesma conversa fariam o PDF sair da
    // pergunta de outra pessoa — e nada no caminho saberia dizer de quem.
    expect(ultimoRelatorio.envelhecer.mock.calls[0][0]).toBe(
      memoria.carregar.mock.calls[0][0],
    );
  });

  // ==========================================================================
  // A TABELA É GUARDADA PELO FUNIL, E COM O TÍTULO DA FERRAMENTA.
  //
  // O modelo não nomeia mais o documento: às 14:14 ele rotulou de "Faturamento
  // por empresa" um arquivo com as vendas da Camila dentro, e o título errado
  // não se corrigiu sozinho — ele AUTENTICOU o conteúdo errado.
  // ==========================================================================
  /**
   * ========================================================================
   * O TITULO LEVA O RECORTE DA PERGUNTA — 26/10/2026.
   *
   * Ate aqui o guardado recebia so o nome da ferramenta, e o PDF das pecas
   * da Camila em agosto saia chamado "Itens mais vendidos" — sem a Camila e
   * sem agosto. *"Sinta falta dos dados."*
   *
   * Este teste e o fio inteiro do canal: o pedido que o modelo mandou chega
   * ao ouvinte, vira recorte por extenso e entra no titulo do arquivo.
   * ========================================================================
   */
  it('a consulta guarda a tabela com titulo, coluna e o recorte da pergunta', async () => {
    await useCase.execute(MSG);

    const params = llm.chatComFerramentas.mock.calls[0][0] as {
      aoResponderConsulta: (
        f: string,
        t: string,
        pedido?: Record<string, unknown>,
      ) => void;
    };
    params.aoResponderConsulta(
      'itens_mais_vendidos',
      ['- BRINCO — R$ 207.269', '- COLAR — R$ 147.626'].join(
        String.fromCharCode(10),
      ),
      { vendedora: 'camila', de: '2026-08-01', ate: '2026-08-31' },
    );

    expect(ultimoRelatorio.guardarTexto).toHaveBeenCalledWith(
      memoria.carregar.mock.calls[0][0],
      'Itens mais vendidos',
      expect.stringContaining('BRINCO'),
      {
        coluna: 'Peça',
        recorte: {
          titulo: 'Camila · agosto de 2026',
          periodo: 'agosto de 2026',
        },
      },
    );
  });

  it('o pedido de arquivo não deixa o modelo escolher nada além do formato', async () => {
    montarArquivo.execute.mockResolvedValue(PDF);
    await useCase.execute(MSG);

    const params = llm.chatComFerramentas.mock.calls[0][0] as {
      mandarRelatorio: (e: { formato: string }) => Promise<unknown>;
    };
    await params.mandarRelatorio({ formato: 'PDF' });

    // A chave e o formato. Nenhum título, nenhum dado — ver a concepção de
    // 24/09: "o modelo decide o que vai no papel; o dado não passa por ele".
    expect(montarArquivo.execute).toHaveBeenCalledWith(
      memoria.carregar.mock.calls[0][0],
      'PDF',
      { geradoPor: 'Lucas Barbosa' },
    );
  });
});
