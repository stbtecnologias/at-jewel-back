import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import { FotosDaPecaUseCase } from '../../../produtos/application/use-cases/fotos-da-peca.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
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
  ) {}

  /** Vale olhar a imagem que chegou como foto de peça? Só a catraca. */
  temPecaMirada(de: string): boolean {
    return this.sessao.pecaMirada(de) !== null;
  }

  /** O texto PARECE um comando de mirar? Teste barato, sem tocar no banco. */
  static pareceComando(texto: string | null | undefined): boolean {
    const t = (texto ?? '').trim();
    return t.length > 0 && (RE_MIRAR.test(t) || RE_PARAR.test(t));
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
