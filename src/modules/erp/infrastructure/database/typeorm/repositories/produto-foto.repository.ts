import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  FotoDaPeca,
  IProdutoFotoRepository,
  NovaFotoDaPeca,
} from '../../../../domain/ports/repositories/produto-foto-repository.port';
import { ProdutoFotoOrmEntity } from '../entities/produto-foto.orm-entity';

@Injectable()
export class ProdutoFotoRepository implements IProdutoFotoRepository {
  constructor(
    @InjectRepository(ProdutoFotoOrmEntity)
    private readonly repo: Repository<ProdutoFotoOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listar(produtoId: string): Promise<FotoDaPeca[]> {
    const linhas = await this.repo.find({
      where: { produtoId },
      order: { capa: 'DESC', posicao: 'ASC', criadoEm: 'ASC' },
    });
    return linhas.map(paraDominio);
  }

  async buscarPorId(id: string): Promise<FotoDaPeca | null> {
    const linha = await this.repo.findOne({ where: { id } });
    return linha ? paraDominio(linha) : null;
  }

  /**
   * A PRIMEIRA FOTO DA PECA NASCE CAPA, e a posicao sai do fim da fila — as
   * duas coisas na MESMA transacao.
   *
   * Sem transacao, duas fotos chegando juntas pelo WhatsApp leriam a mesma
   * contagem e nasceriam as duas como capa: a segunda seria recusada pelo
   * indice parcial e a foto se perderia, com a pessoa achando que entrou.
   */
  async adicionar(nova: NovaFotoDaPeca): Promise<FotoDaPeca> {
    return this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProdutoFotoOrmEntity);

      // ==================================================================
      // O LOCK E NA PECA, E NAO NAS FOTOS DELA — 20/10/2026.
      //
      // A primeira versao travava as linhas de `produto_fotos`. Serializava a
      // rajada quando ja havia foto — e nao serializava NADA na peca vazia,
      // porque nao havia linha para travar.
      //
      // Medido com dez insercoes simultaneas numa peca vazia: as posicoes
      // sairam `0,1,1,1,1,1,1,1,1,2`. Oito fotos na mesma posicao.
      //
      // `produtos` sempre tem a linha. Travando ELA, a capa e a posicao saem
      // certas no vazio e no cheio.
      // ==================================================================
      await m.query('SELECT 1 FROM produtos WHERE id = $1 FOR UPDATE', [
        nova.produtoId,
      ]);

      const existentes = await repo.find({
        where: { produtoId: nova.produtoId },
      });

      const temCapa = existentes.some((f) => f.capa);
      const ultima = existentes.reduce((n, f) => Math.max(n, f.posicao), -1);

      const linha = repo.create({
        produtoId: nova.produtoId,
        arquivoId: nova.arquivoId,
        mime: nova.mime,
        bytes: nova.bytes,
        origem: nova.origem,
        enviadoPor: nova.enviadoPor,
        capa: !temCapa,
        posicao: ultima + 1,
      });

      try {
        return paraDominio(await repo.save(linha));
      } catch (e) {
        // ==================================================================
        // A CORRIDA DA PRIMEIRA FOTO — 20/10/2026.
        //
        // O lock acima serializa a rajada, MAS so quando ja ha linha para
        // travar. Na peca vazia nao ha: dez fotos chegando juntas pelo
        // WhatsApp — dez eventos separados — podem ler "nao tem capa" ao
        // mesmo tempo e tentar nascer capa todas.
        //
        // Ai o indice `idx_produto_fotos_uma_capa` recusa as perdedoras, e sem
        // isto a foto SE PERDIA com um erro — a pessoa mandou dez e entraram
        // tres, sem saber quais.
        //
        // Perder a corrida da capa nao e erro: e so nao ser a primeira. Entao
        // a foto entra como as outras.
        // ==================================================================
        if (!linha.capa || !ehCapaDuplicada(e)) throw e;
        linha.capa = false;
        return paraDominio(await repo.save(linha));
      }
    });
  }

  async definirCapa(produtoId: string, fotoId: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProdutoFotoOrmEntity);
      // DESMARCA ANTES DE MARCAR, e na mesma transacao: o indice parcial
      // `idx_produto_fotos_uma_capa` recusa a segunda capa, e e assim que a
      // regra fica no banco em vez de num `if`.
      await repo.update({ produtoId, capa: true }, { capa: false });
      await repo.update({ id: fotoId, produtoId }, { capa: true });
    });
  }

  /**
   * Remove a linha e diz se o ARQUIVO ainda serve a outra peca.
   *
   * Se a removida era a capa, a proxima da fila assume — peca com fotos e sem
   * capa ficaria sem imagem na lista, que e o pior resultado possivel de
   * apagar uma foto.
   */
  async remover(
    id: string,
  ): Promise<{ arquivoId: string; aindaUsado: boolean } | null> {
    return this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProdutoFotoOrmEntity);
      const foto = await repo.findOne({ where: { id } });
      if (!foto) return null;

      await repo.delete({ id });

      if (foto.capa) {
        const proxima = await repo.findOne({
          where: { produtoId: foto.produtoId },
          order: { posicao: 'ASC', criadoEm: 'ASC' },
        });
        if (proxima) await repo.update({ id: proxima.id }, { capa: true });
      }

      const aindaUsado = await repo.exists({
        where: { arquivoId: foto.arquivoId },
      });
      return { arquivoId: foto.arquivoId, aindaUsado };
    });
  }

  async contar(produtoId: string): Promise<number> {
    return this.repo.count({ where: { produtoId } });
  }

  async capasDe(produtoIds: string[]): Promise<Map<string, string>> {
    if (produtoIds.length === 0) return new Map();
    const linhas = await this.repo.find({
      where: { produtoId: In(produtoIds), capa: true },
      select: { produtoId: true, arquivoId: true },
    });
    return new Map(linhas.map((l) => [l.produtoId, l.arquivoId]));
  }
}

/** O Postgres recusou por JA EXISTIR capa nesta peca? */
function ehCapaDuplicada(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /idx_produto_fotos_uma_capa/.test(msg);
}

function paraDominio(l: ProdutoFotoOrmEntity): FotoDaPeca {
  return {
    id: l.id,
    produtoId: l.produtoId,
    arquivoId: l.arquivoId,
    mime: l.mime,
    bytes: l.bytes,
    capa: l.capa,
    posicao: l.posicao,
    origem: l.origem,
    enviadoPor: l.enviadoPor,
    criadoEm: l.criadoEm,
  };
}
