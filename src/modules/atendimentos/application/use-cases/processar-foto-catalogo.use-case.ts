import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { TratarFotoUseCase } from '../../../catalogos/application/use-cases/tratar-foto.use-case';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  PASTA_ORIGINAIS,
  PASTA_PENDENTES,
  pastaDoCatalogo,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../../catalogos/domain/ports/injection-tokens';
import type {
  CatalogoAberto,
  FotoItem,
  ICatalogoRepository,
} from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import { ListarProdutosUseCase } from '../../../produtos/application/use-cases/listar-produtos.use-case';
import {
  SessaoCatalogoService,
  type FotoPendente,
  type OpcaoPeca,
} from '../sessao-catalogo.service';

/**
 * Parcelamento padrao.
 *
 * O ERP nao guarda parcelamento — so o preco. Nos catalogos reais conferidos
 * no levantamento, 10X aparece em quase tudo e 6X em duas pecas. Assumir 10X
 * erra o VALOR DA PARCELA nos casos raros, nunca o preco; quem souber que a
 * peca e 6X escreve "6x" na legenda.
 */
const PARCELAS_PADRAO = 10;

/**
 * Permissao que habilita o assunto catalogo no canal interno. Mora aqui, e
 * nao no modulo de auth, porque quem define o que e "poder mandar foto de
 * peca" e este fluxo.
 */
export const PERMISSAO_CATALOGO = 'catalogo:write';

/** `CO26185`, `BR26252` — duas letras e digitos. E o formato dos catalogos da casa. */
const RE_CODIGO = /\b([A-Z]{2}\d{3,})\b/i;

/** `10x`, `6 X` — parcelamento informado na legenda. */
const RE_PARCELAS = /\b(\d{1,2})\s*x\b/i;

/**
 * `15%`, `12 %` — o JURO do parcelamento, sobre o valor a vista.
 *
 * Decidido com o Lucas em 01/09/2026: o numero e juro, nao desconto. Entao
 * `12x 15%` em R$44.900,00 e 44.900 x 1,15 = R$51.635,00, parcelado em 12.
 */
const RE_JUROS = /(\d{1,3})\s*%/;

/**
 * `sem juros`, `s/ juros`, `sem acrescimo` — juro ZERO, e nao ausencia dele.
 *
 * A diferenca importa: sem indicacao nenhuma vale a regra da casa (dividir por
 * 0,80), que equivale a 25% de juro. "Sem juros" e o contrario disso, e
 * precisa de um jeito de ser dito.
 */
const RE_SEM_JUROS =
  /\bsem\s*juros\b|\bs\s*\/?\s*juros\b|\bsem\s*acr[eé]scimo\b/i;

// A BARRA E OPCIONAL de proposito. `lerJuros` compara sobre o texto
// NORMALIZADO, e o `normalizar` troca a barra por espaco — entao `s/ juros`
// chega ali como `s juros`. Exigindo a barra, a forma abreviada nunca casaria,
// e a peca sairia com o acrescimo padrao: o oposto do que foi pedido.

/** `0042`, `#42`, `42` — o numero do catalogo. */
const RE_NUMERO = /#?\b(\d{1,6})\b/;

/**
 * ===========================================================================
 * O QUE FAZ UM TEXTO SER BUSCA DE PECA — E POR QUE PRECISA DE UMA PORTA.
 *
 * Enquanto uma foto espera codigo, TODO texto daquele remetente passa por
 * aqui. Sem porta nenhuma, um "quanto vendi hoje?" digitado com a foto
 * pendurada viraria busca de produto e receberia "nao achei nenhuma peca com
 * isso" — a pergunta dela ignorada, que e exatamente o defeito que o
 * vocabulario fechado da aprovacao existe para evitar.
 *
 * Entao a busca so comeca quando o texto DIZ QUE PECA E. E natural: a
 * pergunta que a provoca e "me manda o codigo da peca", e quem nao sabe o
 * codigo responde "anel de esmeralda", nunca "de esmeralda" solto.
 *
 * O CUSTO ACEITO: buscar so pela pedra ("esmeralda gota") nao dispara. O
 * contrario — engolir conversa que era da Anastasia — custa mais caro, porque
 * ela nunca fica sabendo que a pergunta existiu.
 * ===========================================================================
 */
const RE_TIPO_PECA =
  /\b(anel|aneis|alianca|aliancas|brinco|brincos|colar|colares|corrente|correntes|gargantilha|gargantilhas|pingente|pingentes|pulseira|pulseiras|bracelete|braceletes|tornozeleira|tornozeleiras|berloque|berloques|broche|broches|piercing|piercings|relogio|relogios|joia|joias|peca|pecas|conjunto|conjuntos)\b/;

/** `2`, `#2` — o numero da opcao na lista que eu acabei de mostrar. */
const RE_ESCOLHA = /^#?(\d{1,2})\b/;

/**
 * Teto de opcoes. Lista longa no WhatsApp nao ajuda ninguem — o mesmo numero
 * da consulta da vendedora, e pelo mesmo motivo.
 */
const MAX_OPCOES = 6;

/**
 * "e essa mesmo" quando ha UMA opcao so na lista.
 *
 * PORQUE EU PERGUNTEI. Mostrando uma peca so e dizendo "e ela?", exigir o
 * numero seria cobrar senha de quem eu mesmo chamei — a regra que ja custou
 * tres defeitos em 31/08.
 *
 * SEGURO PORQUE A APROVACAO VEM ANTES: `sim` com foto tratada esperando
 * veredito e consumido por `aprovacao` no roteador, e nunca chega aqui.
 * Isto so ve o `sim` que sobrou — e nesse ponto ele so pode ser sobre a
 * lista.
 */
const PALAVRAS_CONFIRMA = [
  'sim',
  'isso',
  'isso mesmo',
  'essa',
  'essa mesmo',
  'e essa',
  'e ela',
  'exato',
  'confirma',
  'confirmo',
];

/**
 * Palavras que sao COMANDO, nao estilo.
 *
 * A fronteira de palavra nos dois lados e essencial: sem ela, "cat" casaria
 * dentro de "catalogo" (deixando "alogo") e "foto" dentro de "fotografia".
 */
const PALAVRAS_DE_COMANDO =
  /\b(catalogo|catálogo|cat|ref|referencia|referência|codigo|código|peca|peça|foto)\b/gi;

