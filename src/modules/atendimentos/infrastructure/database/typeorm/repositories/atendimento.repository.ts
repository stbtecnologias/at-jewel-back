import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import type {
  AbrirAtendimentoInput,
  Atendimento,
  AtendimentoAuditoria,
  BucketAuditoria,
  CompromissoAgenda,
  ContagemPorEtapa,
  CriarInteracaoInput,
  EtapaAtendimento,
  FiltroAuditoria,
  GranularidadeSerie,
  IAtendimentoRepository,
  Interacao,
  LinhaResumoVendedora,
  ResumoAuditoria,
} from '../../../../domain/ports/repositories/atendimento-repository.port';
import { ETAPAS_ATENDIMENTO } from '../../../../domain/ports/repositories/atendimento-repository.port';
import type {
  DesfechoAtendimento,
  StatusInteracao,
  OcasiaoAtendimento,
  TipoInteracao,
} from '../../../../domain/entities/enums';
import { AtendimentoInteracaoOrmEntity } from '../entities/atendimento-interacao.orm-entity';
import { AtendimentoOrmEntity } from '../entities/atendimento.orm-entity';
import { escaparCuringas } from '../../../../../../shared/database/sql/escapar-curingas';

@Injectable()
export class AtendimentoRepository implements IAtendimentoRepository {
  constructor(
    @InjectRepository(AtendimentoOrmEntity)
    private readonly repo: Repository<AtendimentoOrmEntity>,
    @InjectRepository(AtendimentoInteracaoOrmEntity)
    private readonly interacoes: Repository<AtendimentoInteracaoOrmEntity>,
  ) {}

  async buscarAbertoPorCliente(clienteId: string): Promise<Atendimento | null> {
    const row = await this.repo.findOne({
      where: { clienteId, fechadoEm: IsNull() },
    });
    return row ? paraDominio(row) : null;
  }

