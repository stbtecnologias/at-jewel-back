import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  PASTA_PENDENTES,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../../catalogos/domain/ports/injection-tokens';
import type { ICatalogoRepository } from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';
import type { AnexoDaConversa } from '../../../agentes/domain/ports/llm-client.port';
import { PromptDeImagemService } from '../prompt-de-imagem.service';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import {
  codigoDaPecaNoTexto,
  normalizarTextoDoCanal,
  semCodigoDaPeca,
  type ImagemInterna,
  type RespostaFoto,
} from './processar-foto-catalogo.use-case';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import { fichaDaPeca } from '../ficha-da-peca';

/**
 * O PROMPT DE IMAGEM PARA O MARKETING — 29/10/2026.
 *
 * ==========================================================================
 * O QUE ELE FAZIA A MAO, E O QUE MUDA.
 *
 * O Marketing escreve, em ingles, o prompt que ele cola na ferramenta de
 * imagem dele. O pedido que ele digita e generico — "tratamento de catalogo,
 * fundo branco, tirar a massinha" —, mas o prompt que sai descreve A PECA. A
 * diferenca entre os dois e o trabalho todo, e ela vem de OLHAR A FOTO.
 *
 * Agora ele manda a foto e o pedido em portugues — escrito ou por audio — e
 * recebe o prompt pronto para copiar.
 *
 * SO O PROMPT SAI. Decisao dele, repetida tres vezes: *"apenas o prompt. Nada
 * de foto."* Nenhuma imagem e gerada neste caminho.
 * ==========================================================================
 *
 * O QUINTO CAMINHO DO CANAL DO CATALOGO.
 *
 * Quem tem `catalogo:write` e nao tem a chave de gestao — estoque e marketing
 * — e atendido pelo canal do catalogo, que tinha quatro caminhos: fotos
 * pendentes, mandar foto, consultar peca e listar catalogos. Este e o quinto,
 * e e irmao deles: mesmo reconhecimento, mesma sessao, mesma forma de matcher.
 *
 * ==========================================================================
 * A FOTO CRUA NAO SE DISTINGUE DA FOTO DE CATALOGO — E DAI VEM O DESENHO.
 *
 * Pergunta do Lucas, em 29/10: *"se ele comecar enviando a imagem, nao ja cai
 * em catalogo?"*. Cairia — e pior do que parecia: com um catalogo LEMBRADO na
 * sessao (`catalogoAtual`), a foto crua nem passa pela pergunta "de qual
 * catalogo e?". Ela entra direto, calada.
 *
 * E a imagem nao ajuda a decidir: o packshot cru com massinha e o MESMO nos
 * dois casos. So o que ele diz separa. Entao sao tres portas, nesta ordem de
 * confianca:
 *
 *   1. A LEGENDA da foto pede o prompt            -> nunca toca no catalogo
 *   2. A MIRA esta armada ("vou mandar p/ prompt") -> nunca toca no catalogo
 *   3. O RESGATE: a foto ja entrou e ele pede em seguida
 *
 * O resgate existe porque a primeira foto do dia nao tem como ser adivinhada.
 * Ele NAO desfaz nada: a foto pendurada sai da fila de espera, e a foto que ja
 * virou linha de catalogo CONTINUA la — so e lida de novo para o prompt. Nao
 * existe caminho que apague trabalho dele.
 * ==========================================================================
 */

/** O que o canal responde quando a foto nao chega inteira. */
const NAO_BAIXOU =
  'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?';

