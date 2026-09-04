import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  pastaDaFotoDeProduto,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import { ARMAZENAMENTO } from '../../../catalogos/domain/ports/injection-tokens';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';

/** O que o multer entrega. Mesma forma usada pelo catalogo. */
export interface ArquivoRecebido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface FotoDoProduto {
  /** Chave no armazenamento, ou `null` se a foto foi removida. */
  fotoArquivoId: string | null;
  /** Caminho relativo para o `<img src>`, ou `null`. */
  caminho: string | null;
}

/**
 * A foto de produto que a LOJA sobe — a que ganha da foto do ERP.
 *
 * Existe porque a imagem do ERP nao cobre tudo e nao e nossa: em 03/09/2026,
 * 448 das 6.939 pecas nao tinham nenhuma no servidor da Conexa, e tudo que
 * entrou de 28/08 em diante veio sem. Sem este caminho, peca nova — que e
 * justamente a que vai para catalogo novo — fica sem imagem no painel.
 *
 * A CHAVE VAI PARA UMA COLUNA SO NOSSA (`foto_arquivo_id`). O motivo esta na
 * migracao 47 e no `toOrm` do repositorio: gravar na `foto_url` faria a
 * sincronizacao seguinte do Safira apagar a foto subida.
 */
@Injectable()
export class FotoProdutoUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  async subir(id: string, arquivo: ArquivoRecebido | undefined): Promise<FotoDoProduto> {
    if (!arquivo) throw new BadRequestException('Nenhum arquivo enviado');
    this.validar(arquivo);

    const produto = await this.produtos.findById(id);
    if (!produto) throw new NotFoundException('Produto não encontrado');

    // A pasta sai do CODIGO. Sem codigo — peca cadastrada a mao, que existe —
    // cai no id: e feio no bucket, mas nunca colide, e a alternativa seria
    // recusar a foto de uma peca legitima.
    const pasta = pastaDaFotoDeProduto(produto.codigoErp ?? id);
    const chave = await this.armazenamento.guardar(
      {
        conteudo: arquivo.buffer,
        mime: arquivo.mimetype,
        nomeOriginal: arquivo.originalname,
      },
      pasta,
    );

    // A ORDEM IMPORTA: grava a linha ANTES de apagar a antiga. Se o banco
    // falhar, sobra um arquivo orfao no bucket — barato. Na ordem inversa, uma
    // falha deixaria a linha apontando para um arquivo que ja nao existe.
    const anterior = produto.fotoArquivoId;
    await this.produtos.definirFotoArquivo(id, chave);
    if (anterior && anterior !== chave) {
      await this.armazenamento.remover(anterior);
    }

    return { fotoArquivoId: chave, caminho: this.armazenamento.caminhoPublico(chave) };
  }

  /** Tira a foto nossa. A peca volta a exibir a do ERP, se houver. */
  async remover(id: string): Promise<FotoDoProduto> {
    const produto = await this.produtos.findById(id);
    if (!produto) throw new NotFoundException('Produto não encontrado');

    if (produto.fotoArquivoId) {
      await this.produtos.definirFotoArquivo(id, null);
      await this.armazenamento.remover(produto.fotoArquivoId);
    }
    return { fotoArquivoId: null, caminho: null };
  }

  private validar(arquivo: ArquivoRecebido): void {
    if (!MIMES_IMAGEM.includes(arquivo.mimetype as (typeof MIMES_IMAGEM)[number])) {
      throw new BadRequestException(
        `Formato não aceito (${arquivo.mimetype}). Envie JPEG, PNG ou WebP.`,
      );
    }
    if (arquivo.size > LIMITE_BYTES) {
      throw new BadRequestException(
        `Arquivo acima de ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB`,
      );
    }
  }
}
