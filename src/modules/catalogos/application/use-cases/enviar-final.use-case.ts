import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  pastaDoCatalogo,
  PASTA_FINAIS,
  type IArmazenamento,
} from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type {
  CatalogoDetalhe,
  ICatalogoRepository,
} from '../../domain/ports/repositories/catalogo-repository.port';
import type { ArquivoRecebido } from './catalogos.use-cases';

/**
 * O que o marketing pode devolver.
 *
 * ==========================================================================
 * TRÊS FORMATOS PORQUE HÁ TRÊS JEITOS DE ENTREGAR, e não por indecisão:
 *
 *   PDF        o caso normal — export do InDesign, o que se manda por
 *              e-mail e o que se imprime
 *   ZIP        quando entregam uma imagem por página, para postar avulso
 *   PNG / JPG  peça de página única, para story
 * ==========================================================================
 *
 * A LISTA É FECHADA de propósito. Este é o único ponto do catálogo em que um
 * arquivo arbitrário entra por upload de gente, e o back o serve de volta pela
 * rota de mídia — aceitar `text/html` ou `image/svg+xml` seria hospedar HTML
 * executável no nosso domínio.
 */
const MIMES_ACEITOS = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Teto do arquivo final: 100 MB.
 *
 * O `LIMITE_BYTES` do catálogo é 12 MB, dimensionado para foto de celular. Um
 * PDF de catálogo saído do InDesign com trinta packshots em alta passa disso
 * sem esforço — 50 a 150 MB é comum. Reusar o limite da foto faria o envio
 * falhar justamente no caso para o qual ele existe.
 *
 * O CUSTO É MEMÓRIA: o multer segura o arquivo inteiro em RAM antes de ele ir
 * para o armazenamento, então dois envios simultâneos são 200 MB de pico. Com
 * o time atual é aceitável; se o catálogo virar rotina, o caminho é upload
 * direto para o S3 com URL assinada.
 */
export const LIMITE_FINAL_BYTES = 100 * 1024 * 1024;

/**
 * O catálogo montado FORA, devolvido pelo marketing.
 *
 * ==========================================================================
 * O SEGUNDO DOS DOIS CAMINHOS, e não um plano B.
 *
 * Quem já tem identidade visual e InDesign não vai trocar isso por um
 * montador. A exportação leva as fotos e o descritivo para lá; este use case
 * é a volta.
 * ==========================================================================
 *
 * NÃO APAGA NADA. O envio acrescenta uma versão e passa a valer por ser a mais
 * recente; a anterior — inclusive um PDF que o sistema tenha montado — continua
 * baixável. Ver a migração 44.
 */
@Injectable()
export class EnviarFinalUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * @param enviadoPor nome do staff, resolvido do JWT por quem chama. É rótulo
   *        de histórico: daqui a três meses, "quem mandou esta versão?" é a
   *        primeira pergunta.
   */
  async execute(
    catalogoId: string,
    arquivo: ArquivoRecebido | undefined,
    enviadoPor: string,
  ): Promise<CatalogoDetalhe> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    if (
      !MIMES_ACEITOS.includes(
        arquivo.mimetype as (typeof MIMES_ACEITOS)[number],
      )
    ) {
      throw new BadRequestException(
        `Formato não aceito (${arquivo.mimetype}). Envie PDF, ZIP, JPEG, PNG ou WebP.`,
      );
    }
    if (arquivo.size > LIMITE_FINAL_BYTES) {
      throw new BadRequestException(
        `Arquivo acima de ${Math.round(LIMITE_FINAL_BYTES / 1024 / 1024)} MB.`,
      );
    }

    const arquivoId = await this.armazenamento.guardar(
      {
        conteudo: arquivo.buffer,
        mime: arquivo.mimetype,
        nomeOriginal: arquivo.originalname,
      },
      pastaDoCatalogo(catalogo.numero, PASTA_FINAIS),
    );

    await this.repositorio.registrarFinal(catalogoId, {
      origem: 'MARKETING',
      arquivoId,
      // O nome ORIGINAL, e não o da chave: é por ele que a pessoa reconhece a
      // versão na lista, e "rosa-pink-v3-final.pdf" diz mais que um UUID.
      nomeArquivo: arquivo.originalname,
      mime: arquivo.mimetype,
      tamanhoBytes: arquivo.size,
      enviadoPor,
    });

    const atualizado = await this.repositorio.buscarPorId(catalogoId);
    if (!atualizado) throw new NotFoundException('Catálogo não encontrado');
    return atualizado;
  }
}