/**
 * As palavras que pedem o PROMPT.
 *
 * "Prompt" e a palavra dele, e e inequivoca neste canal — ninguem pede
 * "prompt" falando de catalogo. As outras cobrem o jeito de falar: o nome da
 * ferramenta e as formas de "escreve o texto da IA".
 *
 * ==========================================================================
 * E ELA E DIGITADA ERRADO — teste dele, 09/11/2026.
 *
 * *"Faz o **promt** para mim dessa imagem"*, com a foto do anel de opala. A
 * frase nao foi reconhecida, a foto foi para o catalogo e ele recebeu "de qual
 * catalogo e?". Uma letra.
 *
 * E ERA PREVISIVEL: `prompt` e palavra INGLESA, com um encontro consonantal
 * que o portugues nao tem — `mpt`. Quem digita rapido come o `p` ou troca o
 * `m` pelo `n`. Exigir a grafia exata de uma palavra estrangeira e cobrar
 * ortografia de quem esta trabalhando.
 *
 * `pro[mn]p?ts?` aceita promt, prompt, pronpt, promts, prompts — e NAO aceita
 * "pronto", porque o `\b` final exige que a palavra acabe no `t`. Conferido
 * contra `RE_ENCERRAR`, que tem "pronto" e continua intacto.
 * ==========================================================================
 */
const RE_PROMPT =
  /\b(pro[mn]p?ts?|nano\s?banana|midjourney|comando\s+(da|pra|para)\s+ia)\b/;

/**
 * "Tratar a foto", "melhorar a imagem" — o pedido sem a palavra `prompt`.
 *
 * ==========================================================================
 * ESTE SOZINHO NAO BASTA, E A RAZAO E O OUTRO CAMINHO.
 *
 * Desde o RF31 a foto entra no catalogo CRUA e o tratamento virou pedido:
 * "trata essa foto" e comando legitimo do catalogo, com foto tratavel
 * pendurada. Se esta regex sozinha mandasse para o prompt, roubaria aquele
 * fluxo de quem fotografa.
 *
 * Entao ela so vale ACOMPANHADA de um sinal de texto/ingles/prompt — ou com a
 * mira ja armada, que e o Marketing dizendo para onde vao as fotos dele.
 * ==========================================================================
 */
const RE_TRATAR = /\b(tratar|trata|tratamento|retoque|retocar|melhorar)\b/;

/** O que diz que a saida e TEXTO, e nao imagem tratada. */
const RE_SAIDA_TEXTO =
  /\b(texto|ingles|english|escrever|escreve|escreva|gerar|gera|monta|montar)\b/;

/** "Chega", "pronto", "pode parar" — o fim da rajada de prompts. */
const RE_ENCERRAR = /\b(chega|acabou|terminei|pronto|parar|para\s+por\s+aqui)\b/;

/** Fala de catalogo: desarma a mira, porque mudou de assunto. */
const RE_CATALOGO = /\b(catalogo|catalogos)\b/;

/**
 * "NAO TEM CODIGO" — a resposta que dispensa a ficha, 09/11/2026.
 *
 * ==========================================================================
 * A PERGUNTA SO PODE EXISTIR COM UMA SAIDA, e esta e a saida.
 *
 * Nem toda peca fotografada tem cadastro: o Marketing trabalha material novo,
 * e a campanha costuma andar na frente do ERP. Uma pergunta sem resposta
 * possivel pararia o caminho inteiro para essas.
 *
 * E A RESPOSTA VALE PELA JANELA, nao por uma foto — ver `aceitarSemCodigo`.
 * ==========================================================================
 */
const RE_SEM_CODIGO =
  /\b(sem\s+codigo|nao\s+tem\s+codigo|nao\s+tem|nao\s+sei|pode\s+ir\s+sem|vai\s+sem|ir\s+sem|sem\s+ele|tanto\s+faz|nao\s+precisa)\b/;

/** O que a pergunta do codigo diz — uma frase, e com a saida dentro dela. */
const PERGUNTA_DO_CODIGO =
  'De qual peça é essa? Manda o código que eu uso a ficha do cadastro — ' +
  'ou diz que não tem, que eu escrevo pela foto.';

@Injectable()
export class PromptDeImagemUseCase {
  private readonly logger = new Logger(PromptDeImagemUseCase.name);

