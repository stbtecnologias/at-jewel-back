import { RotearMensagemInternaUseCase } from './rotear-mensagem-interna.use-case';
import { PromptDeImagemUseCase } from './prompt-de-imagem.use-case';
import { PromptDeImagemService } from '../prompt-de-imagem.service';
import { SessaoCatalogoService } from '../sessao-catalogo.service';

/**
 * O PROMPT DE IMAGEM PARA O MARKETING — 29/10/2026.
 *
 * ==========================================================================
 * O TESTE QUE MANDA NESTE ARQUIVO E O DA FOTO CRUA.
 *
 * Pergunta do Lucas ao aprovar o plano: *"se ele comecar enviando a imagem,
 * nao ja cai em catalogo?"*. Caia — e calada: com um catalogo LEMBRADO na
 * sessao, a foto nem passava pela pergunta "de qual catalogo e?".
 *
 * E a imagem nao ajuda a decidir. O packshot cru com massinha de apoio e o
 * MESMO nos dois casos — catalogo e prompt. So o que ele DISSE separa, e e
 * isso que estes testes fixam: a legenda, a mira, e o resgate de quem falou
 * depois.
 * ==========================================================================
 */

/** Um duble que responde `false` a qualquer pergunta. */
const naoParaTudo = () =>
  new Proxy({}, { get: () => jest.fn(() => false) }) as never;

/** O que o modelo devolve quando le a foto. Fixo, para a asserção ser exata. */
const PROMPT_EM_INGLES =
  'Professional high-end jewelry retouching of the attached photograph.\n\n' +
  'THE PIECE (keep design, angle and position identical)\n' +
  '- A two-stone ring with one white pear diamond and one pink pear diamond.';

const MARKETING = { id: 'ad-9', nome: 'Marketing', role: 'MARKETING' };
const FOTO = { url: 'https://waha/midia/1', mimetype: 'image/jpeg' };