  async buscarPorId(id: string): Promise<Atendimento | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? paraDominio(row) : null;
  }

  async abrir(input: AbrirAtendimentoInput): Promise<Atendimento> {
    const salvo = await this.repo.save(
      this.repo.create({
        clienteId: input.clienteId,
        vendedoraId: input.vendedoraId,
        ocasiao: input.ocasiao ?? null,
        abertoEm: new Date(),
      }),
    );
    return paraDominio(salvo);
  }

  async completarOcasiaoSeVazia(
    atendimentoId: string,
    ocasiao: OcasiaoAtendimento,
  ): Promise<void> {
    // O WHERE com IsNull() faz a condicao no proprio UPDATE: sem ler-antes-de-
    // escrever, e sem janela para dois pedidos simultaneos se atropelarem.
    await this.repo.update({ id: atendimentoId, ocasiao: IsNull() }, { ocasiao });
  }

  async criarInteracao(input: CriarInteracaoInput): Promise<Interacao> {
    const salva = await this.interacoes.save(
      this.interacoes.create({
        atendimentoId: input.atendimentoId,
        tipo: input.tipo,
        combinadoEm: input.combinadoEm ?? null,
        notificarEm: input.notificarEm ?? null,
        ocorridoEm: input.ocorridoEm ?? null,
        status: input.status ?? 'PENDENTE',
        relato: input.relato ?? null,
      }),
    );
    return interacaoParaDominio(salva);
  }

  async ultimaInteracao(
    atendimentoId: string,
    tipo: TipoInteracao,
  ): Promise<Interacao | null> {
    const row = await this.interacoes.findOne({
      where: { atendimentoId, tipo },
      order: { criadoEm: 'DESC' },
    });
    return row ? interacaoParaDominio(row) : null;
  }

  async reagendar(
    atendimentoId: string,
    tipo: TipoInteracao,
    notificarEm: Date,
    combinadoEm: Date,
  ): Promise<void> {
    const pendente = await this.interacoes.findOne({
      where: { atendimentoId, tipo, status: 'PENDENTE' as StatusInteracao },
      order: { criadoEm: 'DESC' },
    });
    if (pendente) {
      await this.interacoes.update({ id: pendente.id }, { notificarEm, combinadoEm });
      return;
    }
    await this.interacoes.save(
      this.interacoes.create({
        atendimentoId,
        tipo,
        notificarEm,
        combinadoEm,
        status: 'PENDENTE',
      }),
    );
  }

  async buscarCobrancaAguardando(
    vendedoraId: string,
  ): Promise<{ interacao: Interacao; atendimento: Atendimento } | null> {
    const row = await this.interacoes
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.atendimento', 'a')
      .where('a.vendedora_id = :vendedoraId', { vendedoraId })
      .andWhere('a.fechado_em IS NULL')
      .andWhere("i.tipo = 'COBRANCA'")
      .andWhere("i.status = 'AGUARDANDO_RESPOSTA'")
      .orderBy('i.ocorrido_em', 'DESC')
      .getOne();

    if (!row?.atendimento) return null;
    return {
      interacao: interacaoParaDominio(row),
      atendimento: paraDominio(row.atendimento),
    };
  }

  async listarAgenda(
    vendedoraId: string,
    de: Date,
    ate: Date,
  ): Promise<CompromissoAgenda[]> {
    // DISTINCT no par (atendimento, horario): lembrete e cobranca compartilham
    // o mesmo `combinado_em`, e a agenda dela tem UM compromisso ali, nao dois.
    const rows = await this.interacoes
      .createQueryBuilder('i')
      // `.distinct(true)` em vez de "DISTINCT" dentro do select: o TypeORM
      // reescreve `alias.coluna` e quebra a clausula (syntax error no Postgres).
      .distinct(true)
      .select('a.id', 'atendimentoId')
      .addSelect('a.cliente_id', 'clienteId')
      .addSelect('a.ocasiao', 'ocasiao')
      .addSelect('i.combinado_em', 'combinadoEm')
      .innerJoin('i.atendimento', 'a')
      .where('a.vendedora_id = :vendedoraId', { vendedoraId })
      .andWhere('a.fechado_em IS NULL')
      .andWhere('i.combinado_em IS NOT NULL')
      .andWhere('i.combinado_em >= :de', { de })
      .andWhere('i.combinado_em <= :ate', { ate })
      .orderBy('i.combinado_em', 'ASC')
      .getRawMany<{
        atendimentoId: string;
        clienteId: string;
        ocasiao: OcasiaoAtendimento | null;
        combinadoEm: Date;
      }>();

    return rows.map((r) => ({
      atendimentoId: r.atendimentoId,
      clienteId: r.clienteId,
      ocasiao: r.ocasiao,
      combinadoEm: r.combinadoEm,
    }));
  }

  async fechar(atendimentoId: string, desfecho: DesfechoAtendimento): Promise<void> {
    await this.repo.update({ id: atendimentoId }, { fechadoEm: new Date(), desfecho });
  }

  async listarInteracoes(atendimentoId: string): Promise<Interacao[]> {
    const rows = await this.interacoes.find({
      where: { atendimentoId },
      order: { criadoEm: 'ASC' },
    });
    return rows.map(interacaoParaDominio);
  }

  async listarVencidas(agora: Date, limite: number): Promise<Interacao[]> {
    const rows = await this.interacoes.find({
      where: {
        status: 'PENDENTE' as StatusInteracao,
        notificarEm: LessThanOrEqual(agora),
      },
      // Mais antiga primeiro: se a fila acumulou, o mais atrasado sai antes.
      order: { notificarEm: 'ASC' },
      take: limite,
    });
    return rows.map(interacaoParaDominio);
  }

  async atualizarStatusInteracao(
    id: string,
    status: StatusInteracao,
    ocorridoEm?: Date | null,
  ): Promise<void> {
    await this.interacoes.update(
      { id },
      ocorridoEm === undefined ? { status } : { status, ocorridoEm },
    );
  }

  // ----------------------------------------------------------------
  // Auditoria — a leitura de gestao sobre os atendimentos da equipe
  // ----------------------------------------------------------------

  async listarAuditoria(
    filtros: FiltroAuditoria,
  ): Promise<{ itens: AtendimentoAuditoria[]; total: number }> {
    const { where, params } = montarFiltro(filtros);
    const p = params.length;

    // SQL cru sobre a VIEW, e nao QueryBuilder: a view nao tem entidade do
    // TypeORM, e criar uma so para leitura poria a etapa em dois lugares.
    const linhas: LinhaAuditoriaSql[] = await this.repo.manager.query(
      `
      SELECT v.*, cl.nome AS cliente_nome, vd.nome AS vendedora_nome,
             COUNT(*) OVER () AS total_geral
      FROM vw_atendimentos_auditoria v
      JOIN clientes cl ON cl.id = v.cliente_id
      JOIN vendedoras vd ON vd.id = v.vendedora_id
      ${where}
      ORDER BY COALESCE(v.ultima_atividade_em, v.aberto_em) DESC
      LIMIT $${p + 1} OFFSET $${p + 2}
      `,
      [...params, filtros.limit, filtros.offset],
    );

    if (linhas.length === 0) return { itens: [], total: 0 };

    // O RELATO PASSA PELO ORM, NUNCA PELO SQL ACIMA: a coluna e cifrada, e o
    // SQL cru devolveria o texto embaralhado. Uma consulta so para a pagina
    // inteira — nao e N+1.
    const ultimos = await this.ultimosRelatos(linhas.map((l) => l.id));

    return {
      total: Number(linhas[0].total_geral),
      itens: linhas.map((l) => ({
        id: l.id,
        clienteId: l.cliente_id,
        clienteNome: l.cliente_nome,
        vendedoraId: l.vendedora_id,
        vendedoraNome: l.vendedora_nome,
        ocasiao: l.ocasiao,
        etapa: l.etapa,
        abertoEm: l.aberto_em,
        fechadoEm: l.fechado_em,
        desfecho: l.desfecho,
        ultimaAtividadeEm: l.ultima_atividade_em,
        aguardandoRelato: l.aguardando_relato,
        interacoesExpiradas: Number(l.interacoes_expiradas),
        retomadas: Number(l.retomadas),
        proximoContatoEm: l.proximo_contato_em,
        ultimoRelato: ultimos.get(l.id) ?? null,
      })),
    };
  }

  async resumoAuditoria(
    filtros: Pick<FiltroAuditoria, 'de' | 'ate' | 'etapa'>,
  ): Promise<ResumoAuditoria> {
    const { where, params } = montarFiltro(filtros);

    const linhas: LinhaResumoSql[] = await this.repo.manager.query(
      `
      SELECT v.vendedora_id, vd.nome AS vendedora_nome, v.etapa,
             COUNT(*)::int AS quantos,
             COUNT(*) FILTER (WHERE v.aguardando_relato)::int AS aguardando,
             MAX(v.ultima_atividade_em) AS ultima_em
      FROM vw_atendimentos_auditoria v
      JOIN vendedoras vd ON vd.id = v.vendedora_id
      ${where}
      GROUP BY v.vendedora_id, vd.nome, v.etapa
      `,
      params,
    );

    const porVendedora = new Map<string, LinhaResumoVendedora>();
    const totalPorEtapa = zerado();
    let total = 0;

    for (const l of linhas) {
      let alvo = porVendedora.get(l.vendedora_id);
      if (!alvo) {
        alvo = {
          vendedoraId: l.vendedora_id,
          nome: l.vendedora_nome,
          total: 0,
          porEtapa: zerado(),
          aguardandoRelato: 0,
          ultimaAtividadeEm: null,
        };
        porVendedora.set(l.vendedora_id, alvo);
      }
      alvo.porEtapa[l.etapa] += l.quantos;
      alvo.total += l.quantos;
      alvo.aguardandoRelato += l.aguardando;
      if (
        l.ultima_em &&
        (!alvo.ultimaAtividadeEm || l.ultima_em > alvo.ultimaAtividadeEm)
      ) {
        alvo.ultimaAtividadeEm = l.ultima_em;
      }
      totalPorEtapa[l.etapa] += l.quantos;
      total += l.quantos;
    }

    return {
      total,
      porEtapa: totalPorEtapa,
      // Mais movimento primeiro: e a ordem em que um gestor quer olhar.
      vendedoras: [...porVendedora.values()].sort((a, b) => b.total - a.total),
    };
  }

  async serieAuditoria(
    filtros: Pick<FiltroAuditoria, 'de' | 'ate' | 'etapa' | 'vendedoraId'>,
    granularidade: GranularidadeSerie,
  ): Promise<BucketAuditoria[]> {
    const { where, params } = montarFiltro(filtros);

    // Os parametros do filtro ja ocuparam $1..$n; os meus entram DEPOIS, senao
    // os indices que o `where` montou apontariam para o lugar errado.
    params.push(granularidade === 'DIA' ? 'day' : 'week');
    const iUnidade = params.length;
    params.push(FUSO_DA_LOJA);
    const iFuso = params.length;

    // O DIA E O DA LOJA, e nao o do servidor. `aberto_em` e timestamptz: sem
    // converter para o fuso antes de truncar, um atendimento das 22h de sexta
    // cairia no sabado quando o processo roda em UTC. Converte, trunca, e
    // volta para timestamptz — assim o driver entrega um Date certo.
    const linhas: LinhaSerieSql[] = await this.repo.manager.query(
      `
      SELECT (date_trunc($${iUnidade}::text, v.aberto_em AT TIME ZONE $${iFuso}::text)
                AT TIME ZONE $${iFuso}::text) AS inicio,
             v.etapa,
             COUNT(*)::int AS quantos,
             COUNT(*) FILTER (WHERE v.aguardando_relato)::int AS aguardando
      FROM vw_atendimentos_auditoria v
      ${where}
      GROUP BY 1, 2
      ORDER BY 1
      `,
      params,
    );

    const baldes = new Map<number, BucketAuditoria>();
    for (const l of linhas) {
      const inicio = new Date(l.inicio);
      const chave = inicio.getTime();
      let balde = baldes.get(chave);
      if (!balde) {
        balde = {
          inicio,
          fim: fimDoBalde(inicio, granularidade),
          total: 0,
          porEtapa: zerado(),
          aguardandoRelato: 0,
        };
        baldes.set(chave, balde);
      }
      balde.porEtapa[l.etapa] += l.quantos;
      balde.total += l.quantos;
      balde.aguardandoRelato += l.aguardando;
    }

    // O BALDE VAI INTEIRO, sem recorte pela janela. A semana que abre o mes
    // comeca em julho, e a tela precisa saber disso para rotular — mas o
    // recorte e decisao de ROTULO, e feito la. Aqui, cortar o `inicio` faria a
    // serie de vendas (que casa por esse instante) nunca encontrar a semana de
    // virada.

    // Mais recente primeiro: e a ordem da linha do tempo na tela.
    return [...baldes.values()].sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
  }

  /** O relato mais recente de cada atendimento, decifrado pelo ORM. */
  private async ultimosRelatos(ids: string[]): Promise<Map<string, string>> {
    const linhas = await this.interacoes.find({
      where: { atendimentoId: In(ids), tipo: In(['RELATO', 'NOTA']) },
      order: { ocorridoEm: 'ASC', criadoEm: 'ASC' },
    });
    const mapa = new Map<string, string>();
    // Em ordem crescente, cada escrita sobrepoe a anterior — sobra a ultima.
    for (const i of linhas) {
      if (i.relato) mapa.set(i.atendimentoId, i.relato);
    }
    return mapa;
  }
}

