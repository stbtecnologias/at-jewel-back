import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  pastaDoCatalogo,
  PASTA_FOTOS,
  type IArmazenamento,
} from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
  TRATAMENTO_IMAGEM,
} from '../../domain/ports/injection-tokens';
import type {
  FotoItem,
  ICatalogoRepository,
  ReferenciaItem,
} from '../../domain/ports/repositories/catalogo-repository.port';
import type { ITratamentoImagem } from '../../domain/ports/tratamento-imagem.port';

/**
 * Teto de geracoes por foto.
 *
 * Cada tentativa custa dinheiro e uns 20 segundos. Tres da margem para a pessoa
 * ajustar o pedido duas vezes; depois disso o problema provavelmente nao e o
 * prompt — e a foto de origem, ou uma expectativa que o modelo nao alcanca. Ai
 * sai mais barato ela mandar a versao tratada por fora.
 */
export const MAX_GERACOES = 3;

export interface ResultadoTratamento {
  foto: FotoItem;
  /** O que dizer a pessoa. Null quando nao ha o que dizer. */
  recado: string | null;
}

/**
 * Trata a foto da peca conforme o padrao do catalogo, e a deixa esperando
 * aprovacao.
 *
 * ==========================================================================
 * O ORIGINAL NUNCA E TOCADO.
 *
 * `arquivo_original_id` aponta para `catalogo/0001/originais/…` e fica ali para
 * sempre; `arquivo_id` aponta para a versao tratada, em `fotos/`. Sao duas
 * colunas por isso: reprovar precisa poder gerar de novo A PARTIR DO ORIGINAL,
 * e nao de cima de um tratamento anterior — tratar o tratado degrada a imagem a
 * cada rodada.
 * ==========================================================================
 *
 * FALHAR AQUI NAO PERDE NADA. A foto ja esta gravada e a pessoa ja foi
 * respondida antes de o tratamento comecar. Se a IA nao responde, a foto volta
 * para RECEBIDA e segue utilizavel: o packshot cru ja serve para conferir
 * enquadramento e se a peca certa foi fotografada.
 */
@Injectable()
export class TratarFotoUseCase {
  private readonly logger = new Logger(TratarFotoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly catalogos: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(TRATAMENTO_IMAGEM)
    private readonly ia: ITratamentoImagem,
  ) {}

  /**
   * @param pedidoDaPessoa o que ela escreveu de estilo ("fundo rosa"), tanto na
   *        primeira vez quanto ao reprovar ("mais claro").
   */
  async execute(
    fotoId: string,
    pedidoDaPessoa: string | null,
  ): Promise<ResultadoTratamento | null> {
    const foto = await this.catalogos.buscarFotoPorId(fotoId);
    if (!foto) return null;

    if (foto.versoes >= MAX_GERACOES) {
      return {
        foto,
        recado:
          `Já tentei ${MAX_GERACOES} vezes nesta peça. ` +
          'Se ainda não ficou bom, manda a imagem tratada por fora que eu coloco no catálogo.',
      };
    }

    const catalogo = await this.catalogos.buscarPorId(foto.catalogoId);
    if (!catalogo) return null;

    // A foto de origem e SEMPRE a original, nunca a versao anterior — ver o
    // cabecalho. Sem `arquivo_original_id` nao ha o que tratar.
    if (!foto.arquivoOriginalId) {
      this.logger.warn(`Foto ${fotoId} sem arquivo original — nada a tratar.`);
      return null;
    }

    const original = await this.armazenamento.ler(foto.arquivoOriginalId);
    if (!original) {
      this.logger.error(
        `Original de ${fotoId} nao encontrado no armazenamento.`,
      );
      return null;
    }

    await this.catalogos.atualizarFoto(fotoId, { status: 'PROCESSANDO' });

    // O TEMA DO CATALOGO NAO VEM PARA CA — 16/09/2026.
    //
    // Em 15/09 as observacoes e as paginas de referencia passaram a descer
    // para esta foto, e "tema praiano" virou fundo bege atras da joia. O
    // Lucas corrigiu: o tema e do CATALOGO — capa, pagina e a peca na
    // modelo —, e quem o aplica e a montagem. O packshot e branco.
    const tratada = await this.ia.tratar({
      original,
      padrao: this.padraoEscrito(catalogo.referencias),
      pedidoDaPessoa,
    });

    if (!tratada) {
      // Volta ao estado de antes: a foto continua valendo como packshot cru.
      const semTratar = await this.catalogos.atualizarFoto(fotoId, {
        status: 'RECEBIDA',
      });
      return {
        foto: semTratar,
        // O COMANDO VAI ESCRITO — 16/09/2026. "Da para tentar de novo" nao
        // dizia COMO, e nao havia como: a foto ficava RECEBIDA, fora da
        // aprovacao e do painel. Agora o canal lembra dela e o "tenta de
        // novo" a refaz a partir do original.
        recado:
          'Não consegui tratar essa imagem agora — a foto está guardada. ' +
          'Responde "tenta de novo" que eu refaço, ou manda outra foto.',
      };
    }

    const chave = await this.armazenamento.guardar(
      {
        conteudo: tratada.conteudo,
        mime: tratada.mime,
        nomeOriginal: 'tratada',
      },
      pastaDoCatalogo(catalogo.numero, PASTA_FOTOS),
    );

    const atualizada = await this.catalogos.atualizarFoto(fotoId, {
      arquivoId: chave,
      mime: tratada.mime,
      status: 'EM_APROVACAO',
      versoes: foto.versoes + 1,
      // Tratamento novo invalida aprovacao antiga: quem aprovou aprovou OUTRA
      // imagem, e deixar o carimbo faria parecer que esta ja passou.
      aprovadoPor: null,
      aprovadoEm: null,
    });

    return { foto: atualizada, recado: null };
  }

  /**
   * O padrao ESCRITO da colecao: so a COMPOSICAO ("peca centralizada").
   *
   * Vem do banco e nao de constante no codigo porque e o que muda entre
   * colecoes — e quem muda e o marketing, pela tela, sem deploy.
   *
   * FICAM DE FORA a FONTE (o packshot nao tem texto — 15/09) e a OBSERVACAO,
   * que e o tema e vai para a montagem (16/09).
   */
  private padraoEscrito(referencias: ReferenciaItem[]): string | null {
    const textos = referencias
      .filter((r) => r.tipo === 'COMPOSICAO' && r.valor?.trim())
      .map((r) => `composicao: ${r.valor.trim()}`);

    return textos.length ? textos.join('; ') : null;
  }
}