describe('o prompt de imagem para o Marketing', () => {
  let llm: { chat: jest.Mock; chatComFerramentas: jest.Mock };
  let whatsapp: { baixarMidia: jest.Mock; [k: string]: unknown };
  let armazenamento: {
    ler: jest.Mock;
    remover: jest.Mock;
    guardar: jest.Mock;
  };
  let catalogos: { buscarFotoPorId: jest.Mock };
  let produtos: { findByCodigoErp: jest.Mock };
  let fotosDePeca: Record<string, jest.Mock>;
  let canalCatalogo: Record<string, jest.Mock>;
  let identificarAdmin: { execute: jest.Mock };

  let sessao: SessaoCatalogoService;
  let promptDeImagem: PromptDeImagemUseCase;
  let roteador: RotearMensagemInternaUseCase;

  beforeEach(() => {
    llm = {
      chat: jest.fn().mockResolvedValue({ texto: PROMPT_EM_INGLES }),
      chatComFerramentas: jest.fn(),
    };
    whatsapp = {
      baixarMidia: jest
        .fn()
        .mockResolvedValue({ conteudo: Buffer.from('bytes'), mimetype: 'image/jpeg' }),
      numeroDoAgente: jest.fn().mockResolvedValue('5585999999999'),
      lidDoAgente: jest.fn().mockResolvedValue(null),
      iniciarDigitando: jest.fn(),
      pararDigitando: jest.fn(),
    };
    armazenamento = {
      ler: jest.fn().mockResolvedValue(null),
      remover: jest.fn().mockResolvedValue(undefined),
      // A FOTO DO PROMPT PASSOU A SER GRAVADA — 09/11/2026. Ela espera a
      // pergunta do codigo na mesma area de espera do catalogo.
      guardar: jest.fn().mockResolvedValue('pendentes/prompt-1.jpg'),
    };
    catalogos = { buscarFotoPorId: jest.fn().mockResolvedValue(null) };
    produtos = { findByCodigoErp: jest.fn().mockResolvedValue(null) };
    // O canal de FOTO DE PECA (RF33) com espias de verdade: `pareceComando` e
    // `pareceSobreFotoDePeca` sao ESTATICOS e rodam para valer, entao o teste
    // da referencia no meio do pedido mede o roteamento real.
    fotosDePeca = {
      temPecaMirada: jest.fn(() => false),
      anexarPenduradas: jest.fn().mockResolvedValue(null),
      quais: jest.fn().mockResolvedValue(null),
      mirar: jest.fn().mockResolvedValue(null),
      pedido: jest.fn().mockResolvedValue(null),
      foto: jest.fn().mockResolvedValue(null),
    };

    sessao = new SessaoCatalogoService();

    promptDeImagem = new PromptDeImagemUseCase(
      sessao,
      new PromptDeImagemService(llm as never, { get: () => undefined } as never),
      whatsapp as never,
      armazenamento as never,
      catalogos as never,
      produtos as never,
    );

    // O CANAL DO CATALOGO CALADO: tudo que ele responde — "fala de catalogo?",
    // "tem foto esperando?", "a conversa esta aberta?" — da `false`, que e o
    // que deixa a mensagem seguir o caminho reto. `foto` e a ESPIA: o que se
    // mede neste arquivo e se a imagem chega nela ou nao.
    canalCatalogo = {
      foto: jest.fn().mockResolvedValue({
        resposta: 'foi para o catálogo',
        motivo: 'catalogo',
      }),
      // A outra ESPIA: `resposta` e quem leu "Nano Banana 2" como codigo.
      resposta: jest.fn().mockResolvedValue({
        resposta: 'Não achei esse catálogo.',
        motivo: 'catalogo_nao_reconhecido',
      }),
    };
    const canalComoDuble = new Proxy(canalCatalogo, {
      get: (alvo, nome: string) =>
        nome in alvo ? alvo[nome] : jest.fn(() => false),
    });

    // O MARKETING: nao tem a chave de gestao, tem a do catalogo. E assim que
    // ele e reconhecido no canal — medido no banco em 29/10.
    identificarAdmin = {
      execute: jest.fn((_tel: string, permissao?: string) =>
        Promise.resolve(permissao === 'catalogo:write' ? MARKETING : null),
      ),
    };

    roteador = new RotearMensagemInternaUseCase(
      { execute: jest.fn().mockResolvedValue(null) } as never,
      identificarAdmin as never,
      naoParaTudo(),
      naoParaTudo(),
      canalComoDuble as never,
      naoParaTudo(),
      whatsapp as never,
      { disponivel: () => false, transcrever: jest.fn() } as never,
      naoParaTudo(),
      naoParaTudo(),
      naoParaTudo(),
      fotosDePeca as never,
      promptDeImagem,
    );
  });

  const manda = (msg: { texto?: string; imagem?: typeof FOTO }) =>
    roteador.execute({
      de: '558599990000@c.us',
      texto: msg.texto ?? '',
      agente: 'ELENA',
      ...(msg.imagem ? { imagem: msg.imagem } : {}),
    } as never);

  // ---------------------------------------------------------------------------
  // ESTE E O TESTE. O resto e contorno.
  // ---------------------------------------------------------------------------

  describe('a foto crua, que e identica nos dois casos', () => {
    it('A SEQUENCIA DO TESTE DELE: foto nua, e so depois o pedido', async () => {
      // ====================================================================
      // ESTE TESTE NASCEU DE UM DEFEITO MEU, no teste dele de 29/10.
      //
      //   1. ele mandou a foto SEM legenda  -> catalogo, como projetado;
      //   2. a pergunta "de qual catalogo e?" ficou no ar;
      //   3. ele escreveu "Preciso de um prompt para o Nano Banana 2...".
      //
      // O texto nem chegava ao quinto caminho: o bloco da pergunta pendurada
      // o capturava 300 linhas antes e o lia como resposta — e anotava **o
      // codigo 2**, de "Nano Banana 2".
      //
      // Uma pergunta pendurada nao pode capturar texto de outro assunto.
      // ====================================================================
      canalCatalogo.temFotoEsperando = jest.fn(() => true);
      sessao.pendurar('558599990000@c.us', {
        arquivoId: 'arq-nua',
        mime: 'image/jpeg',
        codigoErp: null,
        parcelas: null,
      });
      armazenamento.ler.mockResolvedValue({
        conteudo: Buffer.from('bytes'),
        mime: 'image/jpeg',
      });

      const r = await manda({
        texto:
          'Preciso de um prompt para o Nano Banana 2 fazer o tratamento da ' +
          'imagem no padrão de catálogo de alta joalheria: fundo branco puro, ' +
          'remoção da massinha de apoio, sombra suave de contato.',
      });

      expect(canalCatalogo.resposta).not.toHaveBeenCalled();
      // A foto que estava pendurada e JUSTAMENTE a que o prompt usou.
      expect(armazenamento.ler).toHaveBeenCalledWith('arq-nua');
      // E sai da pasta de espera: recolhida, ela nunca venceria, e e a
      // varredura de vencidas que apaga os arquivos de `pendentes/`.
      expect(armazenamento.remover).toHaveBeenCalledWith('arq-nua');

      // DESDE 09/11/2026 O RESGATE TAMBEM PERGUNTA O CODIGO — a regra que ele
      // pediu vale nos dois caminhos, e nao so em `daFoto`. O prompt sai na
      // resposta.
      expect(r.resposta).toContain('De qual peça é essa?');
      const depois = await manda({ texto: 'não tem' });
      expect(depois.resposta).toBe(PROMPT_EM_INGLES);
    });

    /**
     * ========================================================================
     * ESTES DOIS TERMINAVAM NO PROMPT ATE 09/11/2026, e terminavam porque a
     * foto sem codigo era escrita na hora.
     *
     * O Lucas pediu a pergunta do codigo — *"queria que fosse também
     * solicitado o código da peça caso não mande"* —, entao a foto sem codigo
     * agora ESPERA. O que estes testes protegem nao mudou: ela nao cai no
     * catalogo. Mudou o que acontece com ela depois.
     * ========================================================================
     */
    it('com a mira armada, NAO cai no catalogo — a pergunta do Lucas', async () => {
      await manda({ texto: 'vou te mandar fotos para fazer o prompt' });

      const r = await manda({ imagem: FOTO });

      expect(canalCatalogo.foto).not.toHaveBeenCalled();
      expect(r.resposta).toContain('De qual peça é essa?');
    });

    it('com a legenda pedindo o prompt, NAO cai no catalogo', async () => {
      const r = await manda({ imagem: FOTO, texto: 'me faz o prompt dessa peça' });

      expect(canalCatalogo.foto).not.toHaveBeenCalled();
      expect(r.resposta).toContain('De qual peça é essa?');
    });

    it('com o codigo na legenda, o prompt sai DIRETO — o "ok" dele', async () => {
      // *"se mandar junto da foto.. ok"*. A pergunta so existe para quem nao
      // mandou; quem mandou nao e interrompido.
      const r = await manda({
        imagem: FOTO,
        texto: 'faz o prompt dessa, é o produto AN26406',
      });

      expect(r.resposta).toBe(PROMPT_EM_INGLES);
      expect(armazenamento.guardar).not.toHaveBeenCalled();
    });

    it('SEM mira e SEM legenda, continua indo para o catalogo', async () => {
      // O QUE FUNCIONA NAO SE MEXE. Quem fotografa manda foto nua o dia
      // inteiro, e o destino dela continua sendo o catalogo.
      const r = await manda({ imagem: FOTO });

      expect(canalCatalogo.foto).toHaveBeenCalled();
      expect(llm.chat).not.toHaveBeenCalled();
      expect(r.resposta).toBe('foi para o catálogo');
    });

    it('a mira vale para a RAJADA, porque so a 1a foto leva legenda', async () => {
      // Com o codigo em cada legenda nenhuma espera, e o que se mede aqui
      // continua sendo o destino das tres: as duas ultimas chegam NUAS e
      // mesmo assim nao voltam para o catalogo.
      await manda({ imagem: FOTO, texto: 'faz o prompt dessa, AN26406' });
      await manda({ imagem: FOTO, texto: 'AN26407' });
      await manda({ imagem: FOTO, texto: 'AN26408' });

      expect(canalCatalogo.foto).not.toHaveBeenCalled();
      expect(llm.chat).toHaveBeenCalledTimes(3);
    });

    /**
     * ========================================================================
     * A RAJADA SEM CODIGO PERGUNTA UMA VEZ SO — 09/11/2026.
     *
     * O custo que eu levantei no plano: dez fotos sem codigo dariam dez
     * perguntas, que e o que o catalogo faz ate hoje com "de qual catalogo e?".
     * Aqui da para fazer melhor, porque UMA resposta serve para a fila toda.
     * ========================================================================
     */
    it('a 2a e a 3a foto da rajada entram CALADAS, sem repetir a pergunta', async () => {
      await manda({ texto: 'vou te mandar fotos para fazer o prompt' });

      const primeira = await manda({ imagem: FOTO });
      const segunda = await manda({ imagem: FOTO });
      const terceira = await manda({ imagem: FOTO });

      expect(primeira.resposta).toContain('De qual peça é essa?');
      expect(segunda.resposta).toBeNull();
      expect(terceira.resposta).toBeNull();
      expect(armazenamento.guardar).toHaveBeenCalledTimes(3);
    });

    it('falar de catalogo DESARMA a mira — a foto seguinte volta a ser do catalogo', async () => {
      await manda({ texto: 'vou mandar para o prompt' });
      // Mudou de assunto. Sem o desarme, a mira de trinta minutos levaria
      // para o prompt a foto que ele esta pondo no catalogo agora.
      await manda({ texto: 'na verdade é para o catálogo 3' });

      await manda({ imagem: FOTO });

      expect(canalCatalogo.foto).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // O matcher: ele usa as palavras dos outros quatro caminhos
  // ---------------------------------------------------------------------------

  describe('o que e pedido de prompt, e o que nao e', () => {
    const pede = (t: string) => promptDeImagem.falaDePromptDeImagem(t);

    it('a palavra "prompt" basta', () => {
      expect(pede('me manda o prompt dessa foto')).toBe(true);
      expect(pede('preciso de um prompt para o Nano Banana')).toBe(true);
    });

    /**
     * ========================================================================
     * E ELA VEM DIGITADA ERRADO — teste dele, 09/11/2026.
     *
     * *"Faz o **promt** para mim dessa imagem"*, com a foto do anel de opala.
     * Uma letra, e o pedido inteiro foi para o catalogo: ele recebeu "de qual
     * catalogo é?" com a lista dos dois abertos.
     *
     * `prompt` e palavra inglesa com o encontro `mpt`, que o portugues nao
     * tem. Exigir a grafia exata e cobrar ortografia de quem esta trabalhando.
     * ========================================================================
     */
    it('"promt", "pronpt" e companhia TAMBEM pedem o prompt', () => {
      expect(pede('Faz o promt para mim dessa imagem')).toBe(true);
      expect(pede('me manda o pronpt')).toBe(true);
      expect(pede('preciso dos promts das duas')).toBe(true);
    });

    it('mas "pronto" NAO vira pedido de prompt', () => {
      // O `\b` final exige que a palavra acabe no `t`. "pronto" e o fim da
      // rajada (`RE_ENCERRAR`) — confundir os dois desarmaria o contrario.
      expect(pede('pronto')).toBe(false);
      expect(pede('prontos, pode parar')).toBe(false);
    });

    it('"tratar" sozinho NAO e prompt — e comando do catalogo desde o RF31', () => {
      expect(pede('trata essa foto')).toBe(false);
      expect(pede('pode tratar')).toBe(false);
    });

    it('"tratar" com sinal de saida em TEXTO e prompt', () => {
      expect(pede('trata essa foto e escreve em inglês')).toBe(true);
    });

    it('os quatro caminhos antigos nao viram prompt', () => {
      expect(pede('tem foto em aberto no catálogo?')).toBe(false);
      expect(pede('quero mandar foto para aprovar')).toBe(false);
      expect(pede('consultar peça')).toBe(false);
      expect(pede('quais catálogos estão abertos?')).toBe(false);
      expect(pede('qual minha carteira?')).toBe(false);
    });

    it('"manda a foto para o catálogo 3" nao vira prompt', () => {
      expect(pede('manda a foto para o catálogo 3')).toBe(false);
    });

    it('as respostas a TERCEIRA PORTA da pergunta sao entendidas', () => {
      // ====================================================================
      // A pergunta "de qual catálogo é?" passou a oferecer, em 29/10:
      //
      //   "Ou é para gerar o prompt de tratamento da imagem? Me diz que eu
      //    escrevo."
      //
      // SEM PALAVRA MAGICA, pela regra de 20/10 — entao o matcher tem de
      // aceitar as formas naturais de dizer sim a ela. Oferta que a resposta
      // nao casa e pior que oferta nenhuma.
      // ====================================================================
      expect(pede('prompt')).toBe(true);
      expect(pede('é para gerar o prompt')).toBe(true);
      expect(pede('o prompt de tratamento')).toBe(true);
      expect(pede('quero o prompt dessa imagem')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // A chamada
  // ---------------------------------------------------------------------------

  /**
   * O CODIGO NA LEGENDA EM TODOS DESTE BLOCO, desde 09/11/2026: sem ele a
   * foto PARA e espera a pergunta, e o que se mede aqui e a chamada — nao o
   * caminho ate ela. O `findByCodigoErp` segue devolvendo `null` por padrao,
   * entao a ficha continua fora e estes testes medem o mesmo de antes.
   */
  describe('a chamada que escreve o prompt', () => {
    it('NAO DECLARA FERRAMENTA — e isso que impede a injecao pelo audio', async () => {
      // ====================================================================
      // O MESMO SPEC DO `AnalisarArquivoService`, pelo mesmo motivo: o que
      // protege nao e a frase de aviso, e a AUSENCIA de ferramenta. O pedido
      // chega ditado por audio e transcrito sem ninguem ler.
      //
      // Se alguem trocar `chat` por `chatComFerramentas`, este teste quebra.
      // ====================================================================
      await manda({ imagem: FOTO, texto: 'faz o prompt, AN26406' });

      expect(llm.chat).toHaveBeenCalled();
      expect(llm.chatComFerramentas).not.toHaveBeenCalled();
    });

    it('a foto viaja na chamada, em base64', async () => {
      await manda({ imagem: FOTO, texto: 'faz o prompt, AN26406' });

      expect(llm.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          anexos: [
            expect.objectContaining({ tipo: 'imagem', mime: 'image/jpeg' }),
          ],
        }),
      );
    });

    it('a resposta e O PROMPT E NADA MAIS — ele vai copiar e colar', async () => {
      const r = await manda({ imagem: FOTO, texto: 'faz o prompt, AN26406' });

      expect(r.resposta).toBe(PROMPT_EM_INGLES);
    });

    it('foto sem joia: recusa explicada, e nao um prompt inventado', async () => {
      llm.chat.mockResolvedValue({ texto: 'NAO_HA_JOIA' });

      const r = await manda({ imagem: FOTO, texto: 'faz o prompt, AN26406' });

      expect(r.resposta).toContain('Não consegui ver uma joia');
    });

    it('o provedor fora do ar nao fecha o canal: resposta explicada', async () => {
      llm.chat.mockRejectedValue(new Error('timeout'));

      const r = await manda({ imagem: FOTO, texto: 'faz o prompt, AN26406' });

      expect(r.resposta).toContain('Não consegui escrever o prompt');
    });
  });

  // ---------------------------------------------------------------------------
  // A ficha do cadastro — pedido dele em 29/10
  // ---------------------------------------------------------------------------

  describe('a referencia junto da foto', () => {
    const PECA = {
      codigoErp: 'BR25077',
      // A etiqueta real da casa: traz a CONTAGEM das pedras, que a foto nao da.
      descricaoEtiqueta: 'BRINCO 222 DIAM 4.08 CTS 236 SAF AZ 10.90 CTS',
      cor: 'OB 18K',
      tipoPedra: null,
      familia: 'BRINCO',
      pesoGramas: 10.9,
      valorVenda: 180000,
      valorCusto: 60000,
      margemPercentual: 3,
    };

    const fichaEnviada = () =>
      (llm.chat.mock.calls[0][0] as { mensagens: { content: string }[] })
        .mensagens[0].content;

    it('leva a ficha do cadastro quando a referencia vem na legenda', async () => {
      produtos.findByCodigoErp.mockResolvedValue(PECA);

      await manda({ imagem: FOTO, texto: 'faz o prompt do BR25077' });

      expect(produtos.findByCodigoErp).toHaveBeenCalledWith('BR25077');
      const corpo = fichaEnviada();
      // O METAL por extenso — o maior ganho: `OB` sozinho nao e palavra.
      expect(corpo).toContain('ouro branco 18K');
      // A CONTAGEM das pedras, que sustenta `same number of stones`.
      expect(corpo).toContain('222 DIAM');
      expect(corpo).toContain('diamante');
      expect(corpo).toContain('safira');
    });

    it('PRECO, CUSTO E MARGEM nao viajam na chamada', async () => {
      produtos.findByCodigoErp.mockResolvedValue(PECA);

      await manda({ imagem: FOTO, texto: 'faz o prompt do BR25077' });

      const corpo = fichaEnviada();
      expect(corpo).not.toContain('180000');
      expect(corpo).not.toContain('60000');
      expect(corpo).not.toMatch(/margem/i);
    });

    it('referencia que nao existe nao impede o prompt — sai pela foto', async () => {
      produtos.findByCodigoErp.mockResolvedValue(null);

      const r = await manda({ imagem: FOTO, texto: 'faz o prompt do XX99999' });

      expect(r.resposta).toBe(PROMPT_EM_INGLES);
    });

    it('o cadastro fora do ar nao derruba o prompt', async () => {
      produtos.findByCodigoErp.mockRejectedValue(new Error('banco fora'));

      const r = await manda({ imagem: FOTO, texto: 'faz o prompt do BR25077' });

      expect(r.resposta).toBe(PROMPT_EM_INGLES);
    });

    it('A REFERENCIA NAO VAZA PARA A PROXIMA FOTO DA RAJADA', async () => {
      // ====================================================================
      // A peça 2 da rajada e OUTRA peça. Se a mira guardasse "faz o prompt do
      // BR25077", a segunda herdaria o cadastro da primeira — e a ficha e
      // justamente o que o modelo trata como VERDADE sobre pedra e metal.
      //
      // Ficha errada e PIOR que ficha nenhuma: sem ela o modelo escreve a cor
      // que ve; com ela, escreve com seguranca o nome errado.
      // ====================================================================
      produtos.findByCodigoErp.mockResolvedValue(PECA);

      await manda({ imagem: FOTO, texto: 'faz o prompt do BR25077' });
      produtos.findByCodigoErp.mockClear();

      await manda({ imagem: FOTO });

      expect(produtos.findByCodigoErp).not.toHaveBeenCalled();
    });

    it('A REFERENCIA DA LEGENDA DA FOTO NAO SE PERDE NO RESGATE', async () => {
      // ====================================================================
      // ACHADO NO TESTE DELE, 29/10, 16:15. Ele mandou a foto com a legenda
      // "o produto é AN26406"; a foto foi para o catálogo, que guardou esse
      // código na foto pendurada; e só depois ele pediu o prompt.
      //
      // O texto do pedido NAO tem a referência — ela ficou na mensagem
      // anterior. Sem isto, a ficha sumiria exatamente no caso em que ele se
      // deu ao trabalho de informá-la.
      // ====================================================================
      sessao.pendurar('558599990000@c.us', {
        arquivoId: 'arq-anel',
        mime: 'image/jpeg',
        codigoErp: 'AN26406',
        parcelas: null,
      });
      armazenamento.ler.mockResolvedValue({
        conteudo: Buffer.from('bytes'),
        mime: 'image/jpeg',
      });
      produtos.findByCodigoErp.mockResolvedValue(PECA);

      await manda({ texto: 'preciso de um prompt para o Nano Banana 2' });

      expect(produtos.findByCodigoErp).toHaveBeenCalledWith('AN26406');
      expect(fichaEnviada()).toContain('ouro branco 18K');
    });

    it('A REFERENCIA NO MEIO DO PEDIDO NAO MIRA A PECA', async () => {
      // ====================================================================
      // TESTE DELE, 29/10 as 16:56, e o defeito era de ORDEM outra vez.
      //
      //   "Preciso de um prompt para o Nano Banana 2 fazer o tratamento da
      //    imagem DO PRODUTO AN26406 no padrao de catalogo..."
      //
      // A frase diz "prompt" e "Nano Banana" — mas tambem diz "produto
      // AN26406", e o fluxo de FOTO DE PECA (RF33) procura exatamente isso.
      // Ele mirou a peca, respondeu "ela ainda nao tem foto nossa, manda as
      // fotos", e a foto seguinte entrou como foto da peca.
      //
      // A IRONIA: a referencia que ele pos para MELHORAR o prompt era o que
      // roubava o prompt.
      // ====================================================================
      produtos.findByCodigoErp.mockResolvedValue(PECA);

      const r = await manda({
        texto:
          'Preciso de um prompt para o Nano Banana 2 fazer o tratamento da ' +
          'imagem do produto AN26406 no padrão de catálogo de alta joalheria.',
      });

      expect(fotosDePeca.mirar).not.toHaveBeenCalled();
      expect(fotosDePeca.pedido).not.toHaveBeenCalled();
      // Sem foto ainda: arma a mira do prompt e pede a foto.
      expect(r.resposta).toContain('Pode mandar a foto');
      expect(promptDeImagem.temMira('558599990000@c.us')).toBe(true);
    });

    it('a ficha que nao bate com a foto e dita, e nao conciliada', async () => {
      produtos.findByCodigoErp.mockResolvedValue(PECA);
      llm.chat.mockResolvedValue({ texto: 'FICHA_NAO_BATE' });

      const r = await manda({ imagem: FOTO, texto: 'faz o prompt do BR25077' });

      expect(r.resposta).toContain('não bate com a foto');
    });
  });

  // ---------------------------------------------------------------------------
  // O resgate: ele mandou a foto ANTES de dizer para que era
  // ---------------------------------------------------------------------------

  describe('o resgate da foto que ja tinha entrado', () => {
    it('a foto pendurada no catalogo vira prompt quando ele pede em seguida', async () => {
      // A foto entrou e ficou esperando "de qual catálogo é?".
      sessao.pendurar('558599990000@c.us', {
        arquivoId: 'arq-1',
        mime: 'image/jpeg',
        codigoErp: null,
        parcelas: null,
      });
      armazenamento.ler.mockResolvedValue({
        conteudo: Buffer.from('bytes'),
        mime: 'image/jpeg',
      });

      // COM O CODIGO NO PEDIDO o resgate nao para — a pergunta de 09/11 so
      // existe para quem nao mandou.
      const r = await manda({ texto: 'faz o prompt dessa foto, AN26406' });

      expect(armazenamento.ler).toHaveBeenCalledWith('arq-1');
      expect(r.resposta).toBe(PROMPT_EM_INGLES);
    });

    it('resgate SEM codigo pergunta, e o prompt sai na resposta', async () => {
      // ====================================================================
      // ACHADO DE CARONA NO TESTE DO "promt", 09/11/2026: a regra do codigo
      // estava so em `daFoto`, e pela porta do resgate a foto saia direto.
      // Uma regra que vale em um caminho e dois comportamentos.
      // ====================================================================
      sessao.pendurar('558599990000@c.us', {
        arquivoId: 'arq-1',
        mime: 'image/jpeg',
        codigoErp: null,
        parcelas: null,
      });
      armazenamento.ler.mockResolvedValue({
        conteudo: Buffer.from('bytes'),
        mime: 'image/jpeg',
      });

      const pergunta = await manda({ texto: 'faz o prompt dessa foto' });
      expect(pergunta.resposta).toContain('De qual peça é essa?');
      expect(llm.chat).not.toHaveBeenCalled();

      const r = await manda({ texto: 'não tem' });
      expect(r.resposta).toBe(PROMPT_EM_INGLES);
    });

    it('a foto que JA virou linha de catalogo e lida de novo, e NAO apagada', async () => {
      // ====================================================================
      // NADA SE DESFAZ. Com catalogo lembrado, a foto crua ja entrou como
      // peca. Ela CONTINUA la — apagar por conta propria seria decidir por
      // ele. Se nao a queria no catalogo, tira pelo painel.
      // ====================================================================
      sessao.lembrarFotoGuardada('558599990000@c.us', 'foto-7', '#0004');
      catalogos.buscarFotoPorId.mockResolvedValue({
        id: 'foto-7',
        arquivoOriginalId: 'orig-7',
        arquivoId: 'tratada-7',
      });
      armazenamento.ler.mockResolvedValue({
        conteudo: Buffer.from('bytes'),
        mime: 'image/jpeg',
      });

      const r = await manda({ texto: 'faz o prompt dessa, AN26406' });

      // O ORIGINAL, e nao a versao tratada: o prompt descreve a peca como ela
      // saiu do celular.
      expect(armazenamento.ler).toHaveBeenCalledWith('orig-7');
      expect(r.resposta).toBe(PROMPT_EM_INGLES);
      // E ELA NAO E APAGADA — e a linha do catalogo, e nao uma foto de espera.
      expect(armazenamento.remover).not.toHaveBeenCalledWith('orig-7');
    });

    it('sem foto nenhuma, arma a mira e avisa que pode mandar', async () => {
      const r = await manda({ texto: 'quero um prompt' });

      expect(llm.chat).not.toHaveBeenCalled();
      expect(r.resposta).toContain('Pode mandar a foto');
      expect(promptDeImagem.temMira('558599990000@c.us')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // A PERGUNTA DO CODIGO — pedido dele em 09/11/2026
  // ---------------------------------------------------------------------------

  /**
   * ==========================================================================
   * *"Queria que fosse também solicitado o código da peça caso não mande. Se
   * mandar junto da foto.. ok."*
   *
   * A ficha do cadastro era um ganho que so acontecia quando ele lembrava — e
   * ela traz a CONTAGEM das pedras e o METAL, as duas coisas que a foto nao
   * diz e que o molde mais teme errar. Agora e perguntada.
   *
   * ELE ESCOLHEU A VERSAO QUE SEGURA: a foto espera a resposta, e o prompt so
   * sai depois. Com a valvula, porque nem toda peca fotografada tem cadastro.
   * ==========================================================================
   */
  describe('a pergunta do codigo, quando ele nao manda', () => {
    const DE = '558599990000@c.us';

    const guardada = () =>
      armazenamento.ler.mockResolvedValue({
        conteudo: Buffer.from('bytes'),
        mime: 'image/jpeg',
      });

    /* ESTE E O TESTE. */
    it('foto sem codigo: pergunta, e NAO escreve ainda', async () => {
      const r = await manda({ imagem: FOTO, texto: 'faz o prompt dessa' });

      expect(llm.chat).not.toHaveBeenCalled();
      expect(r.resposta).toContain('De qual peça é essa?');
      // A SAIDA VAI DENTRO DA PERGUNTA. Sem ela, quem nao tem o codigo fica
      // sem caminho — e a peca pode estar sendo fotografada antes de existir
      // no cadastro.
      expect(r.resposta).toContain('não tem');
    });

    it('o codigo respondido depois escreve o prompt COM a ficha', async () => {
      produtos.findByCodigoErp.mockResolvedValue({
        codigoErp: 'AN26406',
        descricaoEtiqueta: 'ANEL 222 DIAM 4.08 CTS',
        cor: 'OB 18K',
      });
      await manda({ imagem: FOTO, texto: 'faz o prompt dessa' });
      guardada();

      const r = await manda({ texto: 'AN26406' });

      expect(r.resposta).toBe(PROMPT_EM_INGLES);
      expect(produtos.findByCodigoErp).toHaveBeenCalledWith('AN26406');
      const conteudo = llm.chat.mock.calls[0][0].mensagens[0].content;
      expect(conteudo).toContain('4.08');
    });

    it('"não tem" escreve pela foto, e NAO pergunta de novo na janela', async () => {
      await manda({ imagem: FOTO, texto: 'faz o prompt dessa' });
      guardada();

      const primeira = await manda({ texto: 'não tem' });
      const segunda = await manda({ imagem: FOTO });

      expect(primeira.resposta).toBe(PROMPT_EM_INGLES);
      // A SEGUNDA FOTO NAO PARA MAIS: ele ja respondeu isto uma vez.
      expect(segunda.resposta).toBe(PROMPT_EM_INGLES);
      expect(produtos.findByCodigoErp).not.toHaveBeenCalled();
    });

    it('o arquivo da espera e APAGADO depois de lido — sem orfao', async () => {
      await manda({ imagem: FOTO, texto: 'faz o prompt dessa' });
      guardada();

      await manda({ texto: 'não tem' });

      expect(armazenamento.remover).toHaveBeenCalledWith(
        'pendentes/prompt-1.jpg',
      );
    });

    /**
     * ========================================================================
     * A TRAVA QUE SEPARA AS DUAS FILAS — e o defeito que ela evita.
     *
     * A foto do prompt espera na MESMA area do catalogo. Sem a marca
     * `paraPrompt`, um "2" respondendo "de qual catalogo é?" arrastaria a foto
     * do Marketing para dentro do catalogo, calada — e ele descobriria dias
     * depois, pela peca estranha no PDF.
     * ========================================================================
     */
    it('a foto do prompt NAO e recolhida por quem responde o catalogo', async () => {
      await manda({ imagem: FOTO, texto: 'faz o prompt dessa' });

      // O canal do catalogo so ve o que e dele — e nao ha nada dele.
      expect(promptDeImagem.temFotoDePromptEsperando(DE)).toBe(true);
      expect(sessao.recolherPendentes(DE, 'catalogo')).toHaveLength(0);
      expect(promptDeImagem.temFotoDePromptEsperando(DE)).toBe(true);
    });

    it('texto que NAO responde isto deixa a foto esperando, e segue o caminho', async () => {
      await manda({ imagem: FOTO, texto: 'faz o prompt dessa' });

      // "bom dia" nao e codigo nem e "não tem": a mensagem nao e desviada.
      await manda({ texto: 'bom dia' });

      expect(llm.chat).not.toHaveBeenCalled();
      expect(promptDeImagem.temFotoDePromptEsperando(DE)).toBe(true);
    });
  });
});
