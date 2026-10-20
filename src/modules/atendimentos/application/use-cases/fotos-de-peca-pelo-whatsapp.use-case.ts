import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import { FotosDaPecaUseCase } from '../../../produtos/application/use-cases/fotos-da-peca.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import { FotosDeProdutoService } from '../fotos-de-produto.service';
// O MESMO formatador que a agente ja usa nas listas: o valor da peca tem de
// sair escrito do mesmo jeito em todo lugar do canal.
import { moeda } from '../ferramentas-gestao.service';
import {
  CATALOGO_REPOSITORY,
  INTERPRETADOR_DESTINO,
} from '../../../catalogos/domain/ports/injection-tokens';
import type { IInterpretadorDeDestino } from '../../../catalogos/domain/ports/destino-da-foto.port';
import type { ICatalogoRepository } from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';
import type { FotoDoCanal, RespostaFoto } from './processar-foto-catalogo.use-case';

/**
 * QUEM PODE MANDAR FOTO PARA A PEÇA.
 *
 * É a mesma permissão do painel — e não a do catálogo. Desde a migração 75 ela
 * cobre ADMIN, ESTOQUISTA, GERENTE, GERENTE_VENDAS e MARKETING; o SUPERADMIN
 * entra pelo curinga.
 */
export const PERMISSAO_FOTO_DE_PECA = 'produtos:foto';

/**
 * O COMANDO QUE MIRA A PEÇA — RF33, 20/10/2026.
 *
 * *"produto BR26396"*, e então a rajada de fotos. Aceita o jeito curto e o
 * jeito falado, com ou sem "fotos do".
 *
 * NÃO CASA COM PERGUNTA: `quanto custa o BR26396?` tem ponto de interrogação e
 * não começa pela palavra da peça. Casar aqui roubaria a consulta de preço, que
 * é da agente.
 */
const RE_MIRAR =
  /^(?:(?:manda(?:r)?|sobe|subir|coloca(?:r)?|adiciona(?:r)?)\s+)?(?:(?:as?\s+)?fotos?\s+)?(?:(?:n[oa]s?|par[ao]|d[oa]s?|em)\s+)?(?:[ao]s?\s+)?(?:produto|pe[cç]a|item|ref(?:erencia|erência)?)\s*:?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,30})\s*$/i;

/** O que encerra o destino sem mirar outro. */
const RE_PARAR =
  /^(?:pronto|acabou|terminei|fim|chega|parar?|cancelar?|sai|sair)\s*$/i;

/**
 * O PEDIDO DE VER AS FOTOS — e a diferença dele para o de MIRAR é a preposição.
 *
 *   "fotos DO produto BR26396"    → ver     (de)
 *   "fotos PARA a peça BR26396"   → mirar   (destino)
 *   "produto BR26396"             → mirar
 *
 * É a distinção que o português já faz, e por isso ela é fácil de lembrar e de
 * explicar. O pedido é testado ANTES do mirar, senão "fotos do produto X"
 * abriria destino em vez de responder.
 */
const RE_QUAIS = [
  // "quais fotos o produto BR26396 tem?", "quantas fotos tem a peça BR26396"
  //
  // EXIGE A PALAVRA `fotos` E UM CODIGO DE VERDADE (duas letras e digitos).
  // Sem as duas coisas, "quantas pecas vendemos hoje?" casaria — e roubaria
  // da Anastasia uma pergunta que e dela.
  /^(?:quais|quantas|que)\s+(?:as\s+)?fotos?\b[^?]*?\b([A-Za-z]{2}\d{3,})\b[^?]*\??$/i,
  // "fotos do produto BR26396", "me manda as fotos da peça BR26396"
  /^(?:(?:me\s+)?(?:manda(?:r)?|mostra(?:r)?|envia(?:r)?|ver|lista(?:r)?|quero)\s+)?(?:as\s+)?fotos?\s+d[oa]s?\s+(?:[ao]s?\s+)?(?:produto|pe[cç]a|item|ref(?:erencia|erência)?)?\s*:?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,30})\s*\??$/i,
];

/** Teto do que ela recebe de volta. Ela PEDIU, então vale o teto maior. */
const ELA_PEDIU = true;