/**
 * ===========================================================================
 * O VOCABULARIO DA APROVACAO — E POR QUE ELE E FECHADO.
 *
 * A resposta a "ficou assim?" chega como texto livre no MESMO canal em que a
 * pessoa tambem conversa com a Anastasia. Se qualquer texto que nao fosse
 * "aprovo" virasse pedido de ajuste, um "quanto vendi hoje?" digitado com uma
 * foto pendurada iria parar no modelo de imagem — cobrado, demorado, e sem
 * resposta a pergunta que ela fez.
 *
 * Entao sao duas listas fechadas, e QUALQUER OUTRA COISA nao e resposta de
 * aprovacao: cai nos agentes de sempre. E deliberado errar para o lado de
 * "nao entendi como aprovacao" — o custo e ela repetir a palavra; o custo do
 * contrario e uma geracao perdida e a pergunta dela ignorada.
 *
 * Sem LLM aqui, pelo mesmo motivo dos avisos: e classificacao de uma palavra,
 * e um modelo so acrescentaria latencia, custo e uma superficie de injecao
 * onde hoje nao existe nenhuma.
 * ===========================================================================
 */
const PALAVRAS_APROVA = [
  'aprovo',
  'aprovado',
  'aprovada',
  'aprovar',
  'ok',
  'okay',
  'perfeito',
  'pode ir',
  'pode publicar',
  'ficou bom',
  'ficou otimo',
  'isso mesmo',
  'ta bom',
  'ta otimo',
  'beleza',
  'blz',
  'sim',
];

/**
 * Pedido de mudanca. O que vem DEPOIS da palavra e a instrucao para a IA.
 *
 * REPARE QUE "nao" SOZINHO NAO ESTA AQUI, e a ausencia e o ponto: "nao sei",
 * "nao precisa", "nao consegui ver" sao conversa, e um "nao" solto na lista
 * mandaria as tres para o modelo de imagem. So entram as formas em que a
 * negativa e inequivocamente sobre a foto.
 */
const PALAVRAS_AJUSTA = [
  'ajusta',
  'ajuste',
  'ajustar',
  'muda',
  'mudar',
  'troca',
  'trocar',
  'refaz',
  'refazer',
  'de novo',
  'reprova',
  'reprovar',
  'nao gostei',
  'nao ficou bom',
  'nao ficou',
  'nao curti',
];

/**
 * Jogar fora. A peca nunca entrou no catalogo e nao vai entrar.
 *
 * SO ESTA LISTA APAGA DE VERDADE. `ajusta` refaz e `aprovo` publica; aqui a
 * linha e os arquivos somem. Por isso as palavras sao inequivocas — nada de
 * "nao" nem "deixa": tem de ser um verbo de descarte.
 */
const PALAVRAS_DESCARTA = [
  'descarta',
  'descartar',
  'descarte',
  'apaga',
  'apagar',
  'deleta',
  'deletar',
  'exclui',
  'excluir',
  'joga fora',
  'esquece',
  'cancela',
];

/** `aprovo todas`, `todas`, `todos` — vale para a fila inteira. */
const RE_TODAS = /\btod[ao]s\b/;

type Veredito =
  | { tipo: 'APROVA'; todas: boolean }
  | { tipo: 'AJUSTA'; pedido: string | null }
  | { tipo: 'DESCARTA'; todas: boolean }
  | { tipo: 'NENHUM' };

/**
 * A resposta a "ficou assim?".
 *
 * Compara sobre o texto NORMALIZADO — minusculas, sem acento e sem pontuacao —
 * para "Aprovo!", "aprovo" e "APROVO" serem a mesma coisa, e para nao ser
 * preciso repetir cada palavra com e sem acento.
 *
 * A palavra tem de ABRIR a frase. "Nao sei se aprovo essa" contem "aprovo" e
 * nao e aprovacao nenhuma; exigindo o inicio, cai em NENHUM e vai para os
 * agentes, que e o lado seguro de errar.
 */
function lerVeredito(texto: string): Veredito {
  const n = normalizar(texto);
  if (!n) return { tipo: 'NENHUM' };

  // O DESCARTE E CONFERIDO PRIMEIRO. Ele e o unico irreversivel, e uma frase
  // que casasse nas duas listas nao pode acabar publicando o que a pessoa
  // mandou jogar fora.
  if (PALAVRAS_DESCARTA.some((p) => n === p || n.startsWith(`${p} `))) {
    return { tipo: 'DESCARTA', todas: RE_TODAS.test(n) };
  }

  if (PALAVRAS_APROVA.some((p) => n === p || n.startsWith(`${p} `))) {
    return { tipo: 'APROVA', todas: RE_TODAS.test(n) };
  }

  // A MAIS LONGA que casar, e nao a primeira da lista: "nao ficou bom" e
  // "nao ficou" casam as duas, e pela primeira sobraria "bom" como pedido de
  // estilo — uma instrucao que ninguem deu.
  const ajusta = PALAVRAS_AJUSTA.filter(
    (p) => n === p || n.startsWith(`${p} `),
  ).sort((a, b) => b.length - a.length)[0];
  if (ajusta) {
    const resto = n.slice(ajusta.length).trim();
    return { tipo: 'AJUSTA', pedido: resto.length >= 3 ? resto : null };
  }

  return { tipo: 'NENHUM' };
}

/**
 * O que sobra da legenda vira pedido de estilo para a IA — "fundo rosa",
 * "mais claro". Menos de tres caracteres e ruido de pontuacao, nao instrucao.
 */
