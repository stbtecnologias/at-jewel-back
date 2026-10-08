import { RotearMensagemInternaUseCase } from './rotear-mensagem-interna.use-case';
import { ProcessarFotoCatalogoUseCase } from './processar-foto-catalogo.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import { RecepcaoService } from '../recepcao.service';
import { RecepcionarUseCase } from './recepcionar.use-case';
import { MemoriaDeGrupoService } from '../memoria-de-grupo.service';

/**
 * A conferencia da foto NAO participa destes testes: null quer dizer "nao
 * deu para conferir", e nesse caso a foto segue o caminho de sempre. Os testes
 * da recusa ficam no bloco proprio, mais abaixo.
 */
const CONFERENCIA_NULA = {
  disponivel: () => true,
  conferir: jest.fn().mockResolvedValue(null),
} as never;

/**
 * O roteador do canal interno.
 *
 * O QUE ESTES TESTES PROTEGEM sao duas invariantes que nao aparecem lendo o
 * codigo de cima para baixo:
 *
 * 1. A ORDEM. Vendedora e procurada ANTES da gestao. O papel VENDEDORA e opcao
 *    do seletor de usuarios, entao vendedora com login TEM linha em
 *    `admin_users`; invertida a ordem, bastaria ela cadastrar o proprio celular
 *    para cair no canal que enxerga a equipe inteira.
 *
 * 2. A CATRACA DO CUSTO. Transcricao so acontece depois de reconhecer alguem.
 *    Audio de estranho nao pode custar um centavo.
 */