/**
 * "É DA PEÇA" — a resposta à pergunta de destino.
 *
 * A pergunta é a do catálogo, com a peça oferecida ao lado. Aceita a palavra
 * solta e o código, porque os dois são jeitos naturais de responder.
 */
const RE_E_DA_PECA =
  /^(?:(?:e|é|sim),?\s*)?(?:(?:par[ao]|d[ao]|n[ao])\s+)?(?:[ao]s?\s+)?(?:pe[cç]a|produto|item)\s*\.?$/i;

/**
 * O CODIGO DA PECA DENTRO DA RESPOSTA — `BR26396`, duas letras e digitos.
 *
 * E a unica parte que nao se deduz: catalogo tem numero de 4 digitos e nome,
 * peca tem esse formato. Mesmo assim ele e CONFERIDO contra o ERP antes de
 * valer — formato nao e existencia.
 */
const RE_CODIGO_NA_RESPOSTA = /\b([A-Za-z]{2}\d{3,})\b/;

/**
 * AS FOTOS DA PEÇA PELO WHATSAPP — RF33, pedido do Lucas em 20/10/2026.
 *
 * ==========================================================================
 * O DESTINO VIVE FORA DA FOTO, E TEM DE VIVER.
 *
 * O WhatsApp **não manda álbum**: dez fotos chegam como dez eventos separados,
 * e só a primeira costuma trazer legenda. Amarrar o destino à legenda faria as
 * outras nove caírem no catálogo — caladas, que é o pior desfecho.
 *
 * Então ela diz a peça UMA vez e manda quantas quiser. A janela se renova a
 * cada foto, porque fotografar vinte peças leva mais que meia hora.
 * ==========================================================================
 *
 * E VALE NOS DOIS NÚMEROS. O catálogo mora na Elena por decisão de 25/09, mas
 * foto de peça não é catálogo: a Anastasia também recebe.
 */
@Injectable()
export class FotosDePecaPeloWhatsappUseCase {
  private readonly logger = new Logger(FotosDePecaPeloWhatsappUseCase.name);

  constructor(
    private readonly sessao: SessaoCatalogoService,
    private readonly fotos: FotosDaPecaUseCase,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    // Quem BAIXA a imagem para mandar de volta. Desde o RF33 ele le a nossa
    // do armazenamento quando ha `chave`, e so cai na Conexa sem ela.
    private readonly imagens: FotosDeProdutoService,
    // Quem DEDUZ o destino da foto pendurada, em vez de exigir palavra certa.
    @Inject(INTERPRETADOR_DESTINO)
    private readonly destino: IInterpretadorDeDestino,
    @Inject(CATALOGO_REPOSITORY)
    private readonly catalogos: ICatalogoRepository,
  ) {}

  /** Vale olhar a imagem que chegou como foto de peça? Só a catraca. */
  temPecaMirada(de: string): boolean {
    return this.sessao.pecaMirada(de) !== null;
  }

  /** O texto PARECE um comando? Teste barato, sem tocar no banco. */
  static pareceComando(texto: string | null | undefined): boolean {
    const t = (texto ?? '').trim();
    if (t.length === 0) return false;
    return (
      RE_MIRAR.test(t) || RE_PARAR.test(t) || RE_QUAIS.some((r) => r.test(t))
    );
  }

  /**
   * "QUAIS FOTOS O PRODUTO BR26396 TEM?" — e as fotos vão junto.
   *
   * ==========================================================================
   * AS IMAGENS SAEM DEPOIS DO TEXTO, e quem as envia é o webhook. Devolvê-las
   * em `fotos` é o que garante a ordem: a frase diz quantas são, e aí elas
   * chegam. Mandá-las daqui as poria ANTES, e a pessoa veria quatro imagens
   * sem saber de que peça.
   *
   * A FOTO DO ERP TAMBÉM CONTA, e é dita como tal: a peça pode não ter
   * nenhuma nossa e ter a da Conexa — e aí a resposta não pode ser "não tem
   * foto".
   * ==========================================================================
   */
  async quais(de: string, texto: string): Promise<RespostaFoto | null> {
    const t = texto.trim();
    const codigo = RE_QUAIS.map((r) => t.match(r)?.[1])
      .find((c) => !!c)
      ?.toUpperCase();
    if (!codigo) return null;
    return this.asFotosDaPeca(de, codigo);
  }

