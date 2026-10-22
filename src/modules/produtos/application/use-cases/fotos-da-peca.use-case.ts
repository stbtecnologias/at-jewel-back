import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LIMITE_FOTO_PECA_BYTES,
  MAX_FOTOS_POR_PECA,
  MIMES_IMAGEM,
  pastaDaFotoDeProduto,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import { ARMAZENAMENTO } from '../../../catalogos/domain/ports/injection-tokens';
import {
  PRODUTO_FOTO_REPOSITORY,
  PRODUTO_REPOSITORY,
} from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import type {
  FotoDaPeca,
  IProdutoFotoRepository,
} from '../../../erp/domain/ports/repositories/produto-foto-repository.port';
import type { ArquivoRecebido } from './foto-produto.use-case';

/** O que o painel e o WhatsApp recebem de volta. */
export interface FotoDaPecaDto {
  id: string;
  /** A chave no armazenamento — o painel monta `/midia/<chave>` com ela. */
  arquivoId: string;
  /** O tipo da imagem. Entrou em 22/10, quando a foto da peca passou a poder
   *  ir para dentro de um catalogo — ver RF32. */
  mime: string;
  caminho: string | null;
  capa: boolean;
  posicao: number;
  origem: 'PAINEL' | 'WHATSAPP';
  enviadoPor: string | null;
  criadoEm: Date;
}

/** O que foi guardado e o que foi recusado — a rajada nunca falha inteira. */
export interface ResultadoDoEnvio {
  guardadas: FotoDaPecaDto[];
  recusadas: { nome: string; motivo: string }[];
  total: number;
}

/**
 * AS FOTOS DA PECA — RF33, pedido do Lucas em 20/10/2026.
 *
 * ==========================================================================
 * A PECA TINHA UMA FOTO E PASSOU A TER VARIAS, vindas do painel ou do
 * WhatsApp, com uma marcada como CAPA.
 *
 * E o primeiro caminho em que a loja tem imagem PROPRIA de verdade. Medido em
 * 20/10: as 7.304 pecas ativas tem `foto_url` do ERP, 247 das 320 joias com
 * saldo tem URL cadastrada e so **55** a Conexa responde. Foto nossa nao da
 * 404.
 * ==========================================================================
 *
 * A RAJADA NAO FALHA INTEIRA. Dez fotos chegando juntas pelo WhatsApp, uma
 * acima do teto: guarda as nove e diz qual recusou. Recusar as dez por causa
 * de uma faria a pessoa remandar tudo.
 */