describe('RotearMensagemInternaUseCase', () => {
  const VENDEDORA = {
    id: 'vd-1',
    nome: 'Marina Albuquerque',
    codigoErp: 'SEED-VD01',
  };
  const ADMIN = { id: 'ad-1', nome: 'Lucas Barbosa', role: 'ADMIN' };

  const AUDIO = {
    url: 'http://waha:3000/api/files/default/abc.oga',
    mimetype: 'audio/ogg; codecs=opus',
    segundos: 5,
  };

  let identificarVendedora: { execute: jest.Mock };
  let identificarAdmin: { execute: jest.Mock };
  let canalVendedora: { execute: jest.Mock };
  let canalGestao: { execute: jest.Mock };
  let canalCatalogo: {
    foto: jest.Mock;
    resposta: jest.Mock;
    temFotoEsperando: jest.Mock;
    temFotoEmAprovacao: jest.Mock;
    lembreteDaAprovacao: jest.Mock;
    falaDeFotosPendentes: jest.Mock;
    fotosPendentes: jest.Mock;
    temFotoComFalha: jest.Mock;
    tentarDeNovo: jest.Mock;
    aprovacao: jest.Mock;
    temCodigoEsperando: jest.Mock;
    esperandoConsulta: jest.Mock;
    pedirConsulta: jest.Mock;
    consulta: jest.Mock;
    codigo: jest.Mock;
    buscarPeca: jest.Mock;
    conversa: jest.Mock;
    conversaAberta: jest.Mock;
    continuarConversa: jest.Mock;
    falaDeMandarFoto: jest.Mock;
    falaDeConsultar: jest.Mock;
    falaDeCatalogos: jest.Mock;
    consultarAgora: jest.Mock;
    intencao: jest.Mock;
  };
  let whatsapp: { baixarMidia: jest.Mock; numeroDoAgente: jest.Mock };
  let transcricao: { transcrever: jest.Mock; disponivel: jest.Mock };
  /** RF9 — o leitor abre o arquivo; a analise o le SEM ferramenta nenhuma. */
  let leitor: { ler: jest.Mock };
  let analise: { analisar: jest.Mock };
  let useCase: RotearMensagemInternaUseCase;

  beforeEach(() => {
    identificarVendedora = { execute: jest.fn().mockResolvedValue(null) };
    identificarAdmin = { execute: jest.fn().mockResolvedValue(null) };
    canalVendedora = {
      execute: jest
        .fn()
        .mockResolvedValue({ resposta: 'da elena', motivo: 'conversa' }),
    };
    canalGestao = {
      execute: jest
        .fn()
        .mockResolvedValue({ resposta: 'da anastasia', motivo: 'conversa' }),
    };
    // Sem foto esperando por padrao: o fluxo de texto continua indo para os
    // dois agentes de sempre, que e o que os testes daqui verificam.
    canalCatalogo = {
      foto: jest.fn().mockResolvedValue({
        resposta: 'foto guardada',
        motivo: 'foto_guardada',
      }),
      resposta: jest.fn().mockResolvedValue({
        resposta: 'classificada',
        motivo: 'fotos_classificadas',
      }),
      temFotoEsperando: jest.fn(() => false),
      temFotoEmAprovacao: jest.fn(() => false),
      lembreteDaAprovacao: jest.fn(async () => null),
      falaDeFotosPendentes: jest.fn(() => false),
      fotosPendentes: jest.fn(),
      temFotoComFalha: jest.fn(() => false),
      tentarDeNovo: jest.fn().mockResolvedValue(null),
      aprovacao: jest.fn().mockResolvedValue(null),
      temCodigoEsperando: jest.fn(() => false),
      esperandoConsulta: jest.fn(() => false),
      pedirConsulta: jest.fn(() => ({
        resposta: 'qual peca?',
        motivo: 'catalogo_consulta_pedida',
      })),
      consulta: jest.fn().mockResolvedValue(null),
      codigo: jest.fn().mockResolvedValue(null),
      buscarPeca: jest.fn().mockResolvedValue(null),
      conversa: jest.fn().mockResolvedValue({
        resposta: 'do catalogo',
        motivo: 'catalogo_conversa',
      }),
      conversaAberta: jest.fn(() => false),
      continuarConversa: jest.fn().mockResolvedValue(null),
      falaDeMandarFoto: jest.fn(() => false),
      falaDeConsultar: jest.fn(() => false),
      falaDeCatalogos: jest.fn(() => false),
      consultarAgora: jest.fn().mockResolvedValue({
        resposta: 'qual peca?',
        motivo: 'catalogo_consulta_pedida',
      }),
      intencao: jest.fn().mockResolvedValue({
        resposta: 'pode mandar',
        motivo: 'catalogo_intencao',
      }),
    };
    whatsapp = {
      baixarMidia: jest.fn(),
      // O numero do outro agente, para a frase do desvio — ver "dois numeros".
      numeroDoAgente: jest.fn().mockResolvedValue('558598490118'),
    };
    transcricao = { transcrever: jest.fn(), disponivel: jest.fn(() => true) };
    // RF9 — o leitor abre o arquivo, a analise o le SEM ferramenta. Por
    // padrao nenhum teste manda documento, e ai nenhum dos dois e tocado.
    leitor = { ler: jest.fn() };
    analise = { analisar: jest.fn() };

    useCase = new RotearMensagemInternaUseCase(
      identificarVendedora as never,
      identificarAdmin as never,
      canalVendedora as never,
      canalGestao as never,
      canalCatalogo as never,
      new RecepcionarUseCase(new RecepcaoService()),
      whatsapp as never,
      transcricao,
      new MemoriaDeGrupoService(),
      leitor as never,
      analise as never,
    );
  });

  /**
   * A ANASTASIA EM GRUPO — 30/09/2026, pedido do Lucas.
   *
   * ========================================================================
   * DUAS INVARIANTES, E A SEGUNDA E A QUE NAO SE VE LENDO O CODIGO.
   *
   * 1. SEM MENCAO, NADA ACONTECE. Nao e so "nao responde": nao transcreve
   *    audio, nao reconhece ninguem, nao chama o modelo. Um grupo movimentado
   *    nao pode virar conta — e a guarda tem de ser a PRIMEIRA linha, senao
   *    cada mensagem do grupo paga um lookup antes de ser descartada.
   *
   * 2. QUEM FALOU E O AUTOR, NAO O CHAT. Em conversa direta os dois sao a
   *    mesma coisa, e o canal inteiro foi escrito em cima disso. Num grupo,
   *    procurar um admin com o telefone do grupo nao acha ninguem, nunca —
   *    e o sintoma seria "ela ignora todo mundo no grupo", sem erro nenhum.
   * ========================================================================
   */
  describe('em grupo', () => {
    const grupo = (mencionada: boolean) => ({
      de: '120363111111111111@g.us',
      texto: 'qual o faturamento da semana?',
      grupo: {
        autor: '558586467241@c.us',
        mencionados: mencionada ? ['158205808246878@lid'] : [],
        mencionada,
      },
    });

    it('sem menção, fica calada — e não gasta nem um lookup', async () => {
      const r = await useCase.execute(grupo(false));

      expect(r.resposta).toBeNull();
      expect(r.motivo).toBe('ignorado_grupo_sem_mencao');
      expect(identificarVendedora.execute).not.toHaveBeenCalled();
      expect(identificarAdmin.execute).not.toHaveBeenCalled();
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('sem menção, áudio de grupo não é transcrito', async () => {
      await useCase.execute({ ...grupo(false), texto: '', audio: AUDIO });

      expect(transcricao.transcrever).not.toHaveBeenCalled();
    });

    /* O reconhecimento usa o AUTOR. Com o telefone do grupo nao acharia
     * ninguem, e a agente ignoraria todo mundo sem dizer por que. */
    it('mencionada, reconhece quem FALOU e não o grupo', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      await useCase.execute(grupo(true));

      expect(identificarAdmin.execute).toHaveBeenCalledWith('558586467241');
    });

    it('mencionada por quem NÃO tem cadastro, continua calada', async () => {
      identificarVendedora.execute.mockResolvedValue(null);
      identificarAdmin.execute.mockResolvedValue(null);

      const r = await useCase.execute(grupo(true));

      expect(canalGestao.execute).not.toHaveBeenCalled();
      expect(r.resposta).toBeNull();
    });

    /* A conversa do grupo e UMA SO — senao o "e das outras?" do segundo a
     * falar chegaria sem o assunto do primeiro, dentro de uma conversa que
     * ele acabou de ler na tela. */
    it('a memória da conversa é do GRUPO, não de cada pessoa', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      await useCase.execute(grupo(true));

      expect(canalGestao.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          conversaId: 'grupo:120363111111111111@g.us',
          // O escopo continua sendo de QUEM MENCIONOU.
          usuarioId: 'ad-1',
          role: 'ADMIN',
        }),
      );
    });

    /*
     * O caso que o primeiro teste do Lucas pegou, em 30/09: ele mandou a
     * pergunta numa mensagem e a mencao na seguinte. Sozinha, a mencao vira
     * texto vazio depois da limpeza — e vazio ia calado para o modelo.
     */
    it('menção sozinha numa sala vazia pede o que a pessoa precisa', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({ ...grupo(true), texto: '' });

      expect(r.motivo).toBe('grupo_mencao_sem_pergunta');
      expect(r.resposta).toContain('Me diz o que você precisa');
      // Canja: nao paga uma chamada ao modelo para descobrir que nao ha
      // pergunta.
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    /* E o default-deny vale tambem aqui: mencao sozinha de quem nao tem
     * cadastro nao pode revelar que ha uma agente escutando. */
    it('menção sozinha de quem não tem cadastro continua no silêncio', async () => {
      identificarAdmin.execute.mockResolvedValue(null);

      const r = await useCase.execute({ ...grupo(true), texto: '' });

      expect(r.resposta).toBeNull();
      expect(r.motivo).toBe('ignorado_remetente_desconhecido');
    });

    /*
     * ESTE E O PEDIDO DO LUCAS em 30/09: "voce nao esta lendo o contexto da
     * conversa, da para saber o que quer". Com a sala ouvida, a mencao
     * sozinha depois de uma pergunta deixa de ser um beco.
     */
    describe('ouvindo a sala', () => {
      const comNome = (mencionada: boolean, texto: string, extra = {}) => {
        const base = grupo(mencionada);
        return {
          ...base,
          texto,
          grupo: { ...base.grupo, autorNome: 'Lucas', ...extra },
        };
      };

      it('guarda a mensagem SEM menção, e continua sem responder', async () => {
        const r = await useCase.execute(
          comNome(false, 'qual o faturamento da semana?'),
        );

        expect(r.resposta).toBeNull();
        expect(canalGestao.execute).not.toHaveBeenCalled();
      });

      it('e depois a menção sozinha responde AO QUE FICOU PENDENTE', async () => {
        identificarAdmin.execute.mockResolvedValue(ADMIN);

        await useCase.execute(comNome(false, 'qual o faturamento da semana?'));
        const r = await useCase.execute(comNome(true, ''));

        // Deixou de ser a frase de canja: agora ela tem o que ler.
        expect(r.motivo).not.toBe('grupo_mencao_sem_pergunta');
        expect(canalGestao.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            contexto: ['Lucas: qual o faturamento da semana?'],
          }),
        );
      });

      /* A mensagem que acabou de chegar ja viaja como a pergunta — no
       * contexto ela apareceria duas vezes. */
      it('a mensagem que chegou não se repete no contexto', async () => {
        identificarAdmin.execute.mockResolvedValue(ADMIN);

        await useCase.execute(comNome(false, 'primeira'));
        await useCase.execute(comNome(true, 'e das outras?'));

        expect(canalGestao.execute).toHaveBeenCalledWith(
          expect.objectContaining({ contexto: ['Lucas: primeira'] }),
        );
      });

      /* A mira: responder citando uma mensagem diz exatamente a qual. */
      it('a mensagem CITADA abre o contexto', async () => {
        identificarAdmin.execute.mockResolvedValue(ADMIN);

        await useCase.execute(comNome(false, 'linha antiga'));
        await useCase.execute(
          comNome(true, 'resolve isso', { citada: 'o pedido da Marina' }),
        );

        expect(canalGestao.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            contexto: [
              '(respondendo a) o pedido da Marina',
              'Lucas: linha antiga',
            ],
          }),
        );
      });

      it('no privado não há sala nenhuma para ouvir', async () => {
        identificarAdmin.execute.mockResolvedValue(ADMIN);

        await useCase.execute({
          de: '558586467241@c.us',
          texto: 'qual o faturamento da semana?',
        });

        expect(canalGestao.execute).toHaveBeenCalledWith(
          expect.not.objectContaining({ contexto: expect.anything() }),
        );
      });
    });

    it('no privado não há `conversaId` — nada mudou para a conversa direta', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'qual o faturamento da semana?',
      });

      expect(canalGestao.execute).toHaveBeenCalledWith(
        expect.not.objectContaining({ conversaId: expect.anything() }),
      );
    });
  });

  /**
   * ======================================================================
   * A GESTAO PASSOU A SER CONSULTADA TAMBEM — 07/10/2026.
   *
   * Ate aqui a pergunta de gestao so era feita quando a de vendedora
   * falhava, e o teste guardava essa ordem. A regra mudou por decisao do
   * Lucas: a Nathalia e gerente de vendas E vendedora, com UM numero — o da
   * Helena. Parando na primeira resposta, metade do trabalho dela ficava
   * sem canal.
   *
   * O QUE O TESTE GUARDA AGORA e o que nao pode mudar: a vendedora continua
   * sendo atendida pela Helena, e nao pela gestao. Acumular ferramentas e
   * uma coisa; trocar de canal e outra, e essa continua proibida.
   * ======================================================================
   */
  it('vendedora vai para a Elena, mesmo tendo login de gestao', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'minha agenda?',
    });

    expect(r.resposta).toBe('da elena');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('quem e VENDEDORA e tambem tem login continua na Elena', async () => {
    // O caso que a ordem existe para resolver.
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    // COM CONTEUDO, e nao "oi": desde 15/09/2026 a saudacao sozinha e
    // respondida pela recepcao, e o que este teste protege e o DESTINO de
    // quem tem os dois papeis. A saudacao dela tem teste proprio, mais abaixo.
    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'como estão minhas vendas?',
    });

    expect(r.resposta).toBe('da elena');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('gestao vai para a Anastasia, com o nome de quem escreveu', async () => {
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'agenda da Marina?',
    });

    expect(r.resposta).toBe('da anastasia');
    expect(canalGestao.execute).toHaveBeenCalledWith({
      usuarioId: 'ad-1',
      nome: 'Lucas Barbosa',
      role: 'ADMIN',
      texto: 'agenda da Marina?',
    });
    expect(canalVendedora.execute).not.toHaveBeenCalled();
  });

  it('desconhecido: silencio, sem LLM nenhum', async () => {
    const r = await useCase.execute({ de: '5511999999999@c.us', texto: 'oi' });

    expect(r.resposta).toBeNull();
    expect(r.motivo).toBe('ignorado_remetente_desconhecido');
    expect(canalVendedora.execute).not.toHaveBeenCalled();
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('audio de desconhecido nao baixa nem transcreve — custo zero', async () => {
    const r = await useCase.execute({
      de: '5511999999999@c.us',
      texto: '',
      audio: AUDIO,
    });

    expect(r.resposta).toBeNull();
    expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
    expect(transcricao.transcrever).not.toHaveBeenCalled();
  });

  it('audio da gestao vira texto e chega a Anastasia como se fosse digitado', async () => {
    identificarAdmin.execute.mockResolvedValue(ADMIN);
    whatsapp.baixarMidia.mockResolvedValue({
      conteudo: Buffer.from('ogg'),
      mimetype: 'audio/ogg',
    });
    transcricao.transcrever.mockResolvedValue('como foi a semana da equipe?');

    await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

    expect(canalGestao.execute).toHaveBeenCalledWith({
      usuarioId: 'ad-1',
      nome: 'Lucas Barbosa',
      role: 'ADMIN',
      texto: 'como foi a semana da equipe?',
    });
  });

  it('audio da vendedora tambem vira texto antes de despachar', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);
    whatsapp.baixarMidia.mockResolvedValue({
      conteudo: Buffer.from('ogg'),
      mimetype: 'audio/ogg',
    });
    transcricao.transcrever.mockResolvedValue('minha agenda hoje?');

    await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

    expect(canalVendedora.execute).toHaveBeenCalledWith({
      de: '558586467241@c.us',
      texto: 'minha agenda hoje?',
    });
  });

  /**
   * ========================================================================
   * O ARQUIVO QUE A GESTAO MANDA — RF9, 08/10/2026.
   *
   * O alinhamento de 07/10 pediu que ela pudesse mandar planilha e PDF para
   * analise. Medido no mesmo dia: documento chegava e era DESCARTADO na
   * borda, de proposito — nao era a agente nao entender, o arquivo nao
   * passava da porta.
   *
   * AQUI SE PROVA A ORDEM: baixar e ler custa, e acontece depois do
   * reconhecimento. E a estrutura chega ROTULADA, para a agente nao citar
   * numero de arquivo como numero do sistema.
   * ========================================================================
   */
  describe('documento (RF9)', () => {
    const DOC = {
      url: 'http://waha:3000/api/files/default/x.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      nome: 'Posicao de estoque.xlsx',
    };

    function arquivoChega() {
      whatsapp.baixarMidia.mockResolvedValue({
        conteudo: Buffer.from('xlsx'),
        mimetype: DOC.mimetype,
      });
      leitor.ler.mockResolvedValue({ texto: 'Codigo | Valor\nAN1 | 100' });
      analise.analisar.mockResolvedValue({
        resumo: 'Posição de estoque, 2 colunas, 1 linha. Total R$ 100.',
      });
    }

    /* ESTE É O TESTE. O resto é contorno. */
    it('a gestão manda planilha e a estrutura chega à Anastasia, rotulada', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);
      arquivoChega();

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'qual o markup disso?',
        documento: DOC,
      });

      const enviado = canalGestao.execute.mock.calls[0][0] as { texto: string };
      // A pergunta dela primeiro...
      expect(enviado.texto.indexOf('markup')).toBeLessThan(
        enviado.texto.indexOf('Total R$ 100'),
      );
      // ...e a estrutura DIZ que é do arquivo. Sem o rótulo, a agente trataria
      // as linhas do relatório como coisa que ela mesma sabe.
      expect(enviado.texto).toMatch(/NAO e dado do sistema/i);
      expect(enviado.texto).toContain('Total R$ 100');
    });

    it('o nome do arquivo vai ao leitor — é a pista de tipo quando o mime não ajuda', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);
      arquivoChega();

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'x',
        documento: { ...DOC, mimetype: 'application/octet-stream' },
      });

      expect(leitor.ler).toHaveBeenCalledWith(
        expect.objectContaining({ nome: 'Posicao de estoque.xlsx' }),
      );
    });

    /**
     * A VENDEDORA NAO MANDA ARQUIVO, e ouve isso. Silencio foi o defeito do
     * audio em 21/08: quem mandava nao recebia resposta nenhuma e nem sabia
     * por que.
     */
    it('vendedora que manda arquivo ouve que não dá — e nenhum canal é chamado', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'olha essa planilha',
        documento: DOC,
      });

      expect(r.motivo).toBe('documento_sem_permissao');
      expect(r.resposta).toMatch(/não consigo ler arquivo/i);
      expect(canalVendedora.execute).not.toHaveBeenCalled();
      expect(canalGestao.execute).not.toHaveBeenCalled();
      // E NAO GASTOU NADA: nem download, nem leitura, nem chamada ao modelo.
      expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
      expect(leitor.ler).not.toHaveBeenCalled();
      expect(analise.analisar).not.toHaveBeenCalled();
    });

    it('download que falha vira frase, não silêncio', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);
      whatsapp.baixarMidia.mockResolvedValue(null);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'olha isso',
        documento: DOC,
      });

      expect(r.motivo).toBe('documento_download_falhou');
      expect(r.resposta).toMatch(/não consegui baixá-lo/i);
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('arquivo sem URL nem tenta baixar', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'olha isso',
        documento: { ...DOC, url: null },
      });

      expect(r.motivo).toBe('documento_sem_arquivo');
      expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
    });

    it('arquivo que não dá para ler: ela ouve o motivo do leitor', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);
      whatsapp.baixarMidia.mockResolvedValue({
        conteudo: Buffer.from('x'),
        mimetype: 'application/zip',
      });
      leitor.ler.mockResolvedValue({
        aviso: 'Esse arquivo chegou como application/zip e eu nao consigo ler.',
      });
      analise.analisar.mockResolvedValue({
        falha: 'Esse arquivo chegou como application/zip e eu nao consigo ler.',
      });

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'olha isso',
        documento: { ...DOC, mimetype: 'application/zip' },
      });

      expect(r.motivo).toBe('documento_nao_lido');
      expect(r.resposta).toContain('application/zip');
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('arquivo sem legenda: a agente recebe o pedido de dizer o que há nele', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);
      arquivoChega();

      await useCase.execute({
        de: '558586467241@c.us',
        texto: '',
        documento: DOC,
      });

      const enviado = canalGestao.execute.mock.calls[0][0] as { texto: string };
      expect(enviado.texto).toMatch(/o que há neste arquivo/i);
    });
  });

  it('audio longo demais e recusado ANTES de baixar', async () => {
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: '',
      audio: { ...AUDIO, segundos: 600 },
    });

    expect(whatsapp.baixarMidia).not.toHaveBeenCalled();
    expect(r.motivo).toBe('audio_nao_entendido');
    expect(r.resposta).toContain('escrito');
  });

  it('texto digitado tem precedencia sobre audio', async () => {
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    await useCase.execute({
      de: '558586467241@c.us',
      texto: 'oi',
      audio: AUDIO,
    });

    expect(transcricao.transcrever).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Aprovacao da foto tratada
  // -------------------------------------------------------------------------

  it('com foto esperando aprovacao, o "aprovo" precede os dois agentes', async () => {
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue({
      resposta: 'BR26252 aprovada',
      motivo: 'foto_aprovada',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'aprovo',
    });

    expect(r.motivo).toBe('foto_aprovada');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('texto que nao era aprovacao volta para a Anastasia', async () => {
    // A invariante: `null` do canal de catalogo significa "nao era comigo".
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue(null);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'quanto vendi hoje?',
    });

    expect(r.resposta).toBe('da anastasia');
  });

  it('a catraca da aprovacao nao inverte a ordem: vendedora continua primeiro', async () => {
    // Sem nada pendente, "aprovo" de vendedora nao vira aprovacao de
    // catalogo — e o que impede vendedora com login de cair no canal amplo.
    //
    // A CONSULTA DE ADMIN DEIXOU DE SER PROIBIDA aqui em 07/10/2026: ela
    // passou a acontecer sempre, para quem acumula os dois papeis receber
    // os dois conjuntos. O que o teste guarda e o DESTINO, que nao mudou.
    identificarVendedora.execute.mockResolvedValue(VENDEDORA);

    await useCase.execute({ de: '558586467241@c.us', texto: 'aprovo' });

    expect(canalCatalogo.aprovacao).not.toHaveBeenCalled();
    expect(canalVendedora.execute).toHaveBeenCalled();
  });

  it('o codigo da peca precede os agentes, e nao vira pergunta de vendas', async () => {
    // O caso real de 01/09: a confirmação da foto convidava a mandar o código,
    // e o "BR26252" caía na Anastasia — que respondia que o código não dizia
    // nada sozinho.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    canalCatalogo.codigo.mockResolvedValue({
      resposta: 'BR26252 · BRINCO RUBI',
      motivo: 'codigo_anotado',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'Br26252',
    });

    expect(r.motivo).toBe('codigo_anotado');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('a descricao da peca vira lista, e nao pergunta para a Anastasia', async () => {
    // Quem esta com a peca na mao nem sempre tem o codigo a vista.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    canalCatalogo.buscarPeca.mockResolvedValue({
      resposta: 'Achei 2. Qual delas?',
      motivo: 'busca_com_opcoes',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'anel de esmeralda ouro branco',
    });

    expect(r.motivo).toBe('busca_com_opcoes');
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('a busca e a ULTIMA a olhar: o `aprovo` nao vira termo de busca', async () => {
    // A ordem e o que torna a busca segura. Invertida, um "aprovo" com foto
    // esperando codigo seria procurado no catalogo de produtos.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue({
      resposta: 'BR26252 aprovada.',
      motivo: 'foto_aprovada',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'aprovo',
    });

    expect(r.motivo).toBe('foto_aprovada');
    expect(canalCatalogo.buscarPeca).not.toHaveBeenCalled();
  });

  // 16/09/2026: os creditos da OpenAI acabaram e a foto ficou sem tratar. A
  // mensagem manda responder "tenta de novo" — e o texto tem de chegar ao
  // canal do catalogo mesmo sem codigo nem aprovacao pendurados.
  it('com foto que a IA nao tratou, "tenta de novo" refaz — e nao vai para a Anastasia', async () => {
    canalCatalogo.temFotoComFalha.mockReturnValue(true);
    canalCatalogo.tentarDeNovo.mockResolvedValue({
      resposta: 'Tentando de novo — te mando em instantes.',
      motivo: 'foto_refazendo',
    });
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'tenta de novo',
    });

    expect(r.motivo).toBe('foto_refazendo');
    expect(canalCatalogo.aprovacao).not.toHaveBeenCalled();
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });

  it('com foto que falhou, outro texto segue o caminho de sempre', async () => {
    canalCatalogo.temFotoComFalha.mockReturnValue(true);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'quanto vendi hoje?',
    });

    expect(canalCatalogo.tentarDeNovo).toHaveBeenCalled();
    expect(r.resposta).toBe('da anastasia');
  });

  it('texto que nao era busca nem veredito segue para a Anastasia', async () => {
    // A borda oposta, e a mais cara: engolir a pergunta dela faz a duvida
    // morrer sem nunca chegar a quem responde.
    canalCatalogo.temCodigoEsperando.mockReturnValue(true);
    identificarAdmin.execute.mockResolvedValue(ADMIN);

    const r = await useCase.execute({
      de: '558586467241@c.us',
      texto: 'quanto vendi hoje?',
    });

    expect(canalCatalogo.buscarPeca).toHaveBeenCalled();
    expect(r.resposta).toBe('da anastasia');
  });

  it('o audio e transcrito UMA vez, mesmo passando pelo ramo do catalogo', async () => {
    // O ramo do catalogo resolve o texto; se ele nao guardasse o resultado, a
    // Anastasia mandaria transcrever de novo — e a chamada e paga.
    canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
    canalCatalogo.aprovacao.mockResolvedValue(null);
    identificarAdmin.execute.mockResolvedValue(ADMIN);
    whatsapp.baixarMidia.mockResolvedValue({
      conteudo: Buffer.from('ogg'),
      mimetype: 'audio/ogg',
    });
    transcricao.transcrever.mockResolvedValue('quanto vendi hoje?');

    await useCase.execute({ de: '558586467241@c.us', texto: '', audio: AUDIO });

    expect(transcricao.transcrever).toHaveBeenCalledTimes(1);
    expect(canalGestao.execute).toHaveBeenCalledWith(
      expect.objectContaining({ texto: 'quanto vendi hoje?' }),
    );
  });

  /**
   * O PRINT DO YERLON, 10/09/2026 — HML-16.
   *
   * Tres frases dele cairam na Anastasia, e nenhuma era para ela: a intencao
   * ("Quero adicionar fotos ao catálogo #0001"), o recibo ("Ok") e a
   * aprovacao ("Aprova"). Decisao do Lucas em 11/09: em qualquer ordem.
   */
  describe('em qualquer ordem — o print do Yerlon', () => {
    const ADM_COM_CATALOGO = () =>
      identificarAdmin.execute.mockResolvedValue(ADMIN);

    it('a intencao do ADM vai para o catalogo, e nao para a Anastasia', async () => {
      ADM_COM_CATALOGO();
      canalCatalogo.falaDeMandarFoto.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'Quero adicionar fotos ao catálogo #0001',
      });

      expect(r.motivo).toBe('catalogo_intencao');
      expect(canalCatalogo.intencao).toHaveBeenCalledWith(
        '558586467241@c.us',
        'Quero adicionar fotos ao catálogo #0001',
      );
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('ADM SEM permissao de catalogo continua na Anastasia', async () => {
      // A permissao e conferida de novo, e com a de catalogo: ser ADM de
      // gestao nao basta para abrir a conversa de fotos.
      identificarAdmin.execute.mockImplementation(
        (_tel: string, permissao?: string) =>
          Promise.resolve(permissao === 'catalogo:write' ? null : ADMIN),
      );
      canalCatalogo.falaDeMandarFoto.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'Quero adicionar fotos ao catálogo',
      });

      expect(r.resposta).toBe('da anastasia');
      expect(canalCatalogo.intencao).not.toHaveBeenCalled();
    });

    it('a VENDEDORA que fala de foto continua na Elena', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);
      canalCatalogo.falaDeMandarFoto.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'posso mandar foto do catálogo pra cliente?',
      });

      expect(r.resposta).toBe('da elena');
      expect(canalCatalogo.intencao).not.toHaveBeenCalled();
    });

    it('com a conversa aberta, o "Ok" e recibo e NAO chega na Anastasia', async () => {
      // 13:33 do print: "Ok" a "codigo anotado" voltou "Oi, Yerlon! Como
      // posso te ajudar?".
      ADM_COM_CATALOGO();
      canalCatalogo.conversaAberta.mockReturnValue(true);
      canalCatalogo.continuarConversa.mockResolvedValue({
        resposta: null,
        motivo: 'catalogo_recibo',
      });

      const r = await useCase.execute({ de: '558586467241@c.us', texto: 'Ok' });

      expect(r.resposta).toBeNull();
      expect(r.motivo).toBe('catalogo_recibo');
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('com a conversa aberta, pergunta de venda segue para a Anastasia', async () => {
      ADM_COM_CATALOGO();
      canalCatalogo.conversaAberta.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quanto vendi hoje?',
      });

      expect(canalCatalogo.continuarConversa).toHaveBeenCalled();
      expect(r.resposta).toBe('da anastasia');
    });

    it('o carimbo da mensagem chega a aprovacao — e o relogio dela', async () => {
      ADM_COM_CATALOGO();
      canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
      canalCatalogo.aprovacao.mockResolvedValue({
        resposta: 'AN24435 aprovada',
        motivo: 'foto_aprovada',
      });

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'Aprova',
        em: 1_757_521_640_000,
      });

      expect(canalCatalogo.aprovacao).toHaveBeenCalledWith(
        '558586467241@c.us',
        'Lucas Barbosa',
        'Aprova',
        1_757_521_640_000,
      );
    });
  });

  describe('quem cuida do catálogo tem casa', () => {
    const ESTOQUISTA = { id: 'ad-9', nome: 'Faby Rocha', role: 'ESTOQUISTA' };

    /** Reconhece só com a permissão de catálogo — nunca com a de gestão. */
    const soCatalogo = () =>
      identificarAdmin.execute.mockImplementation(
        (_tel: string, permissao?: string) =>
          Promise.resolve(permissao === 'catalogo:write' ? ESTOQUISTA : null),
      );

    it('texto do estoquista NÃO cai na triagem: vai para o canal do catálogo', async () => {
      // Até 03/09/2026 caía, e a Anastasia tentava qualificar a própria equipe
      // como cliente — o telefone do estoque virava lead na fila da gestão.
      soCatalogo();

      // O QUE ESTE TESTE PROTEGE E O DESVIO, e nao a resposta: a frase do
      // estoque nao pode virar lead na triagem. Desde 21/09/2026 a resposta
      // passou a ser o MENU — ate entao era a lista de catalogos abertos,
      // que respondia uma pergunta que ninguem tinha feito.
      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'preciso de uma ajuda com uma peça aqui',
      });

      expect(r.motivo).toBe('fora_do_escopo_menu');
      expect(r.resposta).toContain('foto com o código');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
      expect(canalGestao.execute).not.toHaveBeenCalled();
      expect(canalVendedora.execute).not.toHaveBeenCalled();
    });

    it('com foto pendurada, o texto solto LEMBRA da foto em vez de dar menu', async () => {
      // 21/09/2026: o Lucas escreveu "Ajuda traz o fundo branco como sempre"
      // logo depois de receber a foto tratada. Ele quis dizer "ajusta" — e
      // "ajuda", com D, nao esta (nem pode estar) na lista de ajuste. O menu
      // que ele recebeu nao mencionava a foto esperando.
      soCatalogo();
      canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
      canalCatalogo.aprovacao.mockResolvedValue(null);
      canalCatalogo.lembreteDaAprovacao.mockResolvedValue({
        resposta: 'Tem 1 foto esperando sua resposta: AN24361.',
        motivo: 'catalogo_lembrete_aprovacao',
      });

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'Ajuda traz o fundo branco como sempre',
      });

      expect(r.motivo).toBe('catalogo_lembrete_aprovacao');
      expect(r.resposta).toContain('AN24361');
      expect(canalCatalogo.lembreteDaAprovacao).toHaveBeenCalled();
    });

    it('sem nada pendurado, o lembrete devolve null e o menu assume', async () => {
      soCatalogo();
      canalCatalogo.temFotoEmAprovacao.mockReturnValue(true);
      canalCatalogo.aprovacao.mockResolvedValue(null);
      // A marca de memoria pode estar de pe sem foto nenhuma no banco — a
      // consulta e quem tem a verdade.
      canalCatalogo.lembreteDaAprovacao.mockResolvedValue(null);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'obrigado pessoal',
      });

      expect(r.motivo).toBe('fora_do_escopo_menu');
    });

    it('o ADMIN continua na Anastasia: a gestão vem ANTES do catálogo', async () => {
      // Ele tem as duas permissões. Invertida a ordem, o texto dele deixaria de
      // ser assunto da gestão — e a foto dele já ia para o catálogo pelo ramo
      // da imagem, que não muda.
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quanto vendi hoje?',
      });

      expect(r.resposta).toBe('da anastasia');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('desconhecido continua desconhecido', async () => {
      // A regressão que importa: abrir uma terceira porta não pode abrir a
      // primeira. Quem não é da casa segue sem resposta.
      const r = await useCase.execute({
        de: '558599990000@c.us',
        texto: 'oi',
      });

      expect(r.motivo).toBe('ignorado_remetente_desconhecido');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('o estoquista que diz que quer mandar foto abre a conversa', async () => {
      soCatalogo();
      canalCatalogo.falaDeMandarFoto.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'vou mandar as fotos do verão',
      });

      expect(r.motivo).toBe('catalogo_intencao');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('áudio do estoquista é transcrito — ele é da casa', async () => {
      soCatalogo();
      whatsapp.baixarMidia.mockResolvedValue({
        conteudo: Buffer.from('ogg'),
        mimetype: 'audio/ogg',
      });
      transcricao.transcrever.mockResolvedValue('preciso mandar umas fotos');

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: '',
        audio: AUDIO,
      });

      // O QUE IMPORTA AQUI E QUE O AUDIO VIROU TEXTO — a resposta em si e a
      // do chao do canal, que desde 21/09/2026 e o menu.
      expect(transcricao.transcrever).toHaveBeenCalled();
      expect(r.motivo).toBe('fora_do_escopo_menu');
    });

    // 16/09/2026, 10:37: "consultar peça", com o menu ja vencido, voltou a
    // lista de catalogos abertos.
    it('o estoquista que pede consulta NÃO recebe a lista de catálogos', async () => {
      soCatalogo();
      canalCatalogo.falaDeConsultar.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'consultar peça',
      });

      expect(r.motivo).toBe('catalogo_consulta_pedida');
      expect(canalCatalogo.consultarAgora).toHaveBeenCalledWith(
        '558586467241@c.us',
        'consultar peça',
      );
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('foto vence consulta: "vou mandar a foto da peça" abre a conversa de foto', async () => {
      soCatalogo();
      canalCatalogo.falaDeMandarFoto.mockReturnValue(true);
      canalCatalogo.falaDeConsultar.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'vou mandar a foto da peça',
      });

      expect(r.motivo).toBe('catalogo_intencao');
      expect(canalCatalogo.consultarAgora).not.toHaveBeenCalled();
    });
  });

  /**
   * A RECEPCAO — pedido do Lucas em 15/09/2026.
   *
   * O menu em si tem teste proprio (`recepcionar.use-case.spec.ts`). Aqui se
   * prova o ENCAIXE: a saudacao chega ate a recepcao, o numero vira o fluxo
   * certo, e nada disso atravessa uma conversa em curso.
   */
  describe('a recepção: a frase do perfil', () => {
    const ESTOQUISTA = { id: 'ad-9', nome: 'Faby Rocha', role: 'ESTOQUISTA' };
    const soCatalogo = () =>
      identificarAdmin.execute.mockImplementation(
        (_tel: string, permissao?: string) =>
          Promise.resolve(permissao === 'catalogo:write' ? ESTOQUISTA : null),
      );

    it('"Olá" do estoque recebe só o cumprimento — não a lista de catálogos', async () => {
      // O print do Lucas de 15/09: "Olá" respondia com os catálogos abertos e
      // o modo de usar. Continua não respondendo isso — e desde 28/09 também
      // não responde com o que ele PODE fazer: só cumprimenta.
      soCatalogo();

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'Olá',
      });

      expect(r.motivo).toBe('recepcao_saudacao');
      expect(r.resposta).toContain('Em que posso ajudar hoje?');
      expect(r.resposta).not.toContain('foto com o código');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
    });

    it('"ajuda" do estoque aí sim traz o que ele pode fazer', async () => {
      soCatalogo();

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'ajuda',
      });

      expect(r.motivo).toBe('recepcao_menu');
      expect(r.resposta).toContain('foto com o código');
    });

    it('"o que você faz?" da gestão traz a lista dela', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'o que você faz?',
      });

      expect(r.motivo).toBe('recepcao_menu');
      expect(r.resposta).toContain('vendas, metas, agenda e o funil');
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('a saudação da vendedora NÃO chega na Elena — nem paga uma chamada', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      const r = await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      expect(r.motivo).toBe('recepcao_saudacao');
      expect(canalVendedora.execute).not.toHaveBeenCalled();
    });

    it('a saudação da gestão não chega na Anastasia', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'bom dia',
      });

      expect(r.motivo).toBe('recepcao_saudacao');
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    /**
     * O MENU NUMERADO SAIU EM 28/09/2026 — pedido do Lucas, "mais natural,
     * sem essa pegada de chatbot".
     *
     * ====================================================================
     * O QUE ESTES DOIS TESTES PROTEGEM NAO E A AUSENCIA DO MENU. E que o
     * numero volte a ser TEXTO COMUM, seguindo o caminho de sempre.
     *
     * O risco de uma remocao pela metade era armar a escolha sem mostrar a
     * lista: aí um "2" digitado por outro motivo dispararia uma acao que
     * ninguem ofereceu. Aqui se prova que nao ha escolha armada — o numero
     * chega ao canal como o texto que a pessoa escreveu.
     * ====================================================================
     */
    it('o "1" da vendedora chega na Elena como texto, e não vira pergunta pronta', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);
      await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      await useCase.execute({ de: '558586467241@c.us', texto: '1' });

      expect(canalVendedora.execute).toHaveBeenCalledWith({
        de: '558586467241@c.us',
        texto: '1',
      });
    });

    it('o "1" do estoque não abre mais a conversa do catálogo sozinho', async () => {
      soCatalogo();
      await useCase.execute({ de: '558586467241@c.us', texto: 'oi' });

      const r = await useCase.execute({ de: '558586467241@c.us', texto: '1' });

      // Um "1" solto deixou de ser comando. Ele cai no fora-do-escopo, que
      // responde a MESMA frase — e é a resposta honesta: o canal não sabe o
      // que fazer com um número sozinho, e diz o que sabe fazer.
      expect(r.motivo).toBe('fora_do_escopo_menu');
      expect(r.resposta).toContain('foto com o código');
      expect(canalCatalogo.conversa).not.toHaveBeenCalled();
      expect(canalCatalogo.pedirConsulta).not.toHaveBeenCalled();
    });

    it('com foto esperando catálogo, "oi" segue o fluxo e não vira recepção', async () => {
      // A conversa em curso manda. Uma saudação no meio da classificação
      // faria a pessoa perder o que estava fazendo.
      soCatalogo();
      canalCatalogo.temFotoEsperando.mockReturnValue(true);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'oi',
      });

      expect(r.motivo).toBe('fotos_classificadas');
      expect(canalCatalogo.resposta).toHaveBeenCalled();
    });

    it('a saudação COM pergunta dentro segue para o agente, como antes', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'oi, como estão minhas vendas?',
      });

      expect(r.resposta).toBe('da elena');
      expect(canalVendedora.execute).toHaveBeenCalled();
    });
  });

  // ======================================================================
  // DOIS NUMEROS — 25/09/2026
  //
  // O desenho original sempre foi um numero por agente; so havia um chip para
  // testar. Com dois, o roteamento ganhou a segunda pergunta — PARA QUAL
  // NUMERO escreveu — e a decisao do Lucas foi a separacao estrita.
  //
  // O QUE ESTES TESTES PROTEGEM, e nesta ordem de gravidade:
  //
  //   1. SEM o segundo numero configurado, NADA MUDA. O campo `agente` chega
  //      `undefined` e o canal atende todo mundo, como sempre. Errar isto
  //      quebraria producao no dia do deploy, dias antes de o chip existir.
  //   2. Com dois, cada publico so e atendido no numero dele.
  //   3. Quem erra de numero e da CASA ouve para onde ir; quem nao e da casa
  //      continua sem saber que existe canal nenhum.
  // ======================================================================
  describe('dois numeros', () => {
    it('SEM agente (um numero so) a vendedora continua sendo atendida', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      const r = await useCase.execute({ de: '558586467241@c.us', texto: 'quantos contatos eu tenho hoje?' });

      expect(canalVendedora.execute).toHaveBeenCalled();
      expect(r.motivo).not.toContain('desvio');
    });

    it('SEM agente (um numero so) a gestao continua sendo atendida', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({ de: '558586467241@c.us', texto: 'quantos contatos eu tenho hoje?' });

      expect(canalGestao.execute).toHaveBeenCalled();
      expect(r.motivo).not.toContain('desvio');
    });

    it('vendedora no numero da Elena e atendida pela Elena', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ELENA',
      });

      expect(canalVendedora.execute).toHaveBeenCalled();
    });

    it('gestao no numero da Anastasia e atendida pela Anastasia', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ANASTASIA',
      });

      expect(canalGestao.execute).toHaveBeenCalled();
    });

    it('vendedora no numero da Anastasia ouve para onde ir — e nenhum agente responde', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ANASTASIA',
      });

      expect(r.motivo).toBe('desvio_para_elena');
      expect(r.resposta).toContain('Marina');
      expect(canalVendedora.execute).not.toHaveBeenCalled();
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    it('gestao no numero da Elena ouve para onde ir', async () => {
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'como foi a semana da equipe?',
        agente: 'ELENA',
      });

      expect(r.motivo).toBe('desvio_para_anastasia');
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    /* A frase so serve se disser QUAL e o numero — e ele vem do WAHA, e nao de
     * um env: trocou o chip, a frase acompanha. */
    it('a frase do desvio traz o numero do outro agente, formatado', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ANASTASIA',
      });

      expect(whatsapp.numeroDoAgente).toHaveBeenCalledWith('ELENA');
      expect(r.resposta).toContain('(85) 9849-0118');
    });

    /* WAHA fora do ar, sessao caida: desviar sem dizer para onde ainda e
     * melhor que calar — a pessoa ao menos sabe que errou de canal. */
    it('sem conseguir ler o numero, desvia mesmo assim', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);
      whatsapp.numeroDoAgente.mockResolvedValue(null);

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ANASTASIA',
      });

      expect(r.motivo).toBe('desvio_para_elena');
      expect(r.resposta).toContain('outro número');
    });

    /* O DESVIO E SO PARA QUEM E DA CASA. Dizer "me chama no outro numero" a um
     * desconhecido confirmaria que existe um segundo canal — e a regra do
     * default-deny e justamente que ele nao descubra nada. */
    it('desconhecido continua ouvindo silencio, nos dois numeros', async () => {
      for (const agente of ['ANASTASIA', 'ELENA'] as const) {
        const r = await useCase.execute({
          de: '5511999999999@c.us',
          texto: 'quantos contatos eu tenho hoje?',
          agente,
        });

        expect(r.resposta).toBeNull();
        expect(r.motivo).toBe('ignorado_remetente_desconhecido');
      }
    });

    /* Quem e vendedora E tem login de gestao era um empate resolvido pela
     * ORDEM das consultas (vendedora primeiro, deliberadamente). Com dois
     * numeros quem decide e a propria pessoa, pelo numero que procurou. */
    it('quem e as duas coisas e atendida pelo numero que escolheu', async () => {
      identificarVendedora.execute.mockResolvedValue(VENDEDORA);
      identificarAdmin.execute.mockResolvedValue(ADMIN);

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ANASTASIA',
      });
      expect(canalGestao.execute).toHaveBeenCalled();
      expect(canalVendedora.execute).not.toHaveBeenCalled();

      canalGestao.execute.mockClear();
      canalVendedora.execute.mockClear();

      await useCase.execute({
        de: '558586467241@c.us',
        texto: 'quantos contatos eu tenho hoje?',
        agente: 'ELENA',
      });
      expect(canalVendedora.execute).toHaveBeenCalled();
      expect(canalGestao.execute).not.toHaveBeenCalled();
    });

    /* O catalogo mora no numero da Elena. A foto que chega no da Anastasia
     * nao some calada: quem tem permissao ouve para onde levar. */
    it('foto no numero da Anastasia desvia em vez de ir para o catalogo', async () => {
      identificarAdmin.execute.mockResolvedValue({
        id: 'ad-9',
        nome: 'Yerlon Braga',
        role: 'ADMIN',
      });

      const r = await useCase.execute({
        de: '558586467241@c.us',
        texto: '0002',
        agente: 'ANASTASIA',
        imagem: { url: 'http://x/y.jpg', mimetype: 'image/jpeg' },
      });

      expect(r.motivo).toBe('desvio_para_elena');
      expect(canalCatalogo.foto).not.toHaveBeenCalled();
    });

    it('foto no numero da Elena segue para o catalogo, como sempre', async () => {
      identificarAdmin.execute.mockResolvedValue({
        id: 'ad-9',
        nome: 'Yerlon Braga',
        role: 'ADMIN',
      });

      await useCase.execute({
        de: '558586467241@c.us',
        texto: '0002',
        agente: 'ELENA',
        imagem: { url: 'http://x/y.jpg', mimetype: 'image/jpeg' },
      });

      expect(canalCatalogo.foto).toHaveBeenCalled();
    });
  });
});

