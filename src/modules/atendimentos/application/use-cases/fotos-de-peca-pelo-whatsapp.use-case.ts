import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import { FotosDaPecaUseCase } from '../../../produtos/application/use-cases/fotos-da-peca.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import { FotosDeProdutoService } from '../fotos-de-produto.service';
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

    const produto = await this.produtos.findByCodigoErp(codigo);
    if (!produto?.id) return null;

    const nossas = await this.fotos.listar(produto.id);
    const nome = produto.descricaoEtiqueta?.trim();
    const rotulo = nome ? `${codigo} — ${nome}` : codigo;

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
        [{ codigo, chave: null, url: produto.fotoUrl ?? null, legenda: rotulo }],
        ELA_PEDIU,
      );
      if (doErp.fotos.length > 0) {
        return {
          resposta: `${rotulo}\nNão tem foto nossa ainda — essa é a do ERP. Me diz "produto ${codigo}" e manda as suas.`,
          motivo: 'fotos_da_peca_so_erp',
          fotos: doErp.fotos,
        };
      }
      return {
        resposta: `${rotulo}\nEssa peça não tem nenhuma foto. Me diz "produto ${codigo}" e manda as suas.`,
        motivo: 'fotos_da_peca_nenhuma',
      };
    }

    const baixadas = await this.imagens.buscar(
      nossas.map((f, i) => ({
        codigo: `${codigo}-${i + 1}`,
        chave: f.arquivoId,
        url: null,
        legenda: f.capa ? `${rotulo} — capa` : rotulo,
      })),
      ELA_PEDIU,
    );

    // O RECORTE QUE ESCONDE DIZ QUE ESCONDEU. Mandar 10 de 14 e calar faria a
    // peça parecer ter 10.
    const faltam = nossas.length - baixadas.fotos.length;
    const quantas = `${nossas.length} ${nossas.length === 1 ? 'foto' : 'fotos'}`;
    return {
      resposta:
        `${rotulo}\n${quantas}` +
        (faltam > 0
          ? `, e eu mando ${baixadas.fotos.length} aqui — as outras ${faltam} ficam no painel.`
          : nossas.length === 1
            ? ', vai aí.'
            : ', vão aí — a capa é a primeira.'),
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
      return {
        resposta: 'Fechado — as próximas fotos voltam a ser do catálogo.',
        motivo: 'peca_encerrada',
      };
    }

    const m = t.match(RE_MIRAR);
    if (!m) return null;

    const codigo = m[1].trim().toUpperCase();
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
    const peca = this.sessao.pecaFalada(de);
    if (!peca) return null;

    const t = texto.trim();
    const ehDela =
      RE_E_DA_PECA.test(t) || t.toUpperCase() === peca.codigoErp.toUpperCase();
    if (!ehDela) return null;

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
        'As próximas fotos vão para ela também. "pronto" quando terminar.',
      motivo: 'anexo_na_peca',
    };
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

      // A CONTAGEM EM TODA RESPOSTA, e é o que dá para conferir no fim da
      // rajada: dez fotos mandadas e "10ª foto" na última é a prova de que
      // nenhuma se perdeu no caminho.
      const ordinal = `${r.total}ª foto`;
      return {
        resposta:
          r.total === 1
            ? `Primeira foto de ${peca.codigoErp} — ela já é a capa.`
            : `${ordinal} de ${peca.codigoErp}.`,
        motivo: 'foto_de_peca_guardada',
      };
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
