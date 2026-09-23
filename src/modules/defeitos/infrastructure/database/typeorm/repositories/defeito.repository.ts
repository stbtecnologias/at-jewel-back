import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Defeito } from '../../../../domain/entities/defeito.entity';
import type {
  AtualizarDefeitoData,
  DefeitoKpis,
  FiltroDefeito,
  FiltroKpiDefeito,
  FotoOcorrencia,
  IDefeitoRepository,
  ResultadoPaginadoDefeito,
} from '../../../../domain/ports/repositories/defeito-repository.port';
import { DefeitoOrmEntity } from '../entities/defeito.orm-entity';
import { OcorrenciaFotoOrmEntity } from '../entities/ocorrencia-foto.orm-entity';

/** O que a consulta de nomes devolve — nomes de coluna do Postgres. */
interface LinhaDeNomes {
  id: string;
  produto_codigo: string | null;
  produto_descricao: string | null;
  cliente_nome: string | null;
}

/** O mesmo, em camelCase, do jeito que a entidade recebe. */
interface NomesDaLinha {
  produtoCodigo: string | null;
  produtoDescricao: string | null;
  clienteNome: string | null;
}

@Injectable()
export class DefeitoRepository implements IDefeitoRepository {
  constructor(
    @InjectRepository(DefeitoOrmEntity)
    private readonly repo: Repository<DefeitoOrmEntity>,
    @InjectRepository(OcorrenciaFotoOrmEntity)
    private readonly repoFotos: Repository<OcorrenciaFotoOrmEntity>,
  ) {}

  async criar(defeito: Defeito): Promise<Defeito> {
    const entity = this.repo.create(this.toOrm(defeito));
    const saved = await this.repo.save(entity);
    return this.toDomain(saved);
  }