/**
 * A CONVERSA DO PRINT, DE PONTA A PONTA — HML-16, 11/09/2026.
 *
 * Os testes de cima trocam o canal do catalogo por um dublê, e por isso nao
 * provam que o roteador e o canal CONVERSAM. Aqui os dois sao os de verdade,
 * com a sessao de verdade; so o banco, o armazenamento e o WhatsApp sao
 * simulados. A sequencia e a do Yerlon, na ordem em que ele falou.
 */
describe('RotearMensagemInternaUseCase — a conversa do Yerlon, de ponta a ponta', () => {
  const DE = '558585351045@c.us';
  const YERLON = { id: 'ad-7', nome: 'Yerlon Magalhães', role: 'ADMIN' };

  it('intencao, foto, "Ok" antes da foto tratada, "Aprova", codigo — e a Anastasia nunca e chamada', async () => {
    const fotoNoBanco = {
      id: 'f-1',
      catalogoId: 'uuid-1',
      codigoErp: null as string | null,
      remetente: YERLON.nome,
      arquivoOriginalId: 'catalogo/0001/originais/a.jpg',
      arquivoId: 'catalogo/0001/fotos/a.png',
      status: 'EM_APROVACAO',
    };

    const catalogos = {
      listarAbertos: jest.fn().mockResolvedValue([
        { id: 'uuid-1', numero: '0001', nome: 'Catalogo Rosa Pink' },
        { id: 'uuid-3', numero: '0003', nome: 'Verão 2027' },
      ]),
      listarEmAprovacao: jest.fn().mockResolvedValue([]),
      criarFoto: jest.fn().mockResolvedValue({ id: 'f-1' }),
      atualizarFoto: jest.fn().mockResolvedValue({ status: 'EM_APROVACAO' }),
    };
    const armazenamento = {
      guardar: jest.fn().mockResolvedValue('catalogo/pendentes/a.jpg'),
      mover: jest.fn().mockResolvedValue('catalogo/0001/originais/a.jpg'),
      ler: jest
        .fn()
        .mockResolvedValue({ conteudo: Buffer.from('png'), mime: 'image/png' }),
      remover: jest.fn(),
    };
    const produtos = {
      buscarCodigosPresentesEm: jest.fn().mockResolvedValue([]),
      findByCodigoErp: jest.fn().mockResolvedValue({
        descricaoEtiqueta: 'ANEL MASCULINO ESMERALDA OB 18K',
        valorVenda: 26990,
      }),
    };
    const whatsapp = {
      baixarMidia: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('jpg'),
        mimetype: 'image/jpeg',
      }),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
      enviarImagem: jest.fn().mockResolvedValue(undefined),
    };

    // O tratamento pela IA fica PRESO ate o teste soltar: e o intervalo em
    // que a foto ja existe e ainda nao chegou ao celular dele.
    let soltarTratamento: () => void = () => undefined;
    const tratar = {
      execute: jest.fn(
        () =>
          new Promise((resolve) => {
            soltarTratamento = () => {
              catalogos.listarEmAprovacao.mockResolvedValue([fotoNoBanco]);
              resolve({ foto: fotoNoBanco, recado: null });
            };
          }),
      ),
    };

    const canalCatalogo = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      armazenamento as never,
      produtos as never,
      whatsapp as never,
      new SessaoCatalogoService(),
      tratar as never,
      { execute: jest.fn().mockResolvedValue([]) } as never,
      CONFERENCIA_NULA,
    );
    const canalGestao = {
      execute: jest
        .fn()
        .mockResolvedValue({ resposta: 'da anastasia', motivo: 'conversa' }),
    };
    const roteador = new RotearMensagemInternaUseCase(
      { execute: jest.fn().mockResolvedValue(null) } as never,
      { execute: jest.fn().mockResolvedValue(YERLON) } as never,
      { execute: jest.fn() } as never,
      canalGestao as never,
      canalCatalogo,
      new RecepcionarUseCase(new RecepcaoService()),
      whatsapp as never,
      { transcrever: jest.fn(), disponivel: () => true },
      new MemoriaDeGrupoService(),
      { ler: jest.fn() } as never,
      { analisar: jest.fn() } as never,
    );
    const falar = (texto: string, extra: object = {}) =>
      roteador.execute({ de: DE, texto, em: Date.now(), ...extra });
    const esperarOsAssincronos = () =>
      new Promise((resolve) => setImmediate(resolve));

    // 16:42 — a intencao, com o numero.
    const intencao = await falar('Quero adicionar fotos ao catálogo #0001');
    expect(intencao.motivo).toBe('catalogo_intencao');
    expect(intencao.resposta).toContain('#0001');

    // 16:43 — a foto, sem legenda. NAO pergunta de novo o catalogo.
    const foto = await falar('', {
      imagem: { url: 'http://waha/files/a.jpg', mimetype: 'image/jpeg' },
    });
    expect(foto.motivo).toBe('foto_guardada');
    expect(foto.resposta).toContain('#0001');

    // 13:33 — "Ok" com a foto tratada AINDA A CAMINHO. E recibo: nao aprova,
    // e nao chega na Anastasia.
    const ok = await falar('Ok');
    expect(ok.resposta).toBeNull();
    expect(catalogos.atualizarFoto).not.toHaveBeenCalledWith(
      'f-1',
      expect.objectContaining({ status: 'APROVADA' }),
    );

    // A foto tratada chega ao celular.
    soltarTratamento();
    await esperarOsAssincronos();
    expect(whatsapp.enviarImagem).toHaveBeenCalled();

    // 13:34 — "Aprova", sem codigo ainda. A aprovacao fica guardada.
    const aprova = await falar('Aprova');
    expect(aprova.motivo).toBe('aprovacao_sem_codigo');

    // O codigo chega: anota e publica de uma vez, sem pedir "aprovo" de novo.
    const codigo = await falar('AN24435');
    expect(codigo.motivo).toBe('foto_aprovada');
    expect(codigo.resposta).toContain('já está no catálogo');
    expect(catalogos.atualizarFoto).toHaveBeenLastCalledWith(
      'f-1',
      expect.objectContaining({
        status: 'APROVADA',
        aprovadoPor: 'Yerlon Magalhães',
      }),
    );

    // E em nenhum momento a conversa caiu na Anastasia.
    expect(canalGestao.execute).not.toHaveBeenCalled();
  });
});