/** Linha crua da view, com os nomes ja juntados. */
interface LinhaAuditoriaSql {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  vendedora_id: string;
  vendedora_nome: string;
  ocasiao: OcasiaoAtendimento | null;
  etapa: EtapaAtendimento;
  aberto_em: Date;
  fechado_em: Date | null;
  desfecho: DesfechoAtendimento | null;
  ultima_atividade_em: Date | null;
  aguardando_relato: boolean;
  interacoes_expiradas: string;
  retomadas: string;
  proximo_contato_em: Date | null;
  total_geral: string;
}

interface LinhaResumoSql {
  vendedora_id: string;
  vendedora_nome: string;
  etapa: EtapaAtendimento;
  quantos: number;
  aguardando: number;
  ultima_em: Date | null;
}

interface LinhaSerieSql {
  inicio: Date;
  etapa: EtapaAtendimento;
  quantos: number;
  aguardando: number;
}

/**
 * O fuso da operacao. A loja e em Fortaleza e o banco guarda timestamptz —
 * truncar o dia sem dizer o fuso usaria o do servidor, que roda em UTC.
 */
const FUSO_DA_LOJA = 'America/Sao_Paulo';

/** O ultimo instante do balde: vespera do proximo comeco. */
function fimDoBalde(inicio: Date, granularidade: GranularidadeSerie): Date {
  const proximo = new Date(inicio);
  if (granularidade === 'DIA') proximo.setDate(proximo.getDate() + 1);
  else proximo.setDate(proximo.getDate() + 7);
  return new Date(proximo.getTime() - 1);
}

