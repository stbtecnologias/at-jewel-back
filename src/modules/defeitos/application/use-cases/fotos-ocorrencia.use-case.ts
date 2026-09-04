import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  pastaDaOcorrencia,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import { ARMAZENAMENTO } from '../../../catalogos/domain/ports/injection-tokens';
import { DEFEITO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type {
  FotoOcorrencia,
  IDefeitoRepository,
} from '../../domain/ports/repositories/defeito-repository.port';

/** O que o multer entrega. Mesma forma usada pelo catalogo e pelo produto. */
export interface ArquivoRecebido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * As fotos de uma ocorrencia — MEL-20.
 *
 * ==========================================================================
 * POR QUE FOTO IMPORTA AQUI.
 *
 * O registro de um defeito e uma frase escrita por quem recebeu a peca de
 * volta: "veio com arranhao". Semanas depois, quando alguem for cobrar o
 * fornecedor ou decidir se troca, essa frase nao prova nada — e a peca ja foi.
 *
 * A foto e a unica coisa que atravessa o tempo. Por isso ela e do EPISODIO e
 * nao da peca: a mesma peca pode voltar tres vezes, e as fotos de cada volta
 * contam historias diferentes.
 * ==========================================================================
 *
 * SO IMAGEM, e o teto e o da foto de celular. Diferente da referencia de
 * catalogo, que aceita PDF de grafica: aqui nao ha peca de arte, ha prova.
 */
@Injectable()
export class FotosOcorrenciaUseCase {
  constructor(
    @Inject(DEFEITO_REPOSITORY)
    private readonly repo: IDefeitoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  async anexar(
    ocorrenciaId: string,
    arquivos: ArquivoRecebido[],
  ): Promise<FotoOcorrencia[]> {
    if (arquivos.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const ocorrencia = await this.repo.buscarPorId(ocorrenciaId);
    if (!ocorrencia) throw new NotFoundException('Ocorrência não encontrada');

    // VALIDA TODOS ANTES DE GRAVAR QUALQUER UM. Com cinco arquivos e o quarto
    // recusado, tres ja teriam sido gravados e a pessoa receberia um erro com
    // metade do trabalho feito — sem saber qual metade.
    for (const arquivo of arquivos) this.validar(arquivo);

    const criadas: FotoOcorrencia[] = [];
    // Em serie: a ordem das fotos e a ordem em que foram enviadas, e
    // `anexarFoto` calcula MAX(ordem)+1.
    for (const arquivo of arquivos) {
      const chave = await this.armazenamento.guardar(
        {
          conteudo: arquivo.buffer,
          mime: arquivo.mimetype,
          nomeOriginal: arquivo.originalname,
        },
        pastaDaOcorrencia(ocorrenciaId),
      );

      criadas.push(
        await this.repo.anexarFoto(ocorrenciaId, {
          arquivoId: chave,
          mime: arquivo.mimetype,
          nomeArquivo: arquivo.originalname || null,
        }),
      );
    }

    return criadas;
  }

  async remover(ocorrenciaId: string, fotoId: string): Promise<void> {
    const chave = await this.repo.removerFoto(ocorrenciaId, fotoId);
    if (!chave) throw new NotFoundException('Foto não encontrada');

    // A LINHA SAI PRIMEIRO, o arquivo depois. Se o armazenamento falhar, sobra
    // um arquivo orfao — barato. Na ordem inversa, uma falha do banco deixaria
    // a linha apontando para um arquivo que ja nao existe.
    await this.armazenamento.remover(chave);
  }

  private validar(arquivo: ArquivoRecebido): void {
    if (
      !MIMES_IMAGEM.includes(arquivo.mimetype as (typeof MIMES_IMAGEM)[number])
    ) {
      throw new BadRequestException(
        `"${arquivo.originalname}" não é uma imagem (${arquivo.mimetype}). Envie JPEG, PNG ou WebP.`,
      );
    }
    if (arquivo.size > LIMITE_BYTES) {
      throw new BadRequestException(
        `"${arquivo.originalname}" tem ${Math.round(arquivo.size / 1024 / 1024)} MB — o limite é ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB.`,
      );
    }
  }
}
