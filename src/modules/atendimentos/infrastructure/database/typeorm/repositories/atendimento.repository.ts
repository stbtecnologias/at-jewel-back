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
  PontoDaLinha,
  ResumoAuditoria,
  TipoPonto,
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
import { ClientePerfilOrmEntity } from '../../../../../clientes/infrastructure/database/typeorm/entities/cliente-perfil.orm-entity';
import { escaparCuringas } from '../../../../../../shared/database/sql/escapar-curingas';

@Injectable()
export class AtendimentoRepository implements IAtendimentoRepository {
  constructor(
    @InjectRepository(AtendimentoOrmEntity)
    private readonly repo: Repository<AtendimentoOrmEntity>,
    @InjectRepository(AtendimentoInteracaoOrmEntity)
    private readonly interacoes: Repository<AtendimentoInteracaoOrmEntity>,
    // So para decifrar o WhatsApp da cliente na linha do tempo: e o que
    // permite o ponto de conversa levar ate a conversa. A coluna e cifrada,
    // entao SQL cru devolveria o texto embaralhado.
    @InjectRepository(ClientePerfilOrmEntity)
    private readonly perfis: Repository<ClientePerfilOrmEntity>,
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

  async reabrir(atendimentoId: string): Promise<void> {
    // Os DOIS voltam a nulo juntos: o CHECK da migracao 35 exige que
    // `fechado_em` e `desfecho` estejam ambos preenchidos ou ambos vazios.
    await this.repo.update(
      { id: atendimentoId },
      { fechadoEm: null, desfecho: null },
    );
  }

  /**
   * Ver a porta para a regra. Aqui vale registrar o SQL:
   *
   * O `JOIN LATERAL` traz a hora do ultimo contato pelo corporativo — e o
   * `ult.quando IS NOT NULL` e o que exclui quem nunca teve contato por la,
   * que e a maioria e nao pode ser fechada por esta regra.
   *
   * Os dois `NOT EXISTS` sao as duas excecoes: compromisso marcado no futuro,
   * e pendencia nossa ainda em aberto.
   */
  async listarSilenciosos(horas: number, limite: number): Promise<string[]> {
    const linhas: { id: string }[] = await this.repo.manager.query(
      `
      SELECT a.id
      FROM atendimentos a
      JOIN LATERAL (
        SELECT max(COALESCE(i.ocorrido_em, i.criado_em)) AS quando
        FROM atendimento_interacoes i
        WHERE i.atendimento_id = a.id
          AND i.tipo IN ('CONTATO_CLIENTE', 'RESPOSTA_VENDEDORA')
      ) ult ON TRUE
      WHERE a.fechado_em IS NULL
        AND ult.quando IS NOT NULL
        AND ult.quando < now() - make_interval(hours => $1)
        AND NOT EXISTS (
          SELECT 1 FROM atendimento_interacoes c
          WHERE c.atendimento_id = a.id
            AND c.combinado_em IS NOT NULL
            AND c.combinado_em > now()
        )
        AND NOT EXISTS (
          SELECT 1 FROM atendimento_interacoes p
          WHERE p.atendimento_id = a.id
            AND p.status IN ('PENDENTE', 'ENVIADA', 'AGUARDANDO_RESPOSTA')
        )
      ORDER BY ult.quando ASC
      LIMIT $2
      `,
      [horas, limite],
    );
    return linhas.map((l) => l.id);
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
    filtros: Pick<
      FiltroAuditoria,
      'de' | 'ate' | 'etapa' | 'vendedoraId' | 'apenasAbertos'
    >,
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

  /**
   * A LINHA DO TEMPO — MEL-14.
   *
   * ========================================================================
   * CINCO FONTES, UMA REGUA.
   *
   * Nao ha tabela de eventos: cada UNION abaixo le uma tabela que ja grava o
   * acontecimento por conta propria. Ver `PontoDaLinha` para o porque.
   *
   *   1. atendimento_interacoes  — o dia a dia: encaminhamento, agendamento,
   *      lembrete, cobranca, relato, remarcacao, nota
   *   2. as mesmas interacoes com status EXPIRADA — o unico ponto VERMELHO:
   *      nao e "deu ruim", e "venceu e ninguem respondeu"
   *   3. atendimentos fechados    — o desfecho do episodio
   *   4. vendas                   — a venda registrada
   *   5. consignacoes             — a peca que saiu com a vendedora
   *
   * `defeitos_devolucoes` FICOU DE FORA, e nao por escolha: a tabela nao tem
   * `vendedora_id`. Nao ha como dizer de quem e a ocorrencia, e chutar pelo
   * produto seria inventar atribuicao.
   * ========================================================================
   *
   * QUAL INSTANTE POE O PONTO NA REGUA: `ocorrido_em` quando existe (foi
   * quando aconteceu de verdade), senao `notificar_em` (foi quando era para
   * acontecer), senao `criado_em`. O `combinado_em` NUNCA posiciona — ele e o
   * horario marcado COM A CLIENTE, que costuma ser outro dia, e usa-lo poria
   * o ponto num dia em que a vendedora nao fez nada.
   */
  async linhaDoTempo(de: Date, ate: Date): Promise<PontoDaLinha[]> {
    const linhas: LinhaDaLinhaSql[] = await this.repo.manager.query(
      `
      WITH janela AS (SELECT $1::timestamptz AS de, $2::timestamptz AS ate),

      -- ====================================================================
      -- A UNIAO VIROU CTE PARA A ETAPA PODER ENTRAR POR FORA — 22/09/2026.
      --
      -- Cada ramo abaixo continua o que sempre foi. O que mudou e que eles
      -- nao sao mais o resultado: viraram "pontos", e o SELECT final junta
      -- a etapa contra a view.
      --
      -- POR FORA, E NAO RAMO A RAMO: sao seis ramos e tres deles nem tem
      -- atendimento atras. Repetir o join em cada um seria escrever a mesma
      -- coisa seis vezes para acertar em tres.
      -- ====================================================================
      pontos AS (

      -- 1 + 2. As interacoes do periodo.
      SELECT
        'interacao:' || i.id            AS id,
        CASE
          WHEN i.status = 'EXPIRADA'    THEN 'EXPIRADA'
          WHEN i.tipo = 'ENCAMINHADO'   THEN 'ENCAMINHADO'
          WHEN i.tipo = 'REAGENDAMENTO' THEN 'REAGENDAMENTO'
          WHEN i.tipo = 'RELATO'        THEN 'RELATO'
          WHEN i.tipo = 'NOTA'          THEN 'NOTA'
          WHEN i.tipo = 'CONTATO_CLIENTE'    THEN 'CONTATO_CLIENTE'
          WHEN i.tipo = 'RESPOSTA_VENDEDORA' THEN 'RESPOSTA_VENDEDORA'
          WHEN i.tipo = 'LEMBRETE'      THEN 'LEMBRETE'
          -- COBRANCA com horario marcado e, na pratica, um agendamento.
          WHEN i.combinado_em IS NOT NULL THEN 'AGENDAMENTO'
          ELSE 'COBRANCA'
        END                             AS tipo,
        a.vendedora_id                  AS vendedora_id,
        vd.nome                         AS vendedora_nome,
        COALESCE(i.ocorrido_em, i.notificar_em, i.criado_em) AS em,
        a.cliente_id                    AS cliente_id,
        cl.nome                         AS cliente_nome,
        i.combinado_em                  AS combinado_em,
        NULL::numeric                   AS valor,
        NULL::text                      AS desfecho,
        a.id                            AS atendimento_id
      FROM atendimento_interacoes i
      JOIN atendimentos a  ON a.id = i.atendimento_id
      JOIN vendedoras vd   ON vd.id = a.vendedora_id
      JOIN clientes cl     ON cl.id = a.cliente_id
      , janela j
      WHERE COALESCE(i.ocorrido_em, i.notificar_em, i.criado_em) >= j.de
        AND COALESCE(i.ocorrido_em, i.notificar_em, i.criado_em) <  j.ate

      UNION ALL

      -- 3. O episodio que se fechou.
      SELECT
        'fechamento:' || a.id, 'FECHAMENTO',
        a.vendedora_id, vd.nome,
        a.fechado_em,
        a.cliente_id, cl.nome,
        NULL::timestamptz, NULL::numeric,
        a.desfecho::text,
        a.id
      FROM atendimentos a
      JOIN vendedoras vd ON vd.id = a.vendedora_id
      JOIN clientes cl   ON cl.id = a.cliente_id
      , janela j
      WHERE a.fechado_em >= j.de AND a.fechado_em < j.ate

      UNION ALL

      -- 4. A venda registrada. Sem cliente: 'vendas' nao aponta para ele.
      SELECT
        'venda:' || v.id, 'VENDA',
        v.vendedora_id, vd.nome,
        v.data_venda,
        NULL::uuid, NULL::text,
        NULL::timestamptz, v.valor_total,
        NULL::text, NULL::uuid
      FROM vendas v
      JOIN vendedoras vd ON vd.id = v.vendedora_id
      , janela j
      WHERE v.data_venda >= j.de AND v.data_venda < j.ate
        AND v.vendedora_id IS NOT NULL

      UNION ALL

      -- 6. O LEAD ENCAMINHADO — 21/09/2026.
      --
      -- ====================================================================
      -- A LINHA DO TEMPO MOSTRAVA "sem registro" PARA QUEM TINHA RECEBIDO UM.
      --
      -- Encaminhar lead nao cria atendimento (decisao de 03/09), e todos os
      -- outros ramos desta uniao nascem de um. Entao o dia da vendedora que
      -- so recebeu leads aparecia vazio — o Lucas viu isso na tela em 21/09,
      -- horas depois de um lead ter sido encaminhado para ele.
      --
      -- O PONTO NASCE DO PROPRIO LEAD, sem atendimento e sem cliente: os dois
      -- vao nulos, como ja acontece na venda e na consignacao. O nome do lead
      -- ocupa o lugar do nome do cliente, que e o que a tela mostra.
      --
      -- O MARCO E O ENCAMINHAMENTO, e nao a criacao do lead: e o momento em
      -- que aquilo passou a ser trabalho DELA. Lead que ainda espera a gestao
      -- nao e dia de vendedora nenhuma, e por isso nao entra aqui.
      --
      -- A coluna "nome" NAO e cifrada (so "whatsapp" e), entao ela pode vir
      -- por SQL cru. O telefone continua fora desta consulta, de proposito.
      -- ====================================================================
      SELECT
        'lead:' || l.id, 'ENCAMINHADO',
        vd.id, vd.nome,
        l.direcionado_vendedora_em,
        NULL::uuid, l.nome,
        NULL::timestamptz, NULL::numeric,
        NULL::text, NULL::uuid
      FROM leads l
      JOIN vendedoras vd ON vd.codigo_erp = l.vendedora_aprovada_codigo
      , janela j
      WHERE l.direcionado_vendedora_em >= j.de
        AND l.direcionado_vendedora_em <  j.ate

      UNION ALL

      -- 5. A peca que saiu com ela.
      SELECT
        'consignacao:' || c.id, 'CONSIGNACAO',
        c.vendedora_id, vd.nome,
        c.data_saida,
        NULL::uuid, NULL::text,
        c.data_prevista_retorno, NULL::numeric,
        NULL::text, NULL::uuid
      FROM consignacoes c
      JOIN vendedoras vd ON vd.id = c.vendedora_id
      , janela j
      WHERE c.data_saida >= j.de AND c.data_saida < j.ate
        AND c.vendedora_id IS NOT NULL

      )

      -- ====================================================================
      -- A ETAPA, VINDA DA VIEW QUE JA A CALCULA.
      --
      -- A view vw_atendimentos_auditoria deriva a etapa da linha do tempo do
      -- episodio (migracao 38). Reimplementar aquele CASE aqui seria manter
      -- duas verdades sobre a mesma pergunta, e elas divergiriam na primeira
      -- mudanca de regra.
      --
      -- LEFT, E NAO INNER: venda, consignacao e lead encaminhado nao tem
      -- atendimento. Um INNER apagaria tres dos seis ramos da regua.
      -- ====================================================================
      SELECT
        p.*,
        va.etapa::text AS etapa
      FROM pontos p
      LEFT JOIN vw_atendimentos_auditoria va ON va.id = p.atendimento_id

      ORDER BY p.em ASC
      `,
      [de, ate],
    );

    // O RELATO PASSA PELO ORM, NUNCA PELO SQL ACIMA: a coluna e cifrada, e o
    // SQL cru devolveria o texto embaralhado. Mesmo motivo (e mesmo padrao)
    // de `listarAuditoria`. Uma consulta so — nao e N+1.
    const idsDeInteracao = linhas
      .filter((l) => l.id.startsWith('interacao:'))
      .map((l) => l.id.slice('interacao:'.length));
    const relatos = await this.relatosDasInteracoes(idsDeInteracao);

    // O CHAT SO INTERESSA AOS PONTOS DE CONVERSA. Buscar o telefone de toda
    // cliente do dia seria decifrar PII a toa — e um agendamento nao tem
    // conversa atras dele para abrir.
    const idsDeConversa = [
      ...new Set(
        linhas
          .filter(
            (l) =>
              l.tipo === 'CONTATO_CLIENTE' || l.tipo === 'RESPOSTA_VENDEDORA',
          )
          .map((l) => l.cliente_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const chats = await this.chatsDosClientes(idsDeConversa);

    return linhas.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      vendedoraId: l.vendedora_id,
      vendedoraNome: l.vendedora_nome,
      em: l.em,
      clienteId: l.cliente_id,
      clienteNome: l.cliente_nome,
      combinadoEm: l.combinado_em,
      valor: l.valor == null ? null : Number(l.valor),
      desfecho: l.desfecho,
      atendimentoId: l.atendimento_id,
      relato: relatos.get(l.id.slice('interacao:'.length)) ?? null,
      etapa: l.etapa,
      // `vend-<uuid>` e o mesmo nome que o `ConexoesService` monta. Aqui ele
      // e reconstruido em vez de importado para nao amarrar este modulo ao
      // de atendimento — se o formato mudar, muda nos dois.
      sessao: chats.has(l.cliente_id ?? "")
        ? `vend-${l.vendedora_id}`
        : null,
      chatId: chats.get(l.cliente_id ?? '') ?? null,
    }));
  }

  /**
   * O dia mais recente em que ALGUEM fez alguma coisa.
   *
   * Serve so para o recuo do `ConsultarLinhaDoTempoUseCase`: sem ele, abrir a
   * tela num dia parado mostraria uma regua vazia, que parece defeito. Olha
   * as mesmas cinco fontes da linha, mas so pela data — e barato.
   */
  async ultimoDiaComMovimento(): Promise<Date | null> {
    const linhas: { dia: Date | null }[] = await this.repo.manager.query(`
      SELECT max(dia)::timestamptz AS dia FROM (
        SELECT max(date_trunc('day', COALESCE(i.ocorrido_em, i.notificar_em, i.criado_em))) AS dia
          FROM atendimento_interacoes i
        UNION ALL
        SELECT max(date_trunc('day', a.fechado_em)) FROM atendimentos a
        UNION ALL
        SELECT max(date_trunc('day', v.data_venda)) FROM vendas v WHERE v.vendedora_id IS NOT NULL
        UNION ALL
        SELECT max(date_trunc('day', c.data_saida)) FROM consignacoes c WHERE c.vendedora_id IS NOT NULL
      ) t
    `);
    return linhas[0]?.dia ?? null;
  }

  /**
   * O chat de cada cliente: o WhatsApp dela no formato do WhatsApp.
   *
   * Passa pelo ORM porque a coluna e cifrada. Uma consulta so para a janela
   * inteira — nao e N+1.
   */
  private async chatsDosClientes(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const perfis = await this.perfis.find({ where: { clienteId: In(ids) } });
    const mapa = new Map<string, string>();
    for (const p of perfis) {
      const digitos = (p.whatsapp ?? '').replace(/D/g, '');
      if (!digitos) continue;
      // O WAHA identifica a conversa por `<numero com DDI>@c.us`. Sem DDI o
      // chat simplesmente nao existe do lado dele.
      const comDdi = digitos.startsWith('55') ? digitos : `55${digitos}`;
      mapa.set(p.clienteId, `${comDdi}@c.us`);
    }
    return mapa;
  }

  /** O relato de cada interacao, decifrado pelo ORM. Vazio se nao houver ids. */
  private async relatosDasInteracoes(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const linhas = await this.interacoes.find({ where: { id: In(ids) } });
    const mapa = new Map<string, string>();
    for (const i of linhas) if (i.relato) mapa.set(i.id, i.relato);
    return mapa;
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

/** Linha crua da uniao da linha do tempo. */
interface LinhaDaLinhaSql {
  id: string;
  tipo: TipoPonto;
  vendedora_id: string;
  vendedora_nome: string;
  em: Date;
  cliente_id: string | null;
  cliente_nome: string | null;
  combinado_em: Date | null;
  valor: string | null;
  desfecho: string | null;
  atendimento_id: string | null;
  /** Vem do LEFT JOIN com a view; null onde nao ha atendimento atras. */
  etapa: EtapaAtendimento | null;
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
  // SEM PARAMETRO: e um predicado fixo, nao um valor de fora. `desfecho`
  // nulo e a definicao de atendimento em curso — ver `apenasAbertos`.
  if (f.apenasAbertos) {
    cond.push('v.desfecho IS NULL');
  }
  if (f.de) {
    params.push(f.de);
    cond.push(`v.aberto_em >= ${params.length}`);
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