  async listar(filtro: FiltroDefeito): Promise<ResultadoPaginadoDefeito> {
    const where = this.montarWhere(filtro);
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { data: 'DESC' },
      skip: (filtro.page - 1) * filtro.limit,
      take: filtro.limit,
    });
    // AS FOTOS DA PAGINA NUMA CONSULTA SO, e nao uma por linha: com 20
    // ocorrencias na tela, o caminho ingenuo seriam 20 idas ao banco.
    const ids = rows.map((r) => r.id);
    const [fotos, nomes] = await Promise.all([this.fotosDe(ids), this.nomesDe(ids)]);
    return {
      data: rows.map((r) => this.toDomain(r, fotos.get(r.id) ?? [], nomes.get(r.id))),
      total,
    };
  }

  async buscarPorId(id: string): Promise<Defeito | null> {
    const row = await this.repo.findOneBy({ id });
    if (!row) return null;
    const [fotos, nomes] = await Promise.all([this.fotosDe([id]), this.nomesDe([id])]);
    return this.toDomain(row, fotos.get(id) ?? [], nomes.get(id));
  }

  /**
   * OS NOMES DA PAGINA NUMA CONSULTA SO — mesmo desenho do `fotosDe` acima, e
   * pelo mesmo motivo: com 20 ocorrencias na tela, o caminho ingenuo seriam 20
   * idas ao banco. A alternativa que existia era pior ainda — o navegador
   * baixar as 7.116 pecas do catalogo para traduzir um punhado de linhas.
   *
   * OS DOIS JOINs SAO `LEFT`, e nao e detalhe: produto apagado nao pode sumir
   * com a ocorrencia. Ela existe justamente para sobreviver a peca — e a foto
   * dela e a prova que atravessa o tempo. Com `INNER`, apagar a peca apagaria
   * a prova da tela.
   */
  private async nomesDe(ids: string[]): Promise<Map<string, NomesDaLinha>> {
    const mapa = new Map<string, NomesDaLinha>();
    if (ids.length === 0) return mapa;

    const linhas: LinhaDeNomes[] = await this.repo.manager.query(
      `SELECT d.id,
              p.codigo_erp         AS produto_codigo,
              p.descricao_etiqueta AS produto_descricao,
              c.nome               AS cliente_nome
         FROM defeitos_devolucoes d
         LEFT JOIN produtos p ON p.id = d.produto_id
         LEFT JOIN clientes c ON c.id = d.cliente_id
        WHERE d.id = ANY($1::uuid[])`,
      [ids],
    );

    for (const l of linhas) {
      mapa.set(l.id, {
        produtoCodigo: l.produto_codigo,
        produtoDescricao: l.produto_descricao,
        clienteNome: l.cliente_nome,
      });
    }
    return mapa;
  }

  private async fotosDe(ids: string[]): Promise<Map<string, FotoOcorrencia[]>> {
    const mapa = new Map<string, FotoOcorrencia[]>();
    if (ids.length === 0) return mapa;

    const linhas = await this.repoFotos.find({
      where: ids.map((ocorrenciaId) => ({ ocorrenciaId })),
      order: { ordem: 'ASC' },
    });

    for (const l of linhas) {
      const lista = mapa.get(l.ocorrenciaId) ?? [];
      lista.push({
        id: l.id,
        arquivoId: l.arquivoId,
        mime: l.mime,
        nomeArquivo: l.nomeArquivo,
        ordem: l.ordem,
      });
      mapa.set(l.ocorrenciaId, lista);
    }
    return mapa;
  }

  async anexarFoto(
    ocorrenciaId: string,
    dados: { arquivoId: string; mime: string; nomeArquivo: string | null },
  ): Promise<FotoOcorrencia> {
    // A ordem e o fim da fila. Empate nao quebra nada: duas fotos anexadas no
    // mesmo instante ficam em ordem arbitraria entre si, e quem olha reordena
    // com os olhos.
    const { max } = await this.repoFotos
      .createQueryBuilder('f')
      .select('COALESCE(MAX(f.ordem), -1)', 'max')
      .where('f.ocorrencia_id = :id', { id: ocorrenciaId })
      .getRawOne<{ max: string }>() ?? { max: '-1' };

    const salva = await this.repoFotos.save(
      this.repoFotos.create({
        ocorrenciaId,
        arquivoId: dados.arquivoId,
        mime: dados.mime,
        nomeArquivo: dados.nomeArquivo,
        ordem: Number(max) + 1,
      }),
    );

    return {
      id: salva.id,
      arquivoId: salva.arquivoId,
      mime: salva.mime,
      nomeArquivo: salva.nomeArquivo,
      ordem: salva.ordem,
    };
  }

  async removerFoto(
    ocorrenciaId: string,
    fotoId: string,
  ): Promise<string | null> {
    // O `ocorrenciaId` entra na BUSCA, e nao numa checagem depois: assim nao
    // ha como apagar a foto de outra ocorrencia passando o id certo dela.
    const linha = await this.repoFotos.findOneBy({ id: fotoId, ocorrenciaId });
    if (!linha) return null;

    await this.repoFotos.delete(fotoId);
    return linha.arquivoId;
  }

  async atualizar(id: string, dados: AtualizarDefeitoData): Promise<Defeito> {
    const patch: Partial<DefeitoOrmEntity> = {};
    if (dados.produtoId !== undefined) patch.produtoId = dados.produtoId;
    if (dados.clienteId !== undefined) patch.clienteId = dados.clienteId;
    if (dados.tipo !== undefined) patch.tipo = dados.tipo;
    if (dados.descricao !== undefined) patch.descricao = dados.descricao;
    if (dados.data !== undefined) patch.data = dados.data;
    if (dados.resolucao !== undefined) patch.resolucao = dados.resolucao;

    await this.repo.update(id, patch);
    const atualizado = await this.repo.findOneByOrFail({ id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async kpis(filtro: FiltroKpiDefeito): Promise<DefeitoKpis> {
    const qb = this.repo
      .createQueryBuilder('d')
      .select('d.tipo', 'tipo')
      .addSelect('COUNT(d.id)', 'total')
      .groupBy('d.tipo');

    if (filtro.dataInicio && filtro.dataFim) {
      qb.where('d.data BETWEEN :inicio AND :fim', {
        inicio: filtro.dataInicio,
        fim: filtro.dataFim,
      });
    }

    const linhas = await qb.getRawMany<{ tipo: DefeitoKpis['porTipo'][number]['tipo']; total: string }>();
    const porTipo = linhas.map((l) => ({ tipo: l.tipo, total: Number(l.total) }));
    const total = porTipo.reduce((acc, t) => acc + t.total, 0);
    return { total, porTipo };
  }

  private montarWhere(filtro: FiltroDefeito): FindOptionsWhere<DefeitoOrmEntity> {
    const where: FindOptionsWhere<DefeitoOrmEntity> = {};
    if (filtro.tipo !== undefined) where.tipo = filtro.tipo;
    if (filtro.produtoId !== undefined) where.produtoId = filtro.produtoId;
    if (filtro.clienteId !== undefined) where.clienteId = filtro.clienteId;
    if (filtro.dataInicio && filtro.dataFim) {
      where.data = Between(filtro.dataInicio, filtro.dataFim);
    }
    return where;
  }

  private toOrm(d: Defeito): Partial<DefeitoOrmEntity> {
    return {
      ...(d.id ? { id: d.id } : {}),
      produtoId: d.produtoId,
      clienteId: d.clienteId,
      tipo: d.tipo,
      descricao: d.descricao,
      data: d.data,
      resolucao: d.resolucao,
    };
  }

  private toDomain(
    o: DefeitoOrmEntity,
    fotos: FotoOcorrencia[] = [],
    nomes?: NomesDaLinha,
  ): Defeito {
    return Defeito.create({
      id: o.id,
      produtoId: o.produtoId,
      clienteId: o.clienteId,
      produtoCodigo: nomes?.produtoCodigo ?? null,
      produtoDescricao: nomes?.produtoDescricao ?? null,
      clienteNome: nomes?.clienteNome ?? null,
      fotos,
      tipo: o.tipo,
      descricao: o.descricao,
      data: o.data,
      resolucao: o.resolucao,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