@Injectable()
export class FotosDaPecaUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(PRODUTO_FOTO_REPOSITORY)
    private readonly fotos: IProdutoFotoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  async listar(produtoId: string): Promise<FotoDaPecaDto[]> {
    await this.exigirProduto(produtoId);
    return (await this.fotos.listar(produtoId)).map((f) => this.paraDto(f));
  }

  /**
   * Guarda as fotos que chegaram, na ordem em que chegaram.
   *
   * A ORDEM DAS GRAVACOES E SERIAL de proposito: a posicao de cada uma sai do
   * fim da fila, e em paralelo duas leriam a mesma. O repositorio ja serializa
   * com lock, e aqui a serie preserva tambem a ordem em que ela mandou.
   */
  async adicionar(
    produtoId: string,
    arquivos: ArquivoRecebido[],
    quem: string | null,
    origem: 'PAINEL' | 'WHATSAPP',
  ): Promise<ResultadoDoEnvio> {
    const produto = await this.exigirProduto(produtoId);
    if (arquivos.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const jaTem = await this.fotos.contar(produtoId);
    const cabem = Math.max(0, MAX_FOTOS_POR_PECA - jaTem);

    const guardadas: FotoDaPecaDto[] = [];
    const recusadas: { nome: string; motivo: string }[] = [];

    for (const arquivo of arquivos) {
      const problema = this.problema(arquivo);
      if (problema) {
        recusadas.push({ nome: arquivo.originalname, motivo: problema });
        continue;
      }
      // O TETO SE ANUNCIA. Passar do limite em silencio faria a peca ficar com
      // menos fotos do que ela mandou, sem ninguem saber qual sumiu.
      if (guardadas.length >= cabem) {
        recusadas.push({
          nome: arquivo.originalname,
          motivo: `a peça já tem o máximo de ${MAX_FOTOS_POR_PECA} fotos`,
        });
        continue;
      }

      const chave = await this.armazenamento.guardar(
        {
          conteudo: arquivo.buffer,
          mime: arquivo.mimetype,
          nomeOriginal: arquivo.originalname,
        },
        // `||` E NAO `??`: a base tem peca com `codigo_erp` STRING VAZIA, nao
        // nula, e o `??` so cobre o nulo. Achado na conferencia de 20/10, com
        // a chave saindo `produtos//uuid.jpg` — barra dupla, e todas as pecas
        // sem codigo caindo na mesma pasta.
        pastaDaFotoDeProduto(produto.codigoErp?.trim() || produtoId),
      );
      const linha = await this.fotos.adicionar({
        produtoId,
        arquivoId: chave,
        mime: arquivo.mimetype,
        bytes: arquivo.size,
        origem,
        enviadoPor: quem,
      });
      guardadas.push(this.paraDto(linha));
    }

    return {
      guardadas,
      recusadas,
      total: jaTem + guardadas.length,
    };
  }

  /**
   * Anexa um arquivo QUE JÁ ESTÁ no armazenamento — 20/10/2026.
   *
   * É o caminho da foto que chegou pelo WhatsApp sem destino: ela foi gravada
   * na área de espera antes de qualquer pergunta (senão some com o WAHA em 30
   * minutos), e só depois a pessoa disse que era da peça. Aqui ela é MOVIDA
   * para a pasta da peça e registrada.
   *
   * Devolve `null` quando o arquivo não está mais lá — e aí quem chama avisa,
   * em vez de criar uma linha apontando para o nada.
   */
  async anexarExistente(
    produtoId: string,
    chaveAtual: string,
    mime: string,
    quem: string | null,
  ): Promise<FotoDaPecaDto | null> {
    const produto = await this.exigirProduto(produtoId);
    if ((await this.fotos.contar(produtoId)) >= MAX_FOTOS_POR_PECA) return null;

    const chave = await this.armazenamento.mover(
      chaveAtual,
      pastaDaFotoDeProduto(produto.codigoErp?.trim() || produtoId),
    );
    const arquivo = await this.armazenamento.ler(chave);
    if (!arquivo) return null;

    const linha = await this.fotos.adicionar({
      produtoId,
      arquivoId: chave,
      mime: arquivo.mime || mime,
      bytes: arquivo.conteudo.length,
      origem: 'WHATSAPP',
      enviadoPor: quem,
    });
    return this.paraDto(linha);
  }

  async definirCapa(produtoId: string, fotoId: string): Promise<FotoDaPecaDto[]> {
    await this.exigirProduto(produtoId);
    const foto = await this.fotos.buscarPorId(fotoId);
    if (!foto || foto.produtoId !== produtoId) {
      throw new NotFoundException('Foto não encontrada nesta peça');
    }
    await this.fotos.definirCapa(produtoId, fotoId);
    return this.listar(produtoId);
  }

  /**
   * Tira a foto da peca — e o arquivo do disco, SE mais ninguem o usa.
   *
   * A ordem e deliberada, e e a mesma do `FotoProdutoUseCase`: apaga a linha
   * primeiro. Falhar depois deixa um arquivo orfao, que e barato; na ordem
   * inversa, uma falha deixaria a linha apontando para um arquivo que ja nao
   * existe — e isso aparece como imagem quebrada no painel.
   */
  async excluir(produtoId: string, fotoId: string): Promise<FotoDaPecaDto[]> {
    await this.exigirProduto(produtoId);
    const foto = await this.fotos.buscarPorId(fotoId);
    if (!foto || foto.produtoId !== produtoId) {
      throw new NotFoundException('Foto não encontrada nesta peça');
    }

    const removida = await this.fotos.remover(fotoId);
    // A MESMA IMAGEM PODE SERVIR A OUTRA PECA — e o RF34. Apagar o arquivo
    // aqui deixaria a outra com a imagem quebrada.
    if (removida && !removida.aindaUsado) {
      await this.armazenamento.remover(removida.arquivoId);
    }
    return this.listar(produtoId);
  }

  private async exigirProduto(id: string) {
    const produto = await this.produtos.findById(id);
    if (!produto) throw new NotFoundException('Produto não encontrado');
    return produto;
  }

  /** Devolve o motivo da recusa, ou `null` quando o arquivo serve. */
  private problema(arquivo: ArquivoRecebido): string | null {
    if (!MIMES_IMAGEM.includes(arquivo.mimetype as (typeof MIMES_IMAGEM)[number])) {
      return `formato não aceito (${arquivo.mimetype}) — envie JPEG, PNG ou WebP`;
    }
    if (arquivo.size > LIMITE_FOTO_PECA_BYTES) {
      return `acima de ${Math.round(LIMITE_FOTO_PECA_BYTES / 1024 / 1024)} MB`;
    }
    return null;
  }

  private paraDto(f: FotoDaPeca): FotoDaPecaDto {
    return {
      id: f.id,
      arquivoId: f.arquivoId,
      mime: f.mime,
      caminho: this.armazenamento.caminhoPublico(f.arquivoId),
      capa: f.capa,
      posicao: f.posicao,
      origem: f.origem,
      enviadoPor: f.enviadoPor,
      criadoEm: f.criadoEm,
    };
  }
}