  /**
   * AS FOTOS DE UM CÓDIGO JÁ RESOLVIDO.
   *
   * Separado de `quais` porque o código chega por dois caminhos: o do regex,
   * que é o atalho do caso óbvio, e o da dedução, quando a frase não casou com
   * nenhum padrão. A resposta tem de ser a MESMA pelos dois.
   */
  async asFotosDaPeca(de: string, codigo: string): Promise<RespostaFoto | null> {
    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto?.id) return null;

    const nossas = await this.fotos.listar(produto.id);
    const nome = produto.descricaoEtiqueta?.trim();
    const rotulo = nome ? `${codigo} — ${nome}` : codigo;

    // ======================================================================
    // O TEXTO DESCREVE, AS FOTOS VÃO LIMPAS — pedido do Lucas em 20/10/2026.
    //
    // Antes cada imagem levava legenda, e a legenda era a MESMA em todas: as
    // duas fotos da mesma peça chegavam carimbadas com a mesma frase. Para
    // quem recebe isso é ruído — e é foto que ela vai repassar para cliente.
    //
    // Então a descrição e o valor ficam numa mensagem SÓ, que vem antes, e as
    // imagens vão sem caption nenhum.
    //
    // E a palavra "capa" saiu junto: é vocabulário NOSSO. A capa continua
    // existindo — é a primeira da lista, e se define no painel.
    //
    // `valorVenda` é o preço À VISTA do ERP, o mesmo número que a agente já
    // diz nas listas. Peça sem valor sai sem a linha, em vez de "R$ 0".
    // ======================================================================
    // A ORDEM É A QUE O LUCAS PEDIU, e ela cabe numa linha:
    //
    //   referência — descrição — valor
    //
    // `valorVenda` é o preço à vista; não escrevo "à vista" porque a ficha é
    // para quem já sabe disso e vai copiar o número.
    const ficha =
      produto.valorVenda > 0
        ? `${rotulo} — ${moeda(produto.valorVenda)}`
        : rotulo;

    /** As fotos vão limpas — quem descreve é o texto, uma vez só. */
    const SEM_LEGENDA = '';

    // FALAMOS DESTA PEÇA. Não muda o destino das fotos — serve para a pergunta
    // de destino ter a opção certa, se uma imagem chegar em seguida.
    this.sessao.lembrarPecaFalada(de, {
      produtoId: produto.id,
      codigoErp: codigo,
      rotulo,
    });

    if (nossas.length === 0) {
      // SEM FOTO NOSSA, A DO ERP AINDA PODE EXISTIR — e ela vai, para a
      // resposta não ser um "não tem" que a peça desmente no painel.
      const doErp = await this.imagens.buscar(
        [
          {
            codigo,
            chave: null,
            url: produto.fotoUrl ?? null,
            legenda: SEM_LEGENDA,
          },
        ],
        ELA_PEDIU,
      );
      if (doErp.fotos.length > 0) {
        return {
          resposta: `${ficha}\nNão tem foto nossa ainda — essa é a do ERP. Me diz "produto ${codigo}" e manda as suas.`,
          motivo: 'fotos_da_peca_so_erp',
          fotos: doErp.fotos,
        };
      }
      return {
        resposta: `${ficha}\nEssa peça não tem nenhuma foto. Me diz "produto ${codigo}" e manda as suas.`,
        motivo: 'fotos_da_peca_nenhuma',
      };
    }

    const baixadas = await this.imagens.buscar(
      nossas.map((f, i) => ({
        codigo: `${codigo}-${i + 1}`,
        chave: f.arquivoId,
        url: null,
        legenda: SEM_LEGENDA,
      })),
      ELA_PEDIU,
    );