function limparPedido(resto: string): string | null {
  const limpo = resto
    .replace(PALAVRAS_DE_COMANDO, ' ')
    .replace(/[#\s]+/g, ' ')
    .trim();
  return limpo.length >= 3 ? limpo : null;
}

/**
 * A imagem como a APLICACAO a conhece. Espelha o que o webhook extrai, mas
 * declarada aqui: o mesmo criterio do audio — a camada de aplicacao nao
 * importa tipo da infra, senao trocar de provedor de WhatsApp mexeria nos
 * casos de uso.
 */
export interface ImagemInterna {
  /** Endereco do arquivo ja decifrado pelo provedor. Nulo = nao deu para baixar. */
  url: string | null;
  mimetype: string;
}

export interface FotoDoCanal {
  /** Identificador do remetente ja resolvido (contem telefone). */
  de: string;
  /** Rotulo de quem fotografou. Nome do staff, nunca o telefone. */
  nomeRemetente: string;
  legenda: string;
  imagem: ImagemInterna;
}

export interface RespostaFoto {
  resposta: string | null;
  motivo: string;
}

/**
 * A foto da peca chegando pelo WhatsApp.
 *
 * ==========================================================================
 * A ORDEM DAS OPERACOES NAO E ARBITRARIA: BAIXAR PRIMEIRO, PERGUNTAR DEPOIS.
 *
 * O WAHA apaga a midia decifrada em 30 minutos. Se o fluxo fosse "perguntar de
 * qual catalogo e, e so entao baixar", bastaria a pessoa sair para almocar
 * para a foto sumir — e ela nao teria como saber, porque ja tinha mandado.
 * Entao grava-se o arquivo assim que ele chega, e a classificacao acontece
 * depois, sobre um arquivo que ja e nosso.
 * ==========================================================================
 *
 * O CICLO COMPLETO DA FOTO, ja fechado:
 *
 *   chega  ->  originais/  ->  IA  ->  fotos/  ->  "ficou assim?"  ->  APROVADA
 *                                        ^                |
 *                                        +--- "ajusta ..." +
 *
 * A ida ate a IA e a volta com a versao tratada estao em `tratarEAvisar`; a
 * leitura do sim e do "muda isso" esta em `aprovacao`.
 */
@Injectable()
export class ProcessarFotoCatalogoUseCase {
  private readonly logger = new Logger(ProcessarFotoCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly catalogos: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly sessao: SessaoCatalogoService,
    private readonly tratar: TratarFotoUseCase,
    // A MESMA BUSCA DA ELENA, de 20/08: varre descricao, categoria, familia,
    // colecao, pedra, cor e codigo, com AND entre as palavras e OR entre as
    // colunas — "anel de esmeralda" casa com "ANEL VINTAGE ESMERALDA". Nao
    // havia por que escrever uma segunda.
    private readonly listarProdutos: ListarProdutosUseCase,
  ) {}

  /**
   * Trata a foto e manda o resultado para quem a enviou.
   *
   * RODA FORA DA RESPOSTA, e por isso nao tem `await` de quem a chama: gerar
   * imagem leva 10 a 30 segundos, e segurar o webhook por esse tempo faria o
   * WAHA reenviar o evento — a mesma foto entraria duas vezes.
   *
   * Nada aqui pode estourar para fora: a foto ja esta gravada, e a pessoa ja
   * recebeu a confirmacao. Falhar custa a versao tratada, nunca a imagem.
   */
  private async tratarEAvisar(
    fotoId: string,
    pedidoDeEstilo: string | null,
    chat: string,
  ): Promise<void> {
    try {
      const r = await this.tratar.execute(fotoId, pedidoDeEstilo);
      if (!r) return;

      if (r.recado) {
        await this.whatsapp.enviarTexto(chat, r.recado);
        return;
      }
      if (r.foto.status !== 'EM_APROVACAO' || !r.foto.arquivoId) return;

      const tratada = await this.armazenamento.ler(r.foto.arquivoId);
      if (!tratada) return;

      // A CATRACA SOBE ANTES DO ENVIO. Se subisse depois e o envio falhasse
      // no meio, a foto ficaria EM_APROVACAO no banco sem ninguem escutando a
      // resposta; assim, no maximo, ela responde a uma imagem que nao chegou —
      // e a fila do banco, que e a verdade, corrige.
      this.sessao.marcarEmAprovacao(chat);

      await this.whatsapp.enviarImagem(
        chat,
        tratada.conteudo,
        tratada.mime,
        // A peca vai NOMEADA porque a fila pode ter varias: sem o codigo, um
        // "aprovo" solto seria um chute sobre qual imagem ela esta olhando.
        `${r.foto.codigoErp ? `${r.foto.codigoErp} — ficou assim.` : 'Ficou assim.'}\n` +
          '"aprovo" põe no catálogo · "ajusta" e o quê refaz · "descarta" joga fora.',
      );
    } catch (err) {
      this.logger.error(
        `Falha ao tratar/avisar a foto ${fotoId}: ${String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Chegou uma foto
  // ---------------------------------------------------------------------------
  async foto(msg: FotoDoCanal): Promise<RespostaFoto> {
    await this.varrerExpiradas();
    await this.rearmarAprovacao(msg.de, msg.nomeRemetente);

    const abertos = await this.catalogos.listarAbertos();
    if (abertos.length === 0) {
      return {
        resposta:
          'Recebi a foto, mas não há nenhum catálogo liberado para receber fotos. ' +
          'Crie ou libere um no painel e me manda de novo.',
        motivo: 'catalogo_nenhum_aberto',
      };
    }

    if (!msg.imagem.url) {
      // O WAHA reconheceu a imagem mas nao entregou o arquivo. Avisar e melhor
      // que silencio: quem mandou acha que deu certo.
      return {
        resposta:
          'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?',
        motivo: 'imagem_sem_arquivo',
      };
    }

    const arquivo = await this.whatsapp.baixarMidia(msg.imagem.url);
    if (!arquivo) {
      return {
        resposta:
          'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?',
        motivo: 'imagem_download_falhou',
      };
    }

    const mime = arquivo.mimetype.startsWith('image/')
      ? arquivo.mimetype
      : msg.imagem.mimetype;
    if (!MIMES_IMAGEM.includes(mime as (typeof MIMES_IMAGEM)[number])) {
      return {
        resposta: `Não consigo usar esse formato (${mime}). Manda como foto normal (JPEG ou PNG).`,
        motivo: 'imagem_formato_recusado',
      };
    }
    if (arquivo.conteudo.length > LIMITE_BYTES) {
      return {
        resposta: 'Essa imagem é grande demais. Manda uma versão menor.',
        motivo: 'imagem_grande_demais',
      };
    }

    // GRAVA ANTES DE QUALQUER PERGUNTA — ver o cabecalho.
    const chave = await this.armazenamento.guardar(
      { conteudo: arquivo.conteudo, mime, nomeOriginal: 'whatsapp' },
      PASTA_PENDENTES,
    );

    const analise = this.lerLegenda(msg.legenda, abertos);
    const catalogo = analise.catalogo ?? this.sessao.catalogoAtual(msg.de);

    if (!catalogo) {
      const pendurou = this.sessao.pendurar(msg.de, {
        arquivoId: chave,
        mime,
        codigoErp: analise.codigo,
        parcelas: analise.parcelas,
        juros: analise.juros,
        pedidoDeEstilo: analise.pedidoDeEstilo,
      });
      if (!pendurou) {
        await this.armazenamento.remover(chave);
        return {
          resposta:
            'Tem foto demais esperando resposta. Me diz de qual catálogo são antes de mandar mais.',
          motivo: 'fila_cheia',
        };
      }
      return {
        resposta: this.perguntarCatalogo(abertos),
        motivo: 'aguardando_catalogo',
      };
    }

    this.sessao.lembrarCatalogo(msg.de, catalogo);
    const guardada = await this.guardarFoto(
      catalogo,
      msg.nomeRemetente,
      {
        arquivoId: chave,
        mime,
        codigoErp: analise.codigo,
        parcelas: analise.parcelas,
        juros: analise.juros,
        pedidoDeEstilo: analise.pedidoDeEstilo,
        em: Date.now(),
      },
      msg.de,
    );

    return { resposta: guardada, motivo: 'foto_guardada' };
  }

  // ---------------------------------------------------------------------------
  // Chegou um texto enquanto havia foto esperando
  // ---------------------------------------------------------------------------
  async resposta(
    de: string,
    nomeRemetente: string,
    texto: string,
  ): Promise<RespostaFoto> {
    const abertos = await this.catalogos.listarAbertos();
    const analise = this.lerLegenda(texto, abertos);

    if (!analise.catalogo) {
      return {
        resposta: 'Não achei esse catálogo. ' + this.perguntarCatalogo(abertos),
        motivo: 'catalogo_nao_reconhecido',
      };
    }

    const catalogo = analise.catalogo;
    this.sessao.lembrarCatalogo(de, catalogo);

    const fila = this.sessao.recolherPendentes(de);
    if (fila.length === 0) {
      return {
        resposta: `Certo — as próximas fotos vão para o #${catalogo.numero} ${catalogo.nome}.`,
        motivo: 'catalogo_lembrado',
      };
    }

    const linhas: string[] = [];
    for (const pendente of fila) {
      // O codigo da legenda de agora vale para as fotos que vieram sem codigo.
      const comCodigo: FotoPendente = {
        ...pendente,
        codigoErp: pendente.codigoErp ?? analise.codigo,
        parcelas: pendente.parcelas ?? analise.parcelas,
        juros: pendente.juros ?? analise.juros,
      };
      linhas.push(
        await this.guardarFoto(catalogo, nomeRemetente, comCodigo, de),
      );
    }

    return {
      resposta:
        fila.length === 1
          ? linhas[0]
          : `${fila.length} fotos foram para o #${catalogo.numero} ${catalogo.nome}.`,
      motivo: 'fotos_classificadas',
    };
  }

  // ---------------------------------------------------------------------------
  // Chegou o codigo da peca, depois da foto
  // ---------------------------------------------------------------------------

  /**
   * O `BR26252` digitado depois de a foto ja estar guardada.
   *
   * ==========================================================================
   * ISTO EXISTE PORQUE A MENSAGEM ANTERIOR CONVIDA. Ao guardar uma foto sem
   * codigo, a confirmacao diz "me manda o codigo da peca que eu completo o
   * descritivo" — e ate 01/09/2026 ninguem escutava: o codigo caia nos
   * agentes e a Anastasia respondia "esse codigo nao me diz muito sozinho".
   *
   * Mesma regra de ontem, e vale repetir: nao crie uma pergunta que voce nao
   * sabe responder.
   * ==========================================================================
   *
   * Devolve `null` quando o texto NAO tem cara de codigo — ai era outra coisa,
   * e segue para os agentes.
   */
  async codigo(de: string, texto: string): Promise<RespostaFoto | null> {
    const pendente = this.sessao.codigoPendente(de);
    if (!pendente) return null;

    const m = texto.match(RE_CODIGO);
    if (!m) return null;

    // O PARCELAMENTO TAMBEM VALE AQUI. `BR26252 6x` numa mensagem so tem de
    // funcionar igual a `0001 BR26252 6x` na legenda — quem escreve nao sabe
    // (nem deveria saber) que sao dois caminhos de codigo diferentes.
    return this.anotarCodigo(
      de,
      pendente,
      m[1].toUpperCase(),
      texto.replace(m[0], ' '),
    );
  }

  temCodigoEsperando(de: string): boolean {
    return this.sessao.codigoPendente(de) !== null;
  }

  // ---------------------------------------------------------------------------
  // Nao sei o codigo, sei a peca
  // ---------------------------------------------------------------------------

  /**
   * "anel de esmeralda ouro branco" no lugar de `CB384`.
   *
   * ==========================================================================
   * QUEM ESTA COM A PECA NA MAO NEM SEMPRE TEM O CODIGO A VISTA. Ate aqui a
   * unica resposta aceita ao "me manda o codigo" era o codigo em si —
   * qualquer descricao caia nos agentes, e a Anastasia nao sabe de que foto
   * se trata.
   *
   * A BUSCA E A MESMA DA ELENA, de 20/08. Nao existe uma segunda
   * implementacao do "procurar joia por texto" para divergir na primeira
   * correcao.
   *
   * SEMPRE CONFIRMA, mesmo com um resultado so. O proprio `ProdutosModule`
   * ja avisa: a busca textual serve para gente, nao para casar uma chave — e
   * aqui errar a peca significa publicar o preco de outra. Anotar sozinho
   * economizaria uma mensagem e arriscaria um numero errado impresso na
   * pagina, que ninguem confere depois.
   * ==========================================================================
   *
   * DEVOLVE `null` quando o texto nao era busca nem escolha — mesmo contrato
   * de `codigo` e `aprovacao` com o roteador: segue para os agentes.
   *
   * A ORDEM NO ROTEADOR IMPORTA, e este metodo depende dela: vem DEPOIS de
   * `aprovacao`, entao um `aprovo` com foto tratada esperando veredito nunca
   * chega aqui como termo de busca.
   */
  async buscarPeca(de: string, texto: string): Promise<RespostaFoto | null> {
    const pendente = this.sessao.codigoPendente(de);
    if (!pendente) return null;

    const limpo = normalizar(texto);
    const opcoes = this.sessao.escolhaPendente(de);

    if (opcoes) {
      // `2 6x` tambem vale: o que sobra depois do numero segue para a leitura
      // de parcelamento, igual ao codigo digitado.
      const escolha = limpo.match(RE_ESCOLHA);
      if (escolha) {
        const i = Number(escolha[1]);
        if (i >= 1 && i <= opcoes.length) {
          return this.anotarCodigo(
            de,
            pendente,
            opcoes[i - 1].codigo,
            limpo.slice(escolha[0].length),
          );
        }

        // FORA DA LISTA MERECE RESPOSTA. Com a lista na tela, numero solto e
        // tentativa de escolha; o silencio deixaria a pessoa achando que
        // respondeu.
        return {
          resposta:
            `Essa lista tem ${opcoes.length} — me responde com um número de 1 a ` +
            `${opcoes.length}, ou manda o código da peça.`,
          motivo: 'escolha_fora_da_lista',
        };
      }

      if (opcoes.length === 1 && PALAVRAS_CONFIRMA.includes(limpo)) {
        return this.anotarCodigo(de, pendente, opcoes[0].codigo, '');
      }
    }

    if (!RE_TIPO_PECA.test(limpo)) return null;

    // A BUSCA VAI COM O TEXTO CRU, e nao com o normalizado: o `normalizar`
    // tira acento, e `alianca` nao casa com `ALIANÇA` no ILIKE do Postgres.
    // O normalizado decide SE e busca; o cru e o que se procura.
    const achadas = await this.procurar(texto.trim());
    if (achadas.length === 0) {
      return {
        resposta:
          `Não achei nenhuma peça com "${texto.trim()}". Tenta com outras ` +
          'palavras — ou me manda o código dela.',
        motivo: 'busca_sem_resultado',
      };
    }

    this.sessao.oferecerEscolha(de, achadas);
    return { resposta: this.listarOpcoes(achadas), motivo: 'busca_com_opcoes' };
  }

  // ---------------------------------------------------------------------------
  // Chegou um texto enquanto havia foto esperando o "aprovo"
  // ---------------------------------------------------------------------------

  /**
   * A resposta ao "ficou assim?".
   *
   * ==========================================================================
   * DEVOLVE `null` QUANDO O TEXTO NAO ERA RESPOSTA DE APROVACAO — e esse null
   * e o contrato com o roteador: significa "nao era comigo, segue para os
   * agentes". Um "quanto vendi hoje?" digitado com foto pendurada tem de
   * chegar na Anastasia como chegaria em qualquer outro momento.
   * ==========================================================================
   *
   * QUEM APROVA E QUEM FOTOGRAFOU. A fila vem filtrada por `remetente`, que e
   * o nome do staff resolvido NO SERVIDOR a partir do telefone — nunca algo
   * que veio escrito na mensagem. Nao ha caminho de codigo para aprovar a foto
   * de outra pessoa.
   *
   * QUAL FOTO: a mais antiga da fila, que e a que ela viu primeiro. "aprovo
   * todas" pega a fila inteira — o caso real de quem fotografa 20 pecas e so
   * confere no fim.
   *
   * @param nomeRemetente rotulo do staff, resolvido pelo telefone.
   */
  async aprovacao(
    de: string,
    nomeRemetente: string,
    texto: string,
  ): Promise<RespostaFoto | null> {
    const fila = await this.catalogos.listarEmAprovacao(nomeRemetente.trim());
    if (fila.length === 0) {
      // A catraca estava levantada e o banco discorda: ou a tela ja aprovou,
      // ou o tratamento nem chegou a EM_APROVACAO. O banco manda.
      this.sessao.esquecerAprovacao(de);
      return null;
    }

    const veredito = lerVeredito(texto);

    // EU ACABEI DE PERGUNTAR O QUE MUDAR — então isto é a resposta, e não
    // precisa da palavra de comando. Vale só quando o texto não é, por si, um
    // veredito: um "aprovo" logo depois da pergunta continua sendo aprovação,
    // e não pedido de estilo.
    if (veredito.tipo === 'NENHUM' && this.sessao.eraRespostaDeAjuste(de)) {
      const alvo = fila[0];
      void this.tratarEAvisar(alvo.id, texto.trim(), de);
      return {
        resposta: `Refazendo ${this.rotulo(alvo)}. Te mando em instantes.`,
        motivo: 'foto_em_ajuste',
      };
    }

    if (veredito.tipo === 'NENHUM') return null;

    if (veredito.tipo === 'DESCARTA') {
      const alvos = veredito.todas ? fila : [fila[0]];
      for (const foto of alvos) await this.jogarFora(foto);

      const restantes = fila.slice(alvos.length);
      if (restantes.length === 0) this.sessao.esquecerAprovacao(de);

      const cabeca =
        alvos.length === 1
          ? `Descartei ${this.rotulo(alvos[0])}.`
          : `Descartei ${alvos.length} fotos.`;

      return {
        resposta: `${cabeca}${this.eSobraram(restantes)}`,
        motivo: 'foto_descartada',
      };
    }

    if (veredito.tipo === 'AJUSTA') {
      if (!veredito.pedido) {
        // Sem instrucao, gerar de novo so queimaria uma das tres tentativas
        // para produzir outra imagem igualmente sem rumo. Pergunto — e marco
        // que a proxima mensagem e a resposta, senao ela cairia nos agentes.
        this.sessao.pedirOAjuste(de);
        return {
          resposta:
            'O que você quer que eu mude? Me diz — "mais claro", "fundo branco" — que eu refaço.',
          motivo: 'ajuste_sem_pedido',
        };
      }

      const alvo = fila[0];
      // Mesma razao de sempre: gerar leva 10 a 30 segundos e o webhook nao
      // pode esperar. Ela recebe o "refazendo" agora e a imagem quando ficar.
      void this.tratarEAvisar(alvo.id, veredito.pedido, de);
      return {
        resposta: `Refazendo ${this.rotulo(alvo)}. Te mando em instantes.`,
        motivo: 'foto_em_ajuste',
      };
    }

    const alvos = veredito.todas ? fila : [fila[0]];

    // ==========================================================================
    // SEM CÓDIGO NÃO ENTRA NO CATÁLOGO.
    //
    // Em 01/09/2026 uma foto sem código foi aprovada e apareceu na tela com
    // `—` no lugar do descritivo. Um catálogo é peça, código e preço: sem eles
    // a página sai com um espaço em branco onde deveria estar a venda, e o PDF
    // montado imprime isso.
    //
    // Barrar aqui e não na montagem é deliberado: aqui a pessoa está com a
    // peça na mão e o código à vista. Na montagem, dias depois, ninguém sabe
    // mais de qual peça era aquela foto.
    // ==========================================================================
    const semCodigo = alvos.filter((f) => !f.codigoErp);
    if (semCodigo.length > 0) {
      // Marca a primeira, para o código que vier em seguida encontrá-la.
      this.sessao.esperarCodigo(de, semCodigo[0].id, 'essa foto');
      return {
        resposta:
          semCodigo.length === 1
            ? 'Essa foto ainda está sem código. Me manda o código da peça — ou descreve ela ("anel de esmeralda"), que eu procuro. Aí é só dizer "aprovo".'
            : `${semCodigo.length} dessas fotos estão sem código. Me manda o código de cada uma antes de aprovar.`,
        motivo: 'aprovacao_sem_codigo',
      };
    }

    for (const foto of alvos) {
      await this.catalogos.atualizarFoto(foto.id, {
        status: 'APROVADA',
        aprovadoPor: nomeRemetente,
        aprovadoEm: new Date(),
      });
    }

    const restantes = fila.slice(alvos.length);
    if (restantes.length === 0) this.sessao.esquecerAprovacao(de);

    return {
      resposta: this.confirmarAprovacao(alvos, restantes),
      motivo: 'foto_aprovada',
    };
  }

  temFotoEsperando(de: string): boolean {
    return this.sessao.temPendentes(de);
  }

  /**
   * Vale a pena tratar o proximo texto deste remetente como resposta de
   * aprovacao? E so a catraca de memoria — quem confere de verdade e
   * `aprovacao`, contra o banco.
   */
  temFotoEmAprovacao(de: string): boolean {
    return this.sessao.temEmAprovacao(de);
  }

  // ---------------------------------------------------------------------------
  // Interno
  // ---------------------------------------------------------------------------

  /**
   * Grava a linha e monta a confirmacao. O descritivo vem do ERP pelo codigo —
   * ninguem redigita preco, que e onde o erro caro acontece.
   */
  private async guardarFoto(
    catalogo: CatalogoAberto,
    remetente: string,
    foto: FotoPendente,
    // Para onde mandar a versao tratada quando ela ficar pronta.
    chat: string,
  ): Promise<string> {
    const { descricao, preco } = await this.buscarNoErp(foto.codigoErp);

    // AGORA sabemos de qual catalogo a foto e, e so agora ela pode ir para a
    // pasta dele. Ate aqui viveu em `catalogo/pendentes/` — ver o cabecalho:
    // gravar antes de perguntar e o que impede a imagem de se perder enquanto
    // a vendedora responde.
    //
    // Se o `mover` falhar, ele devolve a chave ORIGINAL, e a linha aponta para
    // a area de espera. Imagem no lugar errado e melhor que linha sem imagem.
    const arquivoId = await this.armazenamento.mover(
      foto.arquivoId,
      pastaDoCatalogo(catalogo.numero, PASTA_ORIGINAIS),
    );

    const criada = await this.catalogos.criarFoto({
      catalogoId: catalogo.id,
      codigoErp: foto.codigoErp,
      descricao,
      precoAVista: preco,
      parcelas: foto.codigoErp ? (foto.parcelas ?? PARCELAS_PADRAO) : null,
      jurosPercentual: foto.juros ?? null,
      origem: 'WHATSAPP',
      remetente,
      arquivoOriginalId: arquivoId,
      // Aponta para o ORIGINAL ate a IA responder. Se o tratamento falhar, a
      // tela mostra o packshot cru — que ja serve para conferir enquadramento
      // e se a peca certa foi fotografada.
      arquivoId,
      mime: foto.mime,
      status: 'RECEBIDA',
    });

    // O TRATAMENTO NAO SEGURA A RESPOSTA. Gerar imagem leva 10 a 30 segundos, e
    // a pessoa fica olhando o WhatsApp — ela recebe "guardei" agora e a versao
    // tratada quando ficar pronta, podendo mandar a proxima peca no intervalo.
    void this.tratarEAvisar(criada.id, foto.pedidoDeEstilo ?? null, chat);

    // O AVISO DE QUE ALGO ESTA ACONTECENDO. Entre o "guardei" e a imagem
    // tratada passam de 10 a 60 segundos, e minuto calado no WhatsApp e lido
    // como "deu errado" — a pessoa reenvia a mesma foto, que entra duas vezes.
    // Uma linha resolve, e ela ja sai daqui sabendo o que esperar.
    const tratando = '\nEstou tratando a imagem, já te mando.';

    const alvo = `#${catalogo.numero} ${catalogo.nome}`;
    if (!foto.codigoErp) {
      // O CONVITE SÓ VALE SE ALGUÉM ESCUTAR. Marcar aqui é o que faz o
      // `BR26252` digitado em seguida encontrar esta foto — sem isto ele cai
      // nos agentes, e a Anastasia responde que o código não diz nada.
      this.sessao.esperarCodigo(chat, criada.id, alvo);
      return `Foto guardada em ${alvo}. Se quiser, me manda o código da peça — ou descreve ela ("anel de esmeralda"), que eu procuro.${tratando}`;
    }
    if (!descricao) {
      return `Foto guardada em ${alvo} com o código ${foto.codigoErp} — essa peça ainda não está no sistema, então ficou sem descrição e sem preço.${tratando}`;
    }
    return `Foto guardada em ${alvo}.\n${foto.codigoErp} · ${descricao}\n${this.emReais(preco)} à vista${tratando}`;
  }

  /**
   * Lê catálogo e código de um texto livre.
   *
   * A ORDEM IMPORTA: o código sai PRIMEIRO. `BR26252` tem dígitos dentro, e
   * procurar o número do catálogo antes acharia "26252" ali e mandaria a foto
   * para um catálogo que não existe — ou, pior, para um que existe.
   */
  private lerLegenda(
    texto: string,
    abertos: CatalogoAberto[],
  ): {
    catalogo: CatalogoAberto | null;
    codigo: string | null;
    parcelas: number | null;
    /** Juro em %. `null` = nao informado, vale a regra da casa. */
    juros: number | null;
    pedidoDeEstilo: string | null;
  } {
    const bruto = (texto ?? '').trim();

    const mCodigo = bruto.match(RE_CODIGO);
    const codigo = mCodigo ? mCodigo[1].toUpperCase() : null;
    let resto = mCodigo ? bruto.replace(mCodigo[0], ' ') : bruto;

    const mParcelas = resto.match(RE_PARCELAS);
    const parcelas = mParcelas ? Number(mParcelas[1]) : null;
    if (mParcelas) resto = resto.replace(mParcelas[0], ' ');

    // O JURO SAI DEPOIS DAS PARCELAS, e a ordem e obrigatoria: em `12x 15%`,
    // procurar o percentual antes deixaria o `12x` intacto, mas procurar as
    // PARCELAS depois acharia... nada errado. O risco real e o inverso — o
    // numero do catalogo. Tirando parcelas e juro primeiro, o que sobrar de
    // digito e catalogo, e `15` deixa de poder virar catalogo #0015.
    const juros = this.lerJuros(resto);
    resto = resto.replace(RE_SEM_JUROS, ' ').replace(RE_JUROS, ' ');

    // Numero: casa contra os catalogos abertos, comparando sem os zeros a
    // esquerda — quem digita "2" quer o "0002".
    const mNumero = resto.match(RE_NUMERO);
    let catalogo: CatalogoAberto | null = null;
    if (mNumero) {
      const alvo = String(Number(mNumero[1]));
      catalogo = abertos.find((c) => String(Number(c.numero)) === alvo) ?? null;
      if (catalogo) resto = resto.replace(mNumero[0], ' ');
    }

    // Nome: so se o numero nao resolveu. Exige 3 caracteres para "de", "do" e
    // afins nao casarem com meio catalogo.
    if (!catalogo) {
      const termo = normalizar(resto);
      if (termo.length >= 3) {
        const candidatos = abertos.filter((c) =>
          normalizar(c.nome).includes(termo),
        );
        // Ambiguo nao decide sozinho — cai na pergunta.
        if (candidatos.length === 1) catalogo = candidatos[0];
      }
    }

    return {
      catalogo,
      codigo,
      juros,
      parcelas: parcelas && parcelas > 0 ? parcelas : null,
      // O QUE SOBROU E PEDIDO DE ESTILO. Tirados catalogo, codigo e parcelas, o
      // resto so pode ser instrucao para a imagem: "fundo rosa", "mais claro".
      // As palavras de comando saem — ninguem quer "catalogo" no prompt.
      pedidoDeEstilo: limparPedido(resto),
    };
  }

  /**
   * Apaga a foto de vez: os arquivos e a linha.
   *
   * OS ARQUIVOS SAEM PRIMEIRO. Apagando a linha antes, uma falha no S3
   * deixaria binario no bucket sem nenhuma linha que o nomeasse — ninguem
   * saberia depois o que aquilo era nem se podia sair. Na ordem inversa, a
   * falha deixa a linha, que continua legivel e retentavel.
   *
   * Os dois arquivos podem ser o MESMO quando a foto nunca foi tratada; o Set
   * evita o segundo `remover` numa chave que ja saiu.
   */
  private async jogarFora(foto: FotoItem): Promise<void> {
    const chaves = new Set(
      [foto.arquivoOriginalId, foto.arquivoId].filter(
        (c): c is string => !!c,
      ),
    );
    for (const chave of chaves) {
      await this.armazenamento.remover(chave);
    }
    await this.catalogos.removerFoto(foto.id);
  }

  /**
   * Grava o codigo na foto que estava esperando, e confirma com o descritivo.
   *
   * DOIS CAMINHOS CHEGAM AQUI: o codigo digitado (`codigo`) e o escolhido na
   * lista da busca (`buscarPeca`). Um lugar so grava, entao os dois dizem a
   * mesma coisa de volta e o parcelamento funciona igual nos dois.
   *
   * @param resto o que sobrou da mensagem depois do codigo ou do numero —
   *   `6x`, `15%` — lido como parcelamento.
   */
  private async anotarCodigo(
    de: string,
    pendente: { fotoId: string; alvo: string },
    codigo: string,
    resto: string,
  ): Promise<RespostaFoto> {
    const { descricao, preco } = await this.buscarNoErp(codigo);

    const mParcelas = resto.match(RE_PARCELAS);
    const pedidas = mParcelas ? Number(mParcelas[1]) : null;
    const juros = this.lerJuros(resto);

    // Parcelamento so faz sentido com preco. Sem ele, deixar `10x` gravado
    // faria a tela calcular parcela de um valor que nao existe.
    await this.catalogos.atualizarFoto(pendente.fotoId, {
      codigoErp: codigo,
      descricao,
      precoAVista: preco,
      parcelas:
        preco === null
          ? null
          : pedidas && pedidas > 0
            ? pedidas
            : PARCELAS_PADRAO,
      jurosPercentual: preco === null ? null : juros,
    });

    this.sessao.esquecerCodigo(de);

    if (!descricao) {
      return {
        resposta:
          `Anotei ${codigo} na foto de ${pendente.alvo} — mas essa peça ainda não está no ` +
          'sistema, então ficou sem descrição e sem preço.',
        motivo: 'codigo_sem_produto',
      };
    }

    return {
      resposta: `${pendente.alvo}\n${codigo} · ${descricao}\n${this.emReais(preco)} à vista`,
      motivo: 'codigo_anotado',
    };
  }

  /** As pecas que casam com a descricao, ja no formato da escolha. */
  private async procurar(termo: string): Promise<OpcaoPeca[]> {
    const produtos = await this.listarProdutos.execute({
      busca: termo,
      ativo: true,
      limit: MAX_OPCOES,
    });

    // SEM CODIGO NAO SERVE. A escolha existe para preencher `codigo_erp` na
    // foto — oferecer uma peca sem codigo seria oferecer um beco.
    return produtos
      .filter((p) => p.codigoErp)
      .map((p) => ({
        codigo: p.codigoErp!,
        descricao: p.descricaoEtiqueta ?? `${p.familia} ${p.categoria}`.trim(),
        preco: p.valorVenda,
      }));
  }

  /** A lista numerada, do jeito que ela chega no WhatsApp. */
  private listarOpcoes(opcoes: OpcaoPeca[]): string {
    const linhas = opcoes.map(
      (o, i) =>
        `${i + 1} · ${o.codigo} · ${o.descricao.toUpperCase()} · ${this.emReais(o.preco)}`,
    );

    // UMA OPCAO SO AINDA PERGUNTA, e a frase precisa deixar claro que ha
    // saida: nao e "confirma ou nada", e "confirma ou manda o codigo certo".
    if (opcoes.length === 1) {
      return [
        'Achei uma só:',
        linhas[0],
        'É ela? Me responde 1 pra confirmar — ou manda o código, se for outra.',
      ].join('\n');
    }

    return [
      `Achei ${opcoes.length}. Qual delas?`,
      ...linhas,
      'Me responde com o número.',
    ].join('\n');
  }

  /**
   * O descritivo da peca, pelo codigo.
   *
   * Peca ausente do ERP NAO e erro: ela pode ainda nao ter sido sincronizada.
   * A foto entra com o codigo escrito e sem descricao — e por isso que a
   * tabela nao tem FK para produtos.
   */
  private async buscarNoErp(
    codigo: string | null,
  ): Promise<{ descricao: string | null; preco: number | null }> {
    if (!codigo) return { descricao: null, preco: null };

    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto) {
      this.logger.warn(
        `Peca ${codigo} nao encontrada no ERP — foto sem descritivo.`,
      );
      return { descricao: null, preco: null };
    }

    return {
      descricao:
        produto.descricaoEtiqueta ??
        `${produto.familia} ${produto.categoria}`.trim(),
      // `valorVenda` do ERP e o preco A VISTA — confirmado com o Lucas em
      // 28/08. O parcelado e derivado dele, nunca guardado.
      preco: produto.valorVenda,
    };
  }

  /** Como chamar a peca numa frase. Sem codigo, ela e so "a foto". */
  private rotulo(foto: FotoItem): string {
    return foto.codigoErp ? `a ${foto.codigoErp}` : 'a foto';
  }

  private confirmarAprovacao(
    aprovadas: FotoItem[],
    restantes: FotoItem[],
  ): string {
    const cabeca =
      aprovadas.length === 1
        ? `${aprovadas[0].codigoErp ?? 'Foto'} aprovada — já está no catálogo.`
        : `${aprovadas.length} fotos aprovadas — já estão no catálogo.`;

    return `${cabeca}${this.eSobraram(restantes)}`;
  }

  /**
   * O que ainda espera resposta — NOMEANDO a próxima.
   *
   * ==========================================================================
   * NÃO CRIE UMA PERGUNTA QUE VOCÊ NÃO SABE RESPONDER.
   *
   * Antes esta linha dizia só "Ainda tenho 1 esperando sua resposta", e em
   * 31/08 o Lucas respondeu o óbvio: "qual?". Aquele "qual?" não é veredito
   * nenhum, então cai nos agentes — e a conversa morre, porque a Anastasia não
   * sabe do que ele está falando.
   *
   * A saída não é ensinar a responder "qual?": é dizer o nome de uma vez. Um
   * aviso que provoca pergunta previsível está pela metade.
   * ==========================================================================
   */
  private eSobraram(restantes: FotoItem[]): string {
    if (restantes.length === 0) return '';
    if (restantes.length === 1) {
      return `\nAinda falta ${this.rotulo(restantes[0])}.`;
    }
    return (
      `\nAinda faltam ${restantes.length} — a próxima é ` +
      `${this.rotulo(restantes[0])}.`
    );
  }

  /**
   * O juro dito no texto. `null` quando nada foi dito.
   *
   * "SEM JUROS" VEM PRIMEIRO porque ele e uma afirmacao, e nao a falta de uma:
   * zero e um valor. Sem essa ordem, "10x sem juros" cairia no `null` e a peca
   * sairia com o acrescimo padrao — o oposto exato do que foi pedido.
   */
  private lerJuros(texto: string): number | null {
    if (RE_SEM_JUROS.test(normalizar(texto))) return 0;

    const m = texto.match(RE_JUROS);
    if (!m) return null;

    const valor = Number(m[1]);
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }

  private perguntarCatalogo(abertos: CatalogoAberto[]): string {
    const lista = abertos.map((c) => `#${c.numero} — ${c.nome}`).join('\n');
    return `De qual catálogo é?\n${lista}\n\nResponde com o número ou o nome.`;
  }

  private emReais(valor: number | null): string {
    if (valor === null) return '—';
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  /**
   * Levanta de volta a catraca da aprovacao a partir do banco.
   *
   * POR QUE EXISTE: a catraca vive em memoria, e um restart do container a
   * perde. As fotos continuam EM_APROVACAO — o trabalho esta salvo —, mas o
   * "aprovo" dela deixaria de ser reconhecido, e a tela nao aprova de
   * proposito. A pessoa ficaria sem saida nenhuma.
   *
   * Entao a proxima foto reconstroi: quem manda foto quase sempre tem outras
   * esperando resposta, e este e o unico caminho em que ja pagamos uma ida ao
   * banco de qualquer forma. So consulta com a catraca BAIXA — com ela
   * levantada nao ha nada a reconstruir.
   */
  private async rearmarAprovacao(de: string, remetente: string): Promise<void> {
    if (this.sessao.temEmAprovacao(de)) return;

    const fila = await this.catalogos.listarEmAprovacao(remetente.trim());
    if (fila.length > 0) this.sessao.marcarEmAprovacao(de);
  }

  /** Apaga do disco o que expirou sem ninguem dizer a que catalogo pertencia. */
  private async varrerExpiradas(): Promise<void> {
    const orfaos = this.sessao.limpar();
    await Promise.all(orfaos.map((c) => this.armazenamento.remover(c)));
  }
}

/** Minusculas, sem acento e sem pontuacao — para casar nome digitado no celular. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, ja separadas pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