/**
 * A CONSULTA DO LUCAS, 16/09/2026 — de ponta a ponta, com o roteador e o canal
 * do catalogo REAIS.
 *
 * Pelo WhatsApp, com perfil de catalogo:
 *
 *   10:26  "2"                   abriu a consulta
 *   10:27  "Anel de diamente"    nao achou (erro de digitacao) e pediu outra
 *   10:27  "anel de esmeralda"   voltou a LISTA DE CATALOGOS — a espera tinha
 *                                sido apagada no "nao achei"
 *   10:37  "consultar peça"      voltou a LISTA DE CATALOGOS — menu vencido,
 *                                e o chao do canal nao entendia consulta
 *
 * O que este teste garante: pedido de consulta nunca mais vira lista de
 * catalogos.
 */
describe('RotearMensagemInternaUseCase — a consulta do Lucas, de ponta a ponta', () => {
  const DE = '558585490118@c.us';
  const UBIRAJARA = { id: 'ad-3', nome: 'Ubirajara', role: 'ESTOQUISTA' };

  const montar = () => {
    // A busca de verdade exige TODAS as palavras. O mock imita isso para o
    // que importa aqui: so acha com "anel" E "diamante", e registra o que foi
    // procurado para provar que as palavras do pedido sairam.
    const buscas: string[] = [];
    const listar = {
      execute: jest.fn((filtros: { busca?: string }) => {
        const busca = filtros.busca ?? '';
        buscas.push(busca);
        const achou = /anel/i.test(busca) && /diamante/i.test(busca);
        return Promise.resolve(
          achou
            ? [
                {
                  codigoErp: 'AN100',
                  descricaoEtiqueta: 'Anel Solitario Diamante',
                  valorVenda: 9800,
                  familia: 'ANEL',
                  categoria: 'JOIA',
                },
              ]
            : [],
        );
      }),
    };
    const catalogos = {
      listarAbertos: jest.fn().mockResolvedValue([
        { id: 'uuid-3', numero: '0003', nome: 'Verão 2027' },
      ]),
      listarEmAprovacao: jest.fn().mockResolvedValue([]),
    };

    // Armazenamento e WhatsApp entram dublados de verdade: o reenvio das
    // fotos penduradas passa por eles, e e o que prova que a imagem volta.
    const armazenamento = {
      ler: jest.fn().mockResolvedValue({
        conteudo: Buffer.from('png'),
        mime: 'image/png',
      }),
    };
    const whatsapp = { enviarImagem: jest.fn().mockResolvedValue(undefined) };

    const canalCatalogo = new ProcessarFotoCatalogoUseCase(
      catalogos as never,
      armazenamento as never,
      {
        findByCodigoErp: jest.fn().mockResolvedValue(null),
        buscarCodigosPresentesEm: jest.fn().mockResolvedValue([]),
      } as never,
      whatsapp as never,
      new SessaoCatalogoService(),
      {} as never,
      listar as never,
      CONFERENCIA_NULA,
    );
    const roteador = new RotearMensagemInternaUseCase(
      { execute: jest.fn().mockResolvedValue(null) } as never,
      {
        // Reconhece so com a permissao de catalogo — e estoquista, nao gestao.
        execute: jest.fn((_tel: string, permissao?: string) =>
          Promise.resolve(permissao === 'catalogo:write' ? UBIRAJARA : null),
        ),
      } as never,
      { execute: jest.fn() } as never,
      { execute: jest.fn() } as never,
      canalCatalogo,
      new RecepcionarUseCase(new RecepcaoService()),
      {} as never,
      { transcrever: jest.fn(), disponivel: () => true },
      new MemoriaDeGrupoService(),
      { ler: jest.fn() } as never,
      { analisar: jest.fn() } as never,
    );
    const falar = (texto: string) =>
      roteador.execute({ de: DE, texto, em: Date.now() });

    return { falar, buscas, catalogos, whatsapp };
  };

  it('"consultar peça" sem menu, nome errado, nome certo — e a lista vem', async () => {
    const { falar, catalogos } = montar();

    const pedido = await falar('consultar peça');
    expect(pedido.motivo).toBe('catalogo_consulta_pedida');
    expect(pedido.resposta).toContain('código da peça');

    const errado = await falar('Anel de diamente');
    expect(errado.motivo).toBe('consulta_sem_resultado');

    const certo = await falar('anel de diamante');
    expect(certo.motivo).toBe('consulta_por_descricao');
    expect(certo.resposta).toContain('AN100');

    // Em nenhum momento a lista de catalogos.
    expect(catalogos.listarAbertos).not.toHaveBeenCalled();
  });

  it('a pergunta direta ja procura, sem as palavras do pedido', async () => {
    const { falar, buscas, catalogos } = montar();

    const r = await falar('quanto custa o anel de diamante?');

    expect(r.motivo).toBe('consulta_por_descricao');
    expect(r.resposta).toContain('AN100');
    // "quanto" e "custa" nao estao em etiqueta nenhuma: procurados, zerariam
    // a busca.
    expect(buscas[buscas.length - 1]).not.toMatch(/quanto|custa|\?/);
    expect(catalogos.listarAbertos).not.toHaveBeenCalled();
  });

  it('depois do cumprimento, dizer o que precisa continua funcionando', async () => {
    // Era "com o menu na tela, dizer o que precisa funciona como o numero".
    // O menu saiu em 28/09, e o que este teste protege agora e o que sobrou —
    // e e o que sempre importou: NAO precisar de menu para pedir o que quer.
    const { falar, catalogos } = montar();

    const saudacao = await falar('oi');
    expect(saudacao.motivo).toBe('recepcao_saudacao');
    expect(saudacao.resposta).toContain('Em que posso ajudar hoje?');

    const r = await falar('quero consultar uma peça');
    expect(r.motivo).toBe('catalogo_consulta_pedida');
    expect(catalogos.listarAbertos).not.toHaveBeenCalled();
  });

  it('o que nao e deste canal recebe o MENU, e nao a lista de catalogos', async () => {
    // 21/09/2026: o Lucas, como estoquista, perguntou "qual minha carteira?"
    // e recebeu os quatro catalogos abertos. A lista era o CHAO — caia nela
    // tudo que as regras nao tratavam.
    const { falar, catalogos } = montar();

    const r = await falar('qual minha carteira?');

    expect(r.motivo).toBe('fora_do_escopo_menu');
    expect(r.resposta).toContain('foto com o código');
    expect(catalogos.listarAbertos).not.toHaveBeenCalled();
  });

  it('"tem foto em aberto?" lista o que espera E reenvia a imagem', async () => {
    // 21/09/2026, pedido do Lucas: "nao posso pedir para ver as fotos que
    // estao abertas?" — e "como vou saber qual e?", porque o codigo sozinho
    // nao diz qual peca e.
    const { falar, catalogos, whatsapp } = montar();
    catalogos.listarEmAprovacao.mockResolvedValue([
      { id: 'f1', codigoErp: 'AN24361', arquivoId: 'arq-1' },
    ]);

    const r = await falar('tem foto em aberto?');

    expect(r.motivo).toBe('catalogo_pendentes');
    expect(r.resposta).toContain('AN24361');
    expect(r.resposta).toContain('aqui embaixo');
    // O reenvio sai sem await — espera o proximo tique do laco de eventos.
    await new Promise((ok) => setImmediate(ok));
    expect(whatsapp.enviarImagem).toHaveBeenCalledTimes(1);
    expect(whatsapp.enviarImagem.mock.calls[0][3]).toContain('AN24361');
  });

  it('sem nada pendurado, a pergunta recebe um "nao tem" — e nao o menu', async () => {
    const { falar, whatsapp } = montar();

    const r = await falar('tem foto em aberto?');

    expect(r.motivo).toBe('catalogo_sem_pendentes');
    expect(whatsapp.enviarImagem).not.toHaveBeenCalled();
  });

  it('"tem foto para aprovar?" tambem e pergunta — a 1a versao errava nisso', async () => {
    // "aprovar" tinha ficado de fora da lista, com medo de "mandar foto para
    // aprovar". Quem separa as duas intencoes e o VERBO DE ENVIO, e nao a
    // palavra — foi a primeira frase que o Lucas tentou, e caiu no menu.
    const { falar, catalogos } = montar();
    catalogos.listarEmAprovacao.mockResolvedValue([
      { id: 'f1', codigoErp: 'AN24361', arquivoId: 'arq-1' },
    ]);

    const r = await falar('tem foto para aprovar?');

    expect(r.motivo).toBe('catalogo_pendentes');
    expect(r.resposta).toContain('AN24361');
  });

  it('"quero mandar foto para aprovar" continua sendo ENVIO', async () => {
    // O outro lado da mesma regra: com verbo de envio, e anuncio do que vai
    // fazer — mesmo dizendo "aprovar".
    const { falar, catalogos } = montar();
    catalogos.listarEmAprovacao.mockResolvedValue([
      { id: 'f1', codigoErp: 'AN24361', arquivoId: 'arq-1' },
    ]);

    const r = await falar('quero mandar foto para aprovar');

    expect(r.motivo).toBe('catalogo_intencao');
  });

  it('quem pergunta POR CATALOGO continua recebendo a lista', async () => {
    // A lista nao sumiu: ela deixou de ser o chao e virou resposta de quem
    // perguntou por ela.
    const { falar, catalogos } = montar();

    const r = await falar('quais catalogos estao abertos?');

    expect(r.motivo).toBe('catalogo_conversa');
    expect(catalogos.listarAbertos).toHaveBeenCalled();
  });
});