    // ======================================================================
    // A FICHA, E SÓ ELA — pedido do Lucas em 20/10.
    //
    // O "2 fotos, vão aí" saiu: as fotos chegam logo abaixo e se anunciam
    // sozinhas. Contar o que a pessoa está vendo é conversa que não acrescenta
    // — e esta mensagem ela repassa.
    //
    // COM UMA EXCEÇÃO, E ELA NÃO É TAGARELICE: quando nem todas couberam, a
    // frase volta. Mandar 10 de 14 e calar faria a peça PARECER ter 10, e
    // quem recebe não tem como desconfiar. O recorte que esconde diz que
    // escondeu.
    // ======================================================================
    const faltam = nossas.length - baixadas.fotos.length;
    return {
      resposta:
        faltam > 0
          ? `${ficha}\nSão ${nossas.length} fotos; mando ${baixadas.fotos.length} aqui, e as outras ${faltam} ficam no painel.`
          : ficha,
      motivo: 'fotos_da_peca',
      fotos: baixadas.fotos,
    };
  }

  /**
   * Mira a peça, ou encerra o destino.
   *
   * Devolve `null` quando o texto não era comando — e esse null é o contrato
   * com o roteador: segue para os agentes, como qualquer outro texto.
   */
  async mirar(de: string, texto: string): Promise<RespostaFoto | null> {
    const t = texto.trim();

    if (RE_PARAR.test(t)) {
      // SÓ RESPONDE SE HAVIA ALGO MIRADO. "pronto" solto, sem destino aberto,
      // é conversa normal e tem de seguir para a agente.
      if (!this.sessao.pecaMirada(de)) return null;
      this.sessao.esquecerPeca(de);
      // NAO FECHA PORTA QUE NAO PRECISA FECHAR — reparo do Lucas em 20/10.
      // "voltam a ser do catalogo" sugere que acabou a conversa de peca, e nao
      // acabou: a proxima foto pode ser de outra joia, e e so dizer qual.
      return {
        resposta:
          'Fechado. A próxima foto eu pergunto para onde vai — catálogo ou outra peça.',
        motivo: 'peca_encerrada',
      };
    }

    const m = t.match(RE_MIRAR);
    if (!m) return null;

    return this.mirarCodigo(de, m[1].trim().toUpperCase());
  }

  /**
   * MIRA UM CÓDIGO JÁ RESOLVIDO — o par de `asFotosDaPeca`.
   *
   * Separado pelo mesmo motivo: o código chega pelo regex ou pela dedução, e a
   * resposta tem de ser a mesma pelos dois caminhos.
   */
  async mirarCodigo(de: string, codigo: string): Promise<RespostaFoto | null> {
    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto?.id) {
      // NÃO MIRA NADA, e diz o código que tentou: "não achei" sem o código
      // deixa a pessoa sem saber se foi erro de digitação ou de cadastro.
      return {
        resposta: `Não achei a peça ${codigo} no sistema. Confere o código e me manda de novo.`,
        motivo: 'peca_nao_encontrada',
      };
    }

    const descricao = produto.descricaoEtiqueta?.trim();
    const rotulo = descricao ? `${codigo} — ${descricao}` : codigo;
    this.sessao.mirarPeca(de, {
      produtoId: produto.id,
      codigoErp: codigo,
      rotulo,
    });

    const quantas = (await this.fotos.listar(produto.id)).length;
    const jaTem =
      quantas === 0
        ? 'Ela ainda não tem foto nossa.'
        : `Ela já tem ${quantas} ${quantas === 1 ? 'foto' : 'fotos'}.`;

    return {
      resposta:
        `${rotulo}\n${jaTem} Manda as fotos — podem vir várias de uma vez, e ` +
        'todas entram nessa peça.\nQuando terminar, me diz "pronto" ou o código da próxima.',
      motivo: 'peca_mirada',
    };
  }

  /**
   * O TEXTO FALA DE FOTO E DE UMA PEÇA, mesmo sem casar com comando nenhum?
   *
   * ==========================================================================
   * É A CATRACA DA DEDUÇÃO, e ela é de assunto, não de fórmula.
   *
   * Duas condições, as duas baratas e nenhuma delas uma palavra mágica: a
   * mensagem fala em FOTO (ou imagem), que é o assunto, e traz algo com cara
   * de código de peça. Sem as duas, não há o que deduzir — e "quanto custa o
   * BR26318?" continua sendo pergunta da agente, porque não fala de foto.
   *
   * A existência da peça NÃO se decide aqui: formato não é existência, e quem
   * confere é o ERP, em `pedido`.
   * ==========================================================================
   */
  static pareceSobreFotoDePeca(texto: string | null | undefined): boolean {
    const t = (texto ?? '').trim();
    if (t.length === 0) return false;
    return /\b(fotos?|imagens?|imagem)\b/i.test(t) && RE_CODIGO_NA_RESPOSTA.test(t);
  }

  /**
   * VER OU MANDAR — a frase que nenhum padrão pegou.
   *
   * ==========================================================================
   * O CASO QUE ABRIU ISTO, em 20/10/2026:
   *
   *   *"Me envia as fotos que você tem da referência BR26318"*
   *
   * é um PEDIDO, e a agente respondeu *"pode mandar, de qual catálogo é?"* —
   * ofereceu catálogo a quem não ia mandar nada. O padrão não casou porque
   * entre "fotos" e o código havia "que você tem da referência", e padrão
   * nenhum vai cobrir todos os jeitos de dizer a mesma coisa.
   *
   * **O atalho do caso óbvio não pode ser a regra.** A mesma lição de hoje
   * cedo, com outra roupa.
   * ==========================================================================
   *
   * A ORDEM É: achar o código, CONFERIR NO ERP, e só então perguntar ao
   * modelo. Conferindo antes, a pergunta é sobre uma peça que existe e o
   * modelo só decide a direção da frase — que é o que ele faz bem.
   *
   * E sem provedor ela não fica muda: cai em VER, porque mandar as fotos de
   * volta se desfaz sozinho e abrir destino errado arquiva a próxima foto na
   * peça errada, calada.
   */
  async pedido(de: string, texto: string): Promise<RespostaFoto | null> {
    const codigo = texto.match(RE_CODIGO_NA_RESPOSTA)?.[1]?.toUpperCase();
    if (!codigo) return null;

    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto?.id) return null;

    const intencao = await this.intencaoSobreAPeca(texto, {
      codigo,
      descricao: produto.descricaoEtiqueta?.trim() ?? null,
    });

    if (intencao === 'ENVIAR') return this.mirarCodigo(de, codigo);
    if (intencao === 'VER') return this.asFotosDaPeca(de, codigo);
    return null;
  }

  /** O que o modelo disse, VALIDADO — nunca convertido. */
  private async intencaoSobreAPeca(
    texto: string,
    peca: { codigo: string; descricao: string | null },
  ): Promise<'VER' | 'ENVIAR' | null> {
    if (!this.destino.disponivel()) return 'VER';

    const cru = await this.destino.interpretarPedido(texto, peca);
    if (cru === null) return 'VER';

    const dito = (cru as { intencao?: unknown }).intencao;
    // VALIDADO, E NAO CONVERTIDO: intencao inventada pelo modelo nao vira
    // comando. Qualquer coisa fora das duas conhecidas e "nao decidi".
    if (dito === 'VER') return 'VER';
    if (dito === 'ENVIAR') return 'ENVIAR';
    return null;
  }

  /**
   * "É DA PEÇA" — a foto que já estava pendurada vai para ela.
   *
   * ==========================================================================
   * O CAMINHO DE QUEM MANDA A FOTO PRIMEIRO E DIZ DEPOIS.
   *
   * A imagem foi gravada na área de espera assim que chegou — tem de ser,
   * porque o WAHA apaga a mídia decifrada em 30 minutos e perguntar antes de
   * gravar perderia a foto de quem saiu para almoçar.
   *
   * Então ela está lá, esperando destino. Esta é a resposta que a traz para a
   * peça: o arquivo é MOVIDO da espera para a pasta da peça, e a peça fica
   * MIRADA — porque quem mandou uma vai mandar as outras.
   * ==========================================================================
   */
  async anexarPenduradas(
    de: string,
    texto: string,
    nomeRemetente: string,
  ): Promise<RespostaFoto | null> {
    if (!this.sessao.temPendentes(de)) return null;

    const t = texto.trim();
    // A PECA PODE VIR DA CONVERSA OU DA PROPRIA RESPOSTA — 20/10/2026.
    //
    // A memoria da sessao vive em RAM e morre em todo restart. Depender so
    // dela fazia o recurso sumir depois de subir codigo novo — foi o que o
    // Lucas viu. O codigo digitado na resposta vale igual.
    const peca = this.sessao.pecaFalada(de) ?? (await this.pecaDoTexto(t));
    if (!peca) return null;

    // ======================================================================
    // DEDUZIR, E NAO EXIGIR A PALAVRA CERTA — decisao do Lucas em 20/10/2026.
    //
    // O atalho deterministico continua, e ele e de graca: "peca", "produto",
    // o proprio codigo. Mas ele nao e a regra — e so o caso obvio resolvido
    // sem chamada. Tudo que nao for obvio vai para o modelo, que escolhe
    // DENTRE OS DESTINOS QUE EXISTEM.
    //
    // Sem modelo disponivel, sobra o atalho: pior que deduzir, melhor que
    // fechar o canal.
    // ======================================================================
    const obvio =
      RE_E_DA_PECA.test(t) || t.toUpperCase() === peca.codigoErp.toUpperCase();
    if (!obvio && !(await this.ehDaPecaPeloModelo(t, peca))) return null;

    const penduradas = this.sessao.recolherPendentes(de);
    if (penduradas.length === 0) return null;

    const entraram: string[] = [];
    const perdidas: number = penduradas.length;
    for (const p of penduradas) {
      const foto = await this.fotos
        .anexarExistente(peca.produtoId, p.arquivoId, p.mime, nomeRemetente)
        .catch(() => null);
      if (foto) entraram.push(foto.id);
    }

    if (entraram.length === 0) {
      return {
        resposta: `Não consegui anexar em ${peca.codigoErp}. Manda a foto de novo?`,
        motivo: 'anexo_na_peca_falhou',
      };
    }

    // A PEÇA FICA MIRADA: quem mandou uma foto vai mandar as outras, e
    // perguntar de novo a cada imagem seria pior que não ter perguntado.
    this.sessao.mirarPeca(de, peca);

    const total = (await this.fotos.listar(peca.produtoId)).length;
    const faltou =
      entraram.length < perdidas
        ? ` ${perdidas - entraram.length} não entrou.`
        : '';
    return {
      resposta:
        `${entraram.length === 1 ? 'Anexada' : `${entraram.length} anexadas`} em ` +
        `${peca.codigoErp} — ela tem ${total} agora.${faltou}\n` +
        'As próximas vão para ela também. Quando terminar, me diz "pronto" — ' +
        'ou o código de outra peça.',
      motivo: 'anexo_na_peca',
    };
  }

  /**
   * A peça que ela citou NA PRÓPRIA RESPOSTA.
   *
   * "BR26396", "é do BR26396", "do brinco BR26396" — o código é a única parte
   * que não se adivinha, e ele é conferido contra o ERP. Código que não existe
   * devolve `null`, e a resposta segue para o catálogo.
   */
  private async pecaDoTexto(
    texto: string,
  ): Promise<{ produtoId: string; codigoErp: string; rotulo: string } | null> {
    const codigo = texto.match(RE_CODIGO_NA_RESPOSTA)?.[1]?.toUpperCase();
    if (!codigo) return null;

    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto?.id) return null;

    const nome = produto.descricaoEtiqueta?.trim();
    return {
      produtoId: produto.id,
      codigoErp: codigo,
      rotulo: nome ? `${codigo} — ${nome}` : codigo,
    };
  }

  /**
   * O modelo escolhe DENTRE OS DESTINOS QUE EXISTEM — e nada além.
   *
   * O retorno é VALIDADO, nunca convertido: o modelo pode escrever qualquer
   * coisa, e só `destino === 'PECA'` conta. Qualquer outra forma — `CATALOGO`,
   * `NENHUM`, campo ausente, JSON torto — devolve `false`, e a resposta segue
   * para o catálogo, que é o caminho de sempre.
   *
   * NA DÚVIDA, NÃO. Perguntar de novo é barato; publicar no lugar errado não
   * se desfaz sozinho.
   */
  private async ehDaPecaPeloModelo(
    texto: string,
    peca: { codigoErp: string; rotulo: string },
  ): Promise<boolean> {
    if (!this.destino.disponivel()) return false;

    const abertos = await this.catalogos.listarAbertos();
    const cru = await this.destino.interpretar(texto, {
      catalogos: abertos.map((c) => ({ numero: c.numero, nome: c.nome })),
      peca: {
        codigo: peca.codigoErp,
        descricao: peca.rotulo.split('—')[1]?.trim() ?? null,
      },
    });

    return (
      typeof cru === 'object' &&
      cru !== null &&
      (cru as { destino?: unknown }).destino === 'PECA'
    );
  }

  /**
   * A foto que chegou com uma peça mirada.
   *
   * Devolve `null` quando não há peça mirada — e aí a imagem segue o caminho
   * de sempre, que é o do catálogo.
   */
  async foto(msg: FotoDoCanal): Promise<RespostaFoto | null> {
    const peca = this.sessao.pecaMirada(msg.de);
    if (!peca) return null;

    if (!msg.imagem.url) {
      return {
        resposta: 'Chegou a foto mas sem o arquivo. Pode mandar de novo?',
        motivo: 'imagem_sem_url',
      };
    }

    const arquivo = await this.whatsapp.baixarMidia(msg.imagem.url);
    if (!arquivo) {
      return {
        resposta: `Chegou a foto de ${peca.codigoErp} mas não consegui baixar o arquivo. Pode mandar de novo?`,
        motivo: 'imagem_download_falhou',
      };
    }

    try {
      const r = await this.fotos.adicionar(
        peca.produtoId,
        [
          {
            buffer: arquivo.conteudo,
            mimetype: arquivo.mimetype,
            // O WhatsApp nao manda nome de arquivo; o codigo da peca e o que
            // identifica a foto numa recusa.
            originalname: `${peca.codigoErp}.jpg`,
            size: arquivo.conteudo.length,
          },
        ],
        msg.nomeRemetente,
        'WHATSAPP',
      );

      if (r.recusadas.length > 0) {
        return {
          resposta: `Essa não entrou em ${peca.codigoErp}: ${r.recusadas[0].motivo}.`,
          motivo: 'foto_de_peca_recusada',
        };
      }

      // ====================================================================
      // UMA CONFIRMAÇÃO POR FOTO ESTOURA O LIMITE DE ENVIO — 20/10/2026.
      //
      // `LimiteDeEnvioService` corta em **30 mensagens por hora** para o mesmo
      // destino. Trinta fotos numa rajada viram trinta confirmações, e a
      // trigésima primeira mensagem — qualquer uma, inclusive a resposta de
      // outra pergunta — não sai. A agente emudece sem ninguém entender.
      //
      // O Lucas pediu que entre tudo, "do jeito que for". Entra: o que se
      // corta é a TAGARELICE, não a foto.
      //
      // Então confirma a primeira, depois a cada cinco — e o total vem no
      // "pronto". A primeira resposta DIZ essa regra, senão o silêncio entre
      // a 2ª e a 5ª parece engasgo.
      // ====================================================================
      if (r.total === 1) {
        return {
          resposta:
            `Primeira foto de ${peca.codigoErp} — ela já é a capa.\n` +
            'Pode mandar quantas quiser; eu confirmo a cada cinco e dou o ' +
            'total quando você disser "pronto".',
          motivo: 'foto_de_peca_guardada',
        };
      }
      if (r.total % 5 === 0) {
        return {
          resposta: `${r.total} fotos em ${peca.codigoErp}.`,
          motivo: 'foto_de_peca_guardada',
        };
      }
      // SEM TEXTO, E NAO E SILENCIO DE DEFEITO: a foto entrou, e o webhook
      // trata `null` como "nao ha o que responder". O recibo do WhatsApp ja
      // diz que chegou; o que estava faltando era o numero, e ele vem.
      return { resposta: null, motivo: 'foto_de_peca_guardada' };
    } catch (e) {
      this.logger.warn(
        `Foto de peça ${peca.codigoErp} não entrou: ${(e as Error).message}`,
      );
      return {
        resposta: `Não consegui guardar essa foto em ${peca.codigoErp}. Tenta de novo?`,
        motivo: 'foto_de_peca_falhou',
      };
    }
  }
}