function zerado(): ContagemPorEtapa {
  return Object.fromEntries(
    ETAPAS_ATENDIMENTO.map((e) => [e, 0]),
  ) as ContagemPorEtapa;
}

/**
 * Monta o WHERE por POSICAO. Nada de interpolar valor na string: o nome do
 * cliente vem de quem digita, e um curinga de LIKE solto ali viraria "traga
 * todo mundo" — mesmo cuidado do repositorio de clientes.
 */
function montarFiltro(f: Partial<FiltroAuditoria>): {
  where: string;
  params: unknown[];
} {
  const cond: string[] = [];
  const params: unknown[] = [];

  if (f.id) {
    params.push(f.id);
    cond.push('v.id = $' + params.length);
  }
  if (f.vendedoraId) {
    params.push(f.vendedoraId);
    cond.push(`v.vendedora_id = $${params.length}`);
  }
  if (f.etapa) {
    params.push(f.etapa);
    cond.push(`v.etapa = $${params.length}`);
  }
  if (f.de) {
    params.push(f.de);
    cond.push(`v.aberto_em >= $${params.length}`);
  }
  if (f.ate) {
    params.push(f.ate);
    cond.push(`v.aberto_em <= $${params.length}`);
  }
  if (f.clienteNome) {
    params.push('%' + escaparCuringas(f.clienteNome) + '%');
    cond.push(`cl.nome ILIKE $${params.length}`);
  }

  return { where: cond.length ? 'WHERE ' + cond.join(' AND ') : '', params };
}

function paraDominio(row: AtendimentoOrmEntity): Atendimento {
  return {
    id: row.id,
    clienteId: row.clienteId,
    vendedoraId: row.vendedoraId,
    ocasiao: row.ocasiao,
    abertoEm: row.abertoEm,
    fechadoEm: row.fechadoEm,
    desfecho: row.desfecho,
  };
}

function interacaoParaDominio(row: AtendimentoInteracaoOrmEntity): Interacao {
  return {
    id: row.id,
    atendimentoId: row.atendimentoId,
    tipo: row.tipo,
    combinadoEm: row.combinadoEm,
    notificarEm: row.notificarEm,
    ocorridoEm: row.ocorridoEm,
    status: row.status,
    relato: row.relato,
    criadoEm: row.criadoEm,
  };
}