  constructor(
    private readonly sessao: SessaoCatalogoService,
    private readonly prompts: PromptDeImagemService,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(CATALOGO_REPOSITORY)
    private readonly catalogos: ICatalogoRepository,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Os testes de texto — so memoria e regex, como os quatro irmaos
  // ---------------------------------------------------------------------------

  /**
   * O texto pede um prompt de imagem?
   *
   * A PALAVRA `prompt` BASTA. O resto precisa de dois sinais — "tratar" mais
   * um sinal de que a saida e texto —, porque "trata essa foto" sozinho e
   * comando do CATALOGO desde o RF31. Ver `RE_TRATAR`.
   */
  falaDePromptDeImagem(texto: string): boolean {
    const n = normalizarTextoDoCanal(texto);
    if (RE_PROMPT.test(n)) return true;
    return RE_TRATAR.test(n) && RE_SAIDA_TEXTO.test(n);
  }

  /** Esta pessoa ja disse que as fotos dela sao para prompt? */
  temMira(de: string): boolean {
    return this.sessao.promptMirado(de) !== null;
  }

  /**
   * Ha foto dele esperando a pergunta do codigo? So memoria — ver o roteador.
   */
  temFotoDePromptEsperando(de: string): boolean {
    return this.sessao.temPendentes(de, 'prompt');
  }

  /**
   * O assunto mudou — desarma.
   *
   * CHAMADO PELO ROTEADOR quando outro caminho do canal venceu. Sem isto, a
   * mira armada de manha mandaria para o prompt a foto que ele quis pos no
   * catalogo a tarde, dentro da mesma janela de trinta minutos.
   */
  desarmarSeMudouDeAssunto(de: string, texto: string): void {
    const n = normalizarTextoDoCanal(texto);
    if (RE_ENCERRAR.test(n) || RE_CATALOGO.test(n)) {
      this.sessao.esquecerMiraDePrompt(de);
    }
  }

  // ---------------------------------------------------------------------------
  // O texto que pede o prompt
  // ---------------------------------------------------------------------------

  /**
   * Ele pediu o prompt por texto ou audio. Duas situacoes:
   *
   *   a foto ainda nao veio  -> arma a mira e avisa que pode mandar
   *   a foto ja veio         -> RESGATE, e o prompt sai agora
   */
  async doTexto(de: string, texto: string): Promise<RespostaFoto> {
    // A MIRA PRIMEIRO, SEMPRE. Mesmo quando ha foto para resgatar: ele acabou
    // de dizer o que quer, e a proxima foto e desta mesma rajada.
    //
    // SEM A REFERENCIA, pelo motivo escrito em `daFoto`: ela e DESTA peca, e
    // a mira vale para as proximas.
    this.sessao.mirarPrompt(de, semCodigoDaPeca(texto));

    const resgatada = await this.resgatarUltimaFoto(de);
    if (!resgatada) {
      return {
        resposta:
          'Pode mandar a foto da peça que eu escrevo o prompt em inglês para você colar na ferramenta de imagem.',
        motivo: 'prompt_esperando_foto',
      };
    }

    // ====================================================================
    // A REFERENCIA QUE VEIO NA LEGENDA DA FOTO NAO SE PERDE — 29/10/2026.
    //
    // ACHADO NO TESTE DELE. Ele mandou a foto com a legenda *"o produto e
    // AN26406"*; a foto foi para o catalogo, que GUARDOU esse codigo na foto
    // pendurada; e so entao ele pediria o prompt. O texto do pedido nao tem
    // a referencia — ela ficou na mensagem anterior.
    //
    // Sem isto, a ficha do cadastro sumiria exatamente no caso em que ele se
    // deu ao trabalho de informa-la.
    // ====================================================================
    //
    // ====================================================================
    // E O RESGATE TAMBEM PERGUNTA O CODIGO — 09/11/2026.
    //
    // ACHADO DE CARONA NO TESTE DO "promt". A regra que ele pediu hoje e
    // "foto sem codigo pergunta", e eu a tinha posto so em `daFoto`. Pela
    // porta do resgate — que e justamente a que o teste dele usou — a foto
    // saia direto, sem ficha e sem pergunta.
    //
    // UMA REGRA QUE VALE EM UM CAMINHO E DOIS COMPORTAMENTOS, nao uma regra.
    // A foto volta para a espera, agora marcada como NOSSA, e a pergunta sai.
    // ====================================================================
    const codigo = codigoDaPecaNoTexto(texto) ?? resgatada.codigoErp;
    if (!codigo && !this.sessao.aceitouSemCodigo(de)) {
      return this.pendurarEPerguntar(de, resgatada.conteudo, resgatada.mime);
    }

    return this.escrever(
      resgatada.anexo,
      texto,
      'prompt_do_resgate',
      resgatada.codigoErp,
    );
  }

  // ---------------------------------------------------------------------------
  // A foto que vira prompt
  // ---------------------------------------------------------------------------

  /**
   * A foto chegou para virar prompt — pela legenda ou pela mira.
   *
   * NAO GRAVA NADA. Esta foto nao e do catalogo e nao vira linha de peca: os
   * bytes viajam para a chamada e acabam ali. Gravar criaria arquivo orfao em
   * `originais/` a cada prompt pedido.
   */
  async daFoto(msg: {
    de: string;
    legenda: string;
    imagem: ImagemInterna;
  }): Promise<RespostaFoto> {
    const mira = this.sessao.promptMirado(msg.de);
    // O QUE ELE DISSE AO ARMAR VALE PARA A RAJADA INTEIRA: no WhatsApp so a
    // primeira foto leva legenda, e as outras nove chegam nuas.
    const pedido = msg.legenda.trim() || mira?.pedido || '';

    // ====================================================================
    // A FOTO QUE CHEGA PELA LEGENDA ARMA A MIRA — defeito achado pelo teste
    // da rajada, em 29/10, antes de isto ir ao ar.
    //
    // Sem esta linha, "faz o prompt dessa" valia para UMA foto: a segunda e a
    // terceira chegam sem legenda nenhuma e voltavam para o catalogo, caladas.
    // E o mesmo motivo de a `PecaMirada` existir — "o WhatsApp nao manda
    // album: as dez imagens chegam como dez eventos separados".
    //
    // A saida continua sendo falar de outro assunto, e e barata: qualquer
    // mensagem de catalogo desarma. Ver `desarmarSeMudouDeAssunto`.
    //
    // ====================================================================
    // E A REFERENCIA NAO ENTRA NA MIRA — 29/10/2026.
    //
    // O pedido guardado vale para as PROXIMAS fotos, e a proxima foto e
    // outra peca. Guardar "faz o prompt do BR26396" faria a peca 2 da rajada
    // herdar o cadastro da peca 1 — e a ficha e justamente o que o modelo
    // trata como verdade sobre pedra, metal e contagem.
    //
    // Ficha errada e PIOR que ficha nenhuma: sem ela o modelo escreve a cor
    // que ve; com ela, escreve com seguranca o nome errado.
    // ====================================================================
    this.sessao.mirarPrompt(msg.de, semCodigoDaPeca(pedido));

    if (!msg.imagem.url) {
      return { resposta: NAO_BAIXOU, motivo: 'prompt_imagem_sem_arquivo' };
    }

    const arquivo = await this.whatsapp.baixarMidia(msg.imagem.url);
    if (!arquivo) {
      return { resposta: NAO_BAIXOU, motivo: 'prompt_imagem_download_falhou' };
    }

    const mime = arquivo.mimetype.startsWith('image/')
      ? arquivo.mimetype
      : msg.imagem.mimetype;

    const recusa = this.recusarArquivo(mime, arquivo.conteudo.length);
    if (recusa) return recusa;

    // ====================================================================
    // SEM O CODIGO, A FOTO ESPERA — pedido do Lucas em 09/11/2026.
    //
    // *"Queria que fosse também solicitado o código da peça caso não mande.
    // Se mandar junto da foto, ok."*
    //
    // A ficha do cadastro traz a CONTAGEM das pedras e o METAL — as duas
    // coisas que a foto nao diz e que o molde mais teme errar. Ela era um
    // ganho que so acontecia quando ele lembrava; agora e perguntada.
    //
    // E A FOTO PRECISA EXISTIR ENQUANTO ESPERA. Ate aqui este caminho nao
    // gravava nada de proposito — os bytes iam para a chamada e acabavam ali.
    // Segurar em memoria perderia a foto em todo restart, que e exatamente a
    // razao de a area de espera do catalogo existir desde sempre. Entao ela
    // nasce em `catalogo/pendentes/` como qualquer outra e e MARCADA como
    // nossa, para o catalogo nao a recolher. Ver `paraPrompt`.
    // ====================================================================
    if (
      !codigoDaPecaNoTexto(pedido) &&
      !this.sessao.aceitouSemCodigo(msg.de)
    ) {
      return this.pendurarEPerguntar(msg.de, arquivo.conteudo, mime);
    }

    return this.escrever(
      { tipo: 'imagem', base64: arquivo.conteudo.toString('base64'), mime },
      pedido,
      'prompt_da_foto',
    );
  }

  /**
   * Guarda a foto na area de espera e pergunta o codigo — UMA VEZ SO.
   *
   * ==========================================================================
   * A SEGUNDA FOTO DA RAJADA NAO PERGUNTA DE NOVO.
   *
   * O custo que eu mesmo levantei no plano: dez fotos sem codigo dariam dez
   * perguntas, que e o que o catalogo faz hoje com "de qual catalogo e?". Aqui
   * da para fazer melhor, porque a resposta dele serve para a fila inteira —
   * entao a pergunta sai na primeira e as outras entram caladas.
   *
   * O silencio tem fim: a varredura avisa quando a espera vence, e a resposta
   * resolve TODAS as que estiverem esperando.
   * ==========================================================================
   */
  private async pendurarEPerguntar(
    de: string,
    conteudo: Buffer,
    mime: string,
  ): Promise<RespostaFoto> {
    const jaPerguntou = this.sessao.temPendentes(de, 'prompt');

    const chave = await this.armazenamento.guardar(
      { conteudo, mime, nomeOriginal: 'whatsapp' },
      PASTA_PENDENTES,
    );
    const coube = this.sessao.pendurar(de, {
      arquivoId: chave,
      mime,
      codigoErp: null,
      parcelas: null,
      paraPrompt: true,
    });
    if (!coube) {
      await this.armazenamento.remover(chave);
      return {
        resposta:
          'Tem foto demais esperando resposta. Me diz o código das que já mandei antes de mandar mais.',
        motivo: 'prompt_fila_cheia',
      };
    }

    // A SEGUNDA DA RAJADA ENTRA CALADA — `null` e o jeito da casa de nao
    // responder nada (ver o webhook: `if (!resultado.resposta)`).
    if (jaPerguntou) {
      return { resposta: null, motivo: 'prompt_aguardando_codigo_calado' };
    }
    return { resposta: PERGUNTA_DO_CODIGO, motivo: 'prompt_aguardando_codigo' };
  }

  /**
   * A RESPOSTA DA PERGUNTA DO CODIGO — 09/11/2026.
   *
   * `null` quando nao ha foto esperando ou quando o texto nao responde isto —
   * e ai a mensagem segue o caminho dela, como se este metodo nao existisse.
   *
   * ==========================================================================
   * O CODIGO VALE PARA A FOTO DE QUE A PERGUNTA FALAVA, e so para ela.
   *
   * Se houver mais de uma esperando — a rajada que entrou calada —, a primeira
   * leva a ficha e as outras saem pela foto. Espalhar o codigo por todas faria
   * a peca 2 herdar o cadastro da peca 1, que e o erro contra o qual a mira ja
   * se protege: ficha errada e pior que ficha nenhuma.
   *
   * O "nao tem" e diferente: ele e sobre o pedido, e nao sobre uma peca. Vale
   * para todas, e para as proximas da janela.
   * ==========================================================================
   */
  async responderSobreOCodigo(
    de: string,
    texto: string,
  ): Promise<RespostaFoto | null> {
    if (!this.sessao.temPendentes(de, 'prompt')) return null;

    const n = normalizarTextoDoCanal(texto);
    const codigo = codigoDaPecaNoTexto(texto);
    const dispensou = !codigo && RE_SEM_CODIGO.test(n);
    if (!codigo && !dispensou) return null;

    if (dispensou) this.sessao.aceitarSemCodigo(de);

    const fila = this.sessao.recolherPendentes(de, 'prompt');
    const mira = this.sessao.promptMirado(de);
    const pedido = mira?.pedido ?? '';

    const saidas: RespostaFoto[] = [];
    for (const [i, foto] of fila.entries()) {
      const lido = await this.armazenamento.ler(foto.arquivoId);
      // O ARQUIVO SAI DA ESPERA ASSIM QUE E LIDO: `recolherPendentes` ja o
      // tirou da fila, entao ele nunca mais vai vencer — e e a varredura das
      // vencidas que apaga `pendentes/`. Sem isto, cada prompt deixaria um
      // orfao para sempre.
      await this.armazenamento.remover(foto.arquivoId);
      if (!lido) {
        this.logger.warn('Foto de prompt sumiu do armazenamento ao responder.');
        continue;
      }
      saidas.push(
        await this.escrever(
          {
            tipo: 'imagem',
            base64: lido.conteudo.toString('base64'),
            mime: lido.mime,
          },
          pedido,
          'prompt_depois_do_codigo',
          i === 0 ? codigo : null,
        ),
      );
    }

    if (saidas.length === 0) {
      return {
        resposta: 'Perdi a foto que estava esperando. Manda de novo?',
        motivo: 'prompt_espera_perdida',
      };
    }

    // CADA PROMPT NA SUA MENSAGEM. Ele copia a resposta inteira e cola na
    // ferramenta de imagem — dois prompts emendados virariam um pedido so,
    // confuso, descrevendo duas pecas.
    for (const extra of saidas.slice(0, -1)) {
      if (extra.resposta) await this.whatsapp.enviarTexto(de, extra.resposta);
    }
    return saidas[saidas.length - 1];
  }

  // ---------------------------------------------------------------------------
  // Dentro
  // ---------------------------------------------------------------------------

  /**
   * A RESPOSTA E O PROMPT, E NADA MAIS.
   *
   * Ele vai copiar a mensagem inteira e colar na ferramenta de imagem. Um
   * "aqui está o seu prompt!" em volta entraria junto e viraria instrucao para
   * ela. Nao e estilo: e corretude.
   */
  private async escrever(
    anexo: AnexoDaConversa,
    pedido: string,
    motivo: string,
    codigoDeFora?: string | null,
  ): Promise<RespostaFoto> {
    const r = await this.prompts.gerar({
      anexo,
      pedido,
      ficha: await this.ficha(pedido, codigoDeFora),
    });
    if (!r.prompt) {
      return {
        resposta: r.falha ?? 'Não consegui escrever o prompt agora.',
        motivo: `${motivo}_falhou`,
      };
    }
    return { resposta: r.prompt, motivo };
  }

  /**
   * O QUE O CADASTRO SABE, quando ele mandou a referencia — 29/10/2026.
   *
   * ==========================================================================
   * PEDIDO DELE: *"com a referência você tem acesso à descrição do produto e
   * pode até fazer o prompt melhor"*.
   *
   * O ganho medido e grande: a etiqueta da casa traz a CONTAGEM das pedras
   * ("222 DIAM 4.08 CTS") e o campo `cor` traz o METAL — as duas coisas que a
   * foto nao diz e que o molde mais teme errar. Ver `fichaDaPeca`.
   *
   * `null` E O CAMINHO NORMAL: sem referencia na frase, o prompt sai da foto
   * sozinha, exatamente como saia antes. A ficha SOMA, nunca e requisito.
   * ==========================================================================
   */
  private async ficha(
    pedido: string,
    codigoDeFora?: string | null,
  ): Promise<string | null> {
    // O DA FRASE GANHA DO HERDADO: se ele escreveu uma referencia AGORA, e
    // dela que ele esta falando.
    const codigo = codigoDaPecaNoTexto(pedido) ?? codigoDeFora ?? null;
    if (!codigo) return null;

    try {
      const produto = await this.produtos.findByCodigoErp(codigo);
      if (!produto) {
        // DIZER NO LOG E SEGUIR. Referencia digitada errado nao pode impedir
        // o prompt: a foto sozinha ja escrevia um bom, e e isso que ele
        // recebe.
        this.logger.debug(`Referencia ${codigo} nao encontrada — prompt so pela foto.`);
        return null;
      }
      return fichaDaPeca(produto);
    } catch (err) {
      this.logger.warn(
        `Falha ao buscar a peca ${codigo}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  private recusarArquivo(mime: string, bytes: number): RespostaFoto | null {
    if (!MIMES_IMAGEM.includes(mime as (typeof MIMES_IMAGEM)[number])) {
      return {
        resposta: `Não consigo usar esse formato (${mime}). Manda como foto normal (JPEG ou PNG).`,
        motivo: 'prompt_formato_recusado',
      };
    }
    if (bytes > LIMITE_BYTES) {
      return {
        resposta: 'Essa imagem é grande demais. Manda uma versão menor.',
        motivo: 'prompt_imagem_grande_demais',
      };
    }
    return null;
  }

  /**
   * A foto que ele mandou ANTES de dizer que era para prompt.
   *
   * ==========================================================================
   * NADA E DESFEITO AQUI, E ISSO E DE PROPOSITO.
   *
   * Sao duas origens, e as duas sao leitura:
   *
   *   PENDURADA  a foto espera "de qual catalogo e?". Recolher tira da fila
   *              uma resposta que ele nao vai dar — a pergunta era de outro
   *              assunto — e evita o aviso de foto vencida mais tarde.
   *
   *   GUARDADA   a foto JA virou linha de catalogo, porque havia catalogo
   *              lembrado. Ela CONTINUA la: so lemos o original de novo. Se
   *              ele nao a queria no catalogo, tira pelo painel — apagar por
   *              conta propria seria decidir por ele.
   * ==========================================================================
   */
  private async resgatarUltimaFoto(de: string): Promise<{
    anexo: AnexoDaConversa;
    codigoErp: string | null;
    /** Os mesmos bytes, crus — o resgate pode precisar devolve-los a espera. */
    conteudo: Buffer;
    mime: string;
  } | null> {
    const penduradas = this.sessao.recolherPendentes(de);
    const pendurada = penduradas[penduradas.length - 1];
    if (pendurada) {
      const lido = await this.armazenamento.ler(pendurada.arquivoId);
      if (lido) {
        // ================================================================
        // O ARQUIVO SAI DA PASTA DE ESPERA, e isto nao e zelo opcional.
        //
        // `recolherPendentes` tirou a foto da fila, entao ela nunca vai
        // VENCER — e e a varredura de vencidas que apaga os arquivos de
        // `pendentes/` (ver `varrerExpiradas`). Sem esta linha, cada prompt
        // pedido assim deixaria um arquivo orfao para sempre.
        //
        // Os bytes ja estao em memoria aqui. Se a escrita do prompt falhar
        // depois, a resposta pede a foto de novo — e so isso se perde.
        // ================================================================
        await this.armazenamento.remover(pendurada.arquivoId);
        return {
          anexo: {
            tipo: 'imagem',
            base64: lido.conteudo.toString('base64'),
            mime: lido.mime,
          },
          // A REFERENCIA QUE ELE PÔS NA LEGENDA DA FOTO. O canal do catalogo
          // ja a tinha lido e guardado aqui — e e a mesma peca.
          codigoErp: pendurada.codigoErp,
          conteudo: lido.conteudo,
          mime: lido.mime,
        };
      }
      this.logger.warn('Foto pendurada nao foi encontrada no armazenamento.');
    }

    const guardada = this.sessao.fotoGuardada(de);
    if (!guardada) return null;

    const foto = await this.catalogos.buscarFotoPorId(guardada.fotoId);
    // O ORIGINAL, e nao a versao tratada: tratar o tratado degrada, e o prompt
    // descreve a peca como ela saiu do celular.
    const chave = foto?.arquivoOriginalId ?? foto?.arquivoId ?? null;
    if (!chave) return null;

    const lido = await this.armazenamento.ler(chave);
    if (!lido) return null;

    return {
      anexo: {
        tipo: 'imagem',
        base64: lido.conteudo.toString('base64'),
        mime: lido.mime,
      },
      codigoErp: foto?.codigoErp ?? null,
      conteudo: lido.conteudo,
      mime: lido.mime,
    };
  }
}
