import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import {
  receitaLiquida,
  vendaEfetiva,
} from '../../../../../../shared/database/sql/movimentacao-como-venda';
import { escaparCuringas } from '../../../../../../shared/database/sql/escapar-curingas';
import {
  NivelDeFidelidade,
  nivelEmSql,
  ordemEmSql,
} from '../../../../../../shared/clientes/fidelidade';
import { Cliente } from '../../../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../../../domain/entities/cliente-perfil.entity';
import {
  ClienteDaCarteira,
  ClienteDaEpoca,
  EscopoDeCliente,
  EscopoDeEpoca,
  FiltroCliente,
  FiltroDemografico,
  IClienteRepository,
  PaginaDeFidelidade,
  RecorteDeFidelidade,
  TierCliente,
} from '../../../../domain/ports/repositories/cliente-repository.port';
import { ClienteOrmEntity } from '../entities/cliente.orm-entity';
import { ClientePerfilOrmEntity } from '../entities/cliente-perfil.orm-entity';

/**
 * O NOME QUEBRADO EM PALAVRAS — 02/10/2026.
 *
 * ==========================================================================
 * "RAFAELA SANTOS" NAO ACHAVA "RAFAELA FAVORITO SANTOS".
 *
 * A busca era UM pedaco so: `nome ILIKE %Rafaela Santos%`. Quem tem nome do
 * meio — e em joalheria e a maioria — nao era encontrada, e a agente
 * respondia "nao encontrei nenhuma cliente com esse nome", que e falso e
 * soa definitivo. Quem pergunta desiste ali.
 * ==========================================================================
 *
 * CADA PALAVRA VIRA UMA CONDICAO, todas obrigatorias: "Rafaela" E "Santos",
 * em qualquer ordem e com qualquer coisa no meio. Buscar por uma palavra so
 * continua funcionando igual.
 *
 * TETO DE CINCO: nome completo tem seis, sete palavras, e cada uma vira um
 * ILIKE sem indice. Cinco ja identifica qualquer pessoa, e quem digitar o
 * nome inteiro acha do mesmo jeito pelas cinco primeiras.
 *
 * TERMO VAZIO DEVOLVE LISTA VAZIA, e nao a base inteira: sem palavra nenhuma
 * nao ha condicao, e uma consulta sem condicao traria todo mundo.
 */
export function palavrasDoNome(termo: string): string[] {
  return escaparCuringas(termo)
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .slice(0, 5);
}

@Injectable()
export class ClienteRepository implements IClienteRepository {
  constructor(
    @InjectRepository(ClienteOrmEntity)
    private readonly repo: Repository<ClienteOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async distribuicaoTiers(filtro?: FiltroDemografico): Promise<TierCliente[]> {
    // Faixas por nº de compras concluidas. Agregado, sem PII. O recorte
    // demografico (sexo/origem/faixa) vem de clientes_perfil; o periodo filtra
    // por clientes CRIADOS no intervalo (c.criado_em). Tudo parametrizado ($n).
    //
    // OS CORTES SAIRAM DAQUI em 09/10/2026 e moram em `shared/clientes/
    // fidelidade.ts`: a agente responde a mesma pergunta pelo WhatsApp, e a
    // regra escrita em dois lugares um dia divergiria. O SQL abaixo e GERADO
    // pelas mesmas constantes que a agente usa.
    const params: unknown[] = [];
    let whereDemo = '';
    const precisaPerfil =
      filtro?.sexo != null ||
      filtro?.origem != null ||
      filtro?.faixaEtaria != null ||
      filtro?.idadeMin != null ||
      filtro?.idadeMax != null;
    if (filtro?.dataInicio && filtro?.dataFim) {
      params.push(filtro.dataInicio, filtro.dataFim);
      whereDemo += ` AND c.criado_em BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    // `= ANY($n::text[])`, o mesmo do `/analytics` desde o `53b5c97`: a lista
    // vai como UM parametro. O cast e explicito porque `sexo` e ENUM.
    if (filtro?.sexo != null) {
      params.push(filtro.sexo);
      whereDemo += ` AND COALESCE(cp.sexo::text, 'NAO_INFORMADO') = ANY($${params.length}::text[])`;
    }
    if (filtro?.origem != null) {
      params.push(filtro.origem);
      whereDemo += ` AND COALESCE(cp.origem_contato::text, 'Nao informado') = ANY($${params.length}::text[])`;
    }
    if (filtro?.faixaEtaria != null) {
      params.push(filtro.faixaEtaria);
      whereDemo += ` AND COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') = $${params.length}`;
    }
    if (filtro?.idadeMin != null) {
      params.push(filtro.idadeMin);
      whereDemo += ` AND cp.idade >= $${params.length}`;
    }
    if (filtro?.idadeMax != null) {
      params.push(filtro.idadeMax);
      whereDemo += ` AND cp.idade <= $${params.length}`;
    }
    const joinCp = precisaPerfil
      ? ' LEFT JOIN clientes_perfil cp ON cp.cliente_id = c.id'
      : '';
    const rows = await this.dataSource.query<{ tier: string; ordem: number; total: number }[]>(
      `
      WITH compras AS (
        SELECT c.id, COUNT(v.id) AS n
        FROM clientes c
        LEFT JOIN movimentacoes v ON v.cliente_id = c.id AND ${vendaEfetiva('v')}${joinCp}
        WHERE TRUE${whereDemo}
        GROUP BY c.id
      )
      SELECT t.tier, t.ordem, COUNT(*)::int AS total
      FROM compras
      CROSS JOIN LATERAL (
        SELECT ${nivelEmSql('n')} AS tier,
               ${ordemEmSql('n')} AS ordem
      ) t
      GROUP BY t.tier, t.ordem
      ORDER BY t.ordem
      `,
      params,
    );
    return rows.map((r) => ({ tier: r.tier, total: r.total }));
  }

  async criarComPerfil(cliente: Cliente, perfil: ClientePerfil): Promise<Cliente> {
    return this.dataSource.transaction(async (manager) => {
      const clienteRepo = manager.getRepository(ClienteOrmEntity);
      const perfilRepo = manager.getRepository(ClientePerfilOrmEntity);

      const clienteRow = clienteRepo.create(this.toOrm(cliente));
      const clienteSalvo = await clienteRepo.save(clienteRow);

      const perfilRow = perfilRepo.create({
        ...this.perfilToOrm(perfil),
        clienteId: clienteSalvo.id,
      });
      const perfilSalvo = await perfilRepo.save(perfilRow);

      return this.toDomain(clienteSalvo, perfilSalvo);
    });
  }

  async criar(cliente: Cliente): Promise<Cliente> {
    // Sem transacao: e um unico INSERT, diferente do criarComPerfil acima.
    const row = this.repo.create(this.toOrm(cliente));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo, null);
  }

  async buscarPorId(
    id: string,
    opts?: { incluirPerfil?: boolean },
  ): Promise<Cliente | null> {
    const row = await this.repo.findOne({
      where: { id },
      relations: opts?.incluirPerfil ? { perfil: true } : {},
    });
    return row ? this.toDomain(row, row.perfil) : null;
  }

  async buscarPorIdErp(
    idErp: string,
    opts?: { incluirPerfil?: boolean },
  ): Promise<Cliente | null> {
    const row = await this.repo.findOne({
      where: { idErp },
      relations: opts?.incluirPerfil ? { perfil: true } : {},
    });
    return row ? this.toDomain(row, row.perfil) : null;
  }

  async buscarPorNomeParcial(termo: string, limite: number): Promise<Cliente[]> {
    // unaccent nao esta instalado no banco; ILIKE resolve maiuscula/minuscula,
    // e o acento fica por conta de quem digita. Escapamos os curingas do LIKE
    // para que "%" digitado pelo ADM nao vire "traga todo mundo".
    const palavras = palavrasDoNome(termo);
    if (palavras.length === 0) return [];

    const qb = this.repo.createQueryBuilder('c').where('c.ativo = true');
    // UMA CONDICAO POR PALAVRA — ver `palavrasDoNome`. "Rafaela Santos" acha
    // "RAFAELA FAVORITO SANTOS"; com um pedaco so, nao achava.
    palavras.forEach((palavra, i) => {
      qb.andWhere(`c.nome ILIKE :p${i}`, { [`p${i}`]: `%${palavra}%` });
    });
    const rows = await qb
      .orderBy('c.nome', 'ASC')
      .limit(limite)
      .getMany();
    return rows.map((r) => this.toDomain(r));
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Cliente | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async proximoCodigoInterno(): Promise<string> {
    // Ordena pelo NUMERO e nao pelo texto: por texto, "CL-9" viria depois de
    // "CL-10" e a sequencia repetiria um codigo ja usado. Mesma armadilha que
    // o `proximoCodigoInterno` da vendedora resolve.
    const linhas: { codigo_erp: string }[] = await this.repo.manager.query(
      `SELECT codigo_erp FROM clientes
        WHERE codigo_erp ~ '^CL-[0-9]+$'
        ORDER BY (substring(codigo_erp from 4))::int DESC
        LIMIT 1`,
    );
    const ultimo = linhas[0] ? Number(linhas[0].codigo_erp.slice(3)) : 0;
    return `CL-${String(ultimo + 1).padStart(4, '0')}`;
  }

  /**
   * ATENCAO: desde a migracao 36 a coluna NAO e mais unica — o mesmo telefone
   * pode pertencer a varios clientes (mae e filha, fixo da empresa, etc.).
   * Este metodo devolve o MAIS ANTIGO, so para ser deterministico.
   *
   * Quem for usar isto para decidir "de quem e esta mensagem" NAO pode confiar
   * no resultado: tem que buscar a lista e tratar N > 1 como ambiguidade,
   * do mesmo jeito que a tool avisar_vendedora faz com CLIENTE_AMBIGUO.
   */
  async buscarPorTelefone1Hash(hash: string): Promise<Cliente | null> {
    const row = await this.repo.findOne({
      where: { telefone1Hash: hash },
      order: { criadoEm: 'ASC' },
    });
    return row ? this.toDomain(row) : null;
  }

  /** Mesma ressalva do telefone: nao e mais unico desde a migracao 36. */
  async buscarPorEmailHash(hash: string): Promise<Cliente | null> {
    const row = await this.repo.findOne({
      where: { emailHash: hash },
      order: { criadoEm: 'ASC' },
    });
    return row ? this.toDomain(row) : null;
  }

  async transferirCarteira(
    clienteId: string,
    vendedoraCodigoErp: string | null,
  ): Promise<void> {
    await this.repo.update(clienteId, { vendedoraCodigoErp });
  }

  async buscarNaCarteiraPorNome(
    vendedoraCodigoErp: string,
    termo: string,
    limite: number,
  ): Promise<Cliente[]> {
    // Escapa os curingas do LIKE e quebra em palavras — mesmo tratamento do
    // `buscarPorNomeParcial`. As duas buscas tem de achar a mesma pessoa: a
    // vendedora que procura "Rafaela Santos" na carteira dela nao pode receber
    // "nao encontrei" por causa do nome do meio.
    const palavras = palavrasDoNome(termo);
    if (palavras.length === 0) return [];

    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.vendedora_codigo_erp = :codigo', { codigo: vendedoraCodigoErp })
      .andWhere('c.ativo = true');
    palavras.forEach((palavra, i) => {
      qb.andWhere(`c.nome ILIKE :p${i}`, { [`p${i}`]: `%${palavra}%` });
    });
    const rows = await qb
      .orderBy('c.nome', 'ASC')
      .limit(limite)
      .getMany();
    return rows.map((r) => this.toDomain(r));
  }

  async inativosDaCarteira(
    vendedoraCodigoErp: string,
    desde: Date,
    limite: number,
    deslocamento = 0,
  ): Promise<ClienteDaCarteira[]> {
    // LEFT JOIN, e nao INNER: quem NUNCA comprou tambem e resposta para
    // "quem esta parado". Com INNER ele sumiria justamente por estar mais
    // parado que todo mundo.
    const rows = await this.repo.manager.query<
      {
        id: string;
        nome: string;
        ultima_compra: Date | null;
        quantidade: string;
        valor_total: string;
      }[]
    >(
      `
      SELECT c.id,
             c.nome,
             MAX(v.data_movimentacao)   AS ultima_compra,
             COUNT(v.id)                AS quantidade,
             COALESCE(SUM(v.valor), 0)  AS valor_total
      FROM clientes c
      LEFT JOIN movimentacoes v
             ON v.cliente_id = c.id
            AND ${vendaEfetiva('v')}
      WHERE c.vendedora_codigo_erp = $1
        AND c.ativo = TRUE
      GROUP BY c.id, c.nome
      HAVING MAX(v.data_movimentacao) IS NULL
          OR MAX(v.data_movimentacao) < $2
      -- O DESEMPATE NAO E ENFEITE — 05/10/2026. Quem nunca comprou tem
      -- MAX(data) IS NULL, e sao DEZENAS com a mesma chave de ordenacao.
      -- Sem um segundo criterio o Postgres pode devolver essas linhas em
      -- ordem diferente a cada consulta, e com OFFSET isso faz a pagina 2
      -- repetir nomes da 1 e pular outros — sem erro nenhum, so uma lista
      -- errada. c.nome e estavel e e a ordem em que a pessoa le.
      ORDER BY MAX(v.data_movimentacao) ASC NULLS FIRST, c.nome ASC
      LIMIT $3 OFFSET $4
      `,
      [vendedoraCodigoErp, desde, limite, deslocamento],
    );

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      ultimaCompra: r.ultima_compra,
      quantidade: Number(r.quantidade),
      valorTotal: Number(r.valor_total),
    }));
  }


  /**
   * QUANTOS estao parados. Mesma condicao do `inativosDaCarteira`, sem LIMIT
   * e sem trazer coluna nenhuma alem da contagem.
   *
   * O COUNT vem de fora do agrupamento de proposito: a condicao esta no
   * HAVING, entao o que se conta sao os GRUPOS (clientes), e nao as linhas do
   * join com vendas — que traria o numero de compras.
   */
  async contarInativosDaCarteira(
    vendedoraCodigoErp: string,
    desde: Date,
  ): Promise<number> {
    const rows = await this.repo.manager.query<{ total: string }[]>(
      `
      SELECT COUNT(*) AS total FROM (
        SELECT c.id
        FROM clientes c
        LEFT JOIN movimentacoes v
               ON v.cliente_id = c.id
              AND ${vendaEfetiva('v')}
        WHERE c.vendedora_codigo_erp = $1
          AND c.ativo = TRUE
        GROUP BY c.id
        HAVING MAX(v.data_movimentacao) IS NULL
            OR MAX(v.data_movimentacao) < $2
      ) AS parados
      `,
      [vendedoraCodigoErp, desde],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async contarCompradoresDaCarteira(
    vendedoraCodigoErp: string,
    opcoes: { categoria?: string; desde?: Date },
  ): Promise<number> {
    const params: unknown[] = [vendedoraCodigoErp];
    let joinItens = '';
    let filtroCategoria = '';

    if (opcoes.categoria) {
      params.push(opcoes.categoria);
      joinItens =
        ' JOIN movimentacoes_itens i ON i.movimentacao_id = v.id AND i.ativo' +
        ' JOIN produtos p ON p.id = i.produto_id';
      filtroCategoria =
        "AND p.categoria ILIKE '%' || $" + params.length + " || '%'";
    }

    let filtroData = '';
    if (opcoes.desde) {
      params.push(opcoes.desde);
      filtroData = 'AND v.data_movimentacao >= $' + params.length;
    }

    const rows = await this.repo.manager.query<{ total: string }[]>(
      `
      SELECT COUNT(DISTINCT c.id) AS total
      FROM clientes c
      JOIN movimentacoes v ON v.cliente_id = c.id AND ${vendaEfetiva('v')}${joinItens}
      WHERE c.vendedora_codigo_erp = $1
        AND c.ativo = TRUE
        ${filtroCategoria}
        ${filtroData}
      `,
      params,
    );
    return Number(rows[0]?.total ?? 0);
  }

  async maioresCompradoresDaCarteira(
    vendedoraCodigoErp: string,
    opcoes: { categoria?: string; desde?: Date; limite: number },
  ): Promise<ClienteDaCarteira[]> {
    // Com categoria a contagem e de ITENS (quantos aneis); sem categoria, de
    // COMPRAS. Sao perguntas diferentes: "quem comprou mais aneis" e "quem
    // mais compra de mim".
    const params: unknown[] = [vendedoraCodigoErp];
    let joinItens = '';
    let filtroCategoria = '';
    let quantidade = 'COUNT(DISTINCT v.id)';
    let valor = 'COALESCE(SUM(v.valor), 0)';

    if (opcoes.categoria) {
      params.push(opcoes.categoria);
      joinItens =
        ' JOIN movimentacoes_itens i ON i.movimentacao_id = v.id AND i.ativo' +
        ' JOIN produtos p ON p.id = i.produto_id';
      filtroCategoria =
        "AND p.categoria ILIKE '%' || $" + params.length + " || '%'";
      quantidade = 'COALESCE(SUM(i.quantidade), 0)';
      valor = 'COALESCE(SUM(i.quantidade * i.valor_unitario), 0)';
    }

    let filtroData = '';
    if (opcoes.desde) {
      params.push(opcoes.desde);
      filtroData = 'AND v.data_movimentacao >= $' + params.length;
    }

    params.push(opcoes.limite);
    const limite = '$' + params.length;

    const rows = await this.repo.manager.query<
      {
        id: string;
        nome: string;
        ultima_compra: Date | null;
        quantidade: string;
        valor_total: string;
      }[]
    >(
      `
      SELECT c.id,
             c.nome,
             MAX(v.data_movimentacao) AS ultima_compra,
             ${quantidade}     AS quantidade,
             ${valor}          AS valor_total
      FROM clientes c
      JOIN movimentacoes v ON v.cliente_id = c.id AND ${vendaEfetiva('v')}${joinItens}
      WHERE c.vendedora_codigo_erp = $1
        AND c.ativo = TRUE
        ${filtroCategoria}
        ${filtroData}
      GROUP BY c.id, c.nome
      ORDER BY quantidade DESC, valor_total DESC
      LIMIT ${limite}
      `,
      params,
    );

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      ultimaCompra: r.ultima_compra,
      quantidade: Number(r.quantidade),
      valorTotal: Number(r.valor_total),
    }));
  }

  /**
   * QUEM COMPRA NAQUELA EPOCA — 01/10/2026.
   *
   * ======================================================================
   * UMA JANELA POR ANO, SOMADAS.
   *
   * "Quem mais compra em outubro" e "quem compra no Dia das Maes" chegam
   * aqui iguais: uma lista de intervalos. Quem monta a lista sabe qual
   * pergunta foi feita — e por isso as datas MOVEIS funcionam sem esta
   * consulta precisar saber que a Pascoa muda de dia.
   * ======================================================================
   *
   * O TOTAL SAI DA MESMA VARREDURA, por COUNT(*) OVER (): a amostra e o
   * total respondem ao MESMO criterio. As outras duas da carteira usam duas
   * consultas porque la os criterios divergem — a lista tem LIMIT, a
   * contagem tem HAVING.
   */
  async compradoresPorEpoca(
    escopo: EscopoDeEpoca,
    janelas: { de: Date; ate: Date }[],
    limite: number,
  ): Promise<{ clientes: ClienteDaEpoca[]; total: number }> {
    // JANELA NENHUMA = PERGUNTA SEM RECORTE. Devolver a carteira inteira
    // seria responder outra coisa; vazio e a resposta honesta.
    if (janelas.length === 0) return { clientes: [], total: 0 };

    // O RECORTE DA CARTEIRA SO EXISTE QUANDO O ESCOPO DIZ CARTEIRA. Nao ha
    // caminho em que o filtro "cai" por um valor ausente — ele e escrito ou nao
    // e, e o tipo obriga quem chama a dizer qual dos dois quer.
    const params: unknown[] = [];
    let daCarteira = '';
    if (escopo.tipo === 'CARTEIRA') {
      params.push(escopo.vendedoraCodigoErp);
      daCarteira = `AND c.vendedora_codigo_erp = $${params.length}`;
    }
    const faixas = janelas.map((j) => {
      params.push(j.de, j.ate);
      return `(v.data_movimentacao BETWEEN $${params.length - 1} AND $${params.length})`;
    });
    params.push(limite);

    const rows = await this.dataSource.query<
      {
        id: string;
        nome: string;
        ultima_compra: Date | null;
        quantidade: string;
        valor_total: string;
        anos: string;
        total: string;
      }[]
    >(
      `
      SELECT c.id,
             c.nome,
             MAX(v.data_movimentacao)                               AS ultima_compra,
             COUNT(*)                                               AS quantidade,
             COALESCE(SUM(v.valor), 0)                              AS valor_total,
             COUNT(DISTINCT date_part('year', v.data_movimentacao)) AS anos,
             COUNT(*) OVER ()                                       AS total
      FROM clientes c
      JOIN movimentacoes v ON v.cliente_id = c.id AND ${vendaEfetiva('v')}
      WHERE c.ativo = TRUE
        ${daCarteira}
        AND (${faixas.join(' OR ')})
      GROUP BY c.id, c.nome
      ORDER BY quantidade DESC, valor_total DESC
      LIMIT $${params.length}
      `,
      params,
    );

    return {
      clientes: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        ultimaCompra: r.ultima_compra,
        quantidade: Number(r.quantidade),
        valorTotal: Number(r.valor_total),
        anos: Number(r.anos),
      })),
      // COUNT(*) OVER () conta os GRUPOS da consulta inteira, antes do LIMIT
      // — e exatamente "quantos clientes atendem ao criterio".
      total: Number(rows[0]?.total ?? 0),
    };
  }

  /**
   * OS CLIENTES POR NÍVEL DE FIDELIDADE, COM NOME — 09/10/2026.
   *
   * ==========================================================================
   * O MESMO DEFEITO DA HELENA, DO OUTRO LADO.
   *
   * O painel já dizia QUANTOS são Ouro, no cartão da tela de Clientes. Quem
   * precisa agir precisa saber QUEM — e foi o pedido da gestora. A regra do
   * nível não é reescrita aqui: ela vem de `shared/clientes/fidelidade.ts`,
   * de onde o SQL do cartão também sai desde hoje.
   * ==========================================================================
   *
   * `LEFT JOIN` nas movimentações, e não `JOIN`: sem isso o nível
   * "Sem compras" não existiria, e ele é a maior faixa da base — 616 de
   * 1.096. "Quem nunca comprou" é pergunta legítima e tem de ter resposta.
   *
   * A VENDEDORA VEM DA CARTEIRA (`clientes.vendedora_codigo_erp`), e não de
   * quem fez a venda. São respostas diferentes: 106 clientes compraram com
   * mais de uma vendedora, e "de quem é esse cliente" é a dona da carteira.
   * É também o que o `EscopoVendasService` usa, então a regra de quem vê o
   * quê continua sendo uma só.
   */
  async clientesPorFidelidade(
    escopo: EscopoDeCliente,
    recorte: RecorteDeFidelidade,
  ): Promise<PaginaDeFidelidade> {
    // O RECORTE DA CARTEIRA SÓ EXISTE QUANDO O ESCOPO DIZ CARTEIRA — mesmo
    // motivo do `compradoresPorEpoca`: não há caminho em que o filtro "caia"
    // por um valor ausente e a vendedora passe a ver a loja inteira.
    const params: unknown[] = [];
    let daCarteira = '';
    if (escopo.tipo === 'CARTEIRA') {
      params.push(escopo.vendedoraCodigoErp);
      daCarteira = `AND c.vendedora_codigo_erp = $${params.length}`;
    }

    // O NÍVEL É DERIVADO, então ele filtra DEPOIS do agrupamento — por isso
    // a consulta tem duas camadas, e não um WHERE a mais.
    let doNivel = '';
    if (recorte.nivel) {
      params.push(recorte.nivel);
      doNivel = `AND a.nivel = $${params.length}`;
    }
    let adormecido = '';
    if (recorte.semCompraDesde) {
      params.push(recorte.semCompraDesde);
      adormecido = `AND a.ultima_compra < $${params.length}`;
    }

    params.push(recorte.limite);
    const limite = `$${params.length}`;
    params.push(recorte.deslocamento ?? 0);
    const deslocamento = `$${params.length}`;

    const rows = await this.dataSource.query<
      {
        id: string;
        nome: string;
        nivel: NivelDeFidelidade;
        compras: string;
        valor_liquido: string;
        ultima_compra: Date | null;
        vendedora_nome: string | null;
        total: string;
        sem_vendedora: string;
      }[]
    >(
      `
      WITH agregado AS (
        SELECT c.id,
               c.nome,
               c.vendedora_codigo_erp,
               COUNT(*) FILTER (WHERE ${vendaEfetiva('m')})            AS compras,
               ${receitaLiquida('m')}                                  AS valor_liquido,
               MAX(m.data_movimentacao) FILTER (WHERE ${vendaEfetiva('m')})
                                                                       AS ultima_compra
        FROM clientes c
        LEFT JOIN movimentacoes m ON m.cliente_id = c.id
        WHERE c.ativo = TRUE
          ${daCarteira}
        GROUP BY c.id, c.nome, c.vendedora_codigo_erp
      ),
      comNivel AS (
        SELECT a.*, ${nivelEmSql('a.compras')} AS nivel, ${ordemEmSql('a.compras')} AS ordem
        FROM agregado a
      )
      SELECT a.id,
             a.nome,
             a.nivel,
             a.compras,
             a.valor_liquido,
             a.ultima_compra,
             v.nome                                                    AS vendedora_nome,
             COUNT(*) OVER ()                                          AS total,
             COUNT(*) FILTER (WHERE a.vendedora_codigo_erp IS NULL) OVER ()
                                                                       AS sem_vendedora
      FROM comNivel a
      LEFT JOIN vendedoras v ON v.codigo_erp = a.vendedora_codigo_erp
      WHERE TRUE
        ${doNivel}
        ${adormecido}
      ORDER BY a.ordem DESC, a.compras DESC, a.valor_liquido DESC, a.nome ASC
      LIMIT ${limite} OFFSET ${deslocamento}
      `,
      params,
    );

    return {
      clientes: rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        nivel: r.nivel,
        compras: Number(r.compras),
        valorLiquido: Number(r.valor_liquido),
        ultimaCompra: r.ultima_compra,
        vendedoraNome: r.vendedora_nome,
      })),
      total: Number(rows[0]?.total ?? 0),
      semVendedora: Number(rows[0]?.sem_vendedora ?? 0),
    };
  }

  async resolverVendedoraCodigoErpPorAdminUser(
    adminUserId: string,
  ): Promise<string | null> {
    const linhas = await this.repo.manager.query<{ codigo_erp: string }[]>(
      `SELECT codigo_erp FROM vendedoras WHERE admin_user_id = $1 LIMIT 1`,
      [adminUserId],
    );
    return linhas[0]?.codigo_erp ?? null;
  }

  async listar(filtros: FiltroCliente): Promise<Cliente[]> {
    const where: FindOptionsWhere<ClienteOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.tabelaPreco !== undefined) where.tabelaPreco = filtros.tabelaPreco;
    if (filtros.codigoErp !== undefined) where.codigoErp = filtros.codigoErp;
    if (filtros.vendedoraCodigoErp !== undefined) {
      where.vendedoraCodigoErp = filtros.vendedoraCodigoErp;
    }

    if (filtros.nome !== undefined) {
      where.nome = ILike('%' + escaparCuringas(filtros.nome) + '%');
    }

    // Buscando POR NOME a ordem util e alfabetica — quem digita "mar" quer
    // varrer Maria, Mariana, Marina, e nao a ordem de cadastro.
    const rows = await this.repo.find({
      where,
      order: filtros.nome !== undefined ? { nome: 'ASC' } : { criadoEm: 'DESC' },
      ...(filtros.limit !== undefined ? { take: filtros.limit } : {}),
    });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(cliente: Cliente): Promise<Cliente> {
    if (!cliente.id) {
      throw new Error('Cliente sem id nao pode ser atualizado');
    }
    await this.repo.update(cliente.id, this.toOrm(cliente));
    const refreshed = await this.repo.findOneByOrFail({ id: cliente.id });
    return this.toDomain(refreshed);
  }

  async remover(id: string): Promise<void> {
    // `clientes_perfil` cai por CASCADE declarado no schema — nao e preciso
    // apagar antes nem abrir transacao explicita.
    await this.repo.delete(id);
  }

  // Mapeamento Domain -> ORM. Note que telefone/email cifrados sao passados
  // em PLAINTEXT — o transformer cifra automaticamente no INSERT/UPDATE.
  // Os hashes vao em texto puro (nao sao cifrados).
  private toOrm(c: Cliente): Partial<ClienteOrmEntity> {
    return {
      idErp: c.idErp,
      codigoErp: c.codigoErp,
      nome: c.nome,
      nomeFantasia: c.nomeFantasia,
      tipoPessoa: c.tipoPessoa,
      tabelaPreco: c.tabelaPreco,
      telefone1: c.telefone1,
      telefone1Hash: c.telefone1Hash,
      telefone2: c.telefone2,
      email: c.email,
      emailHash: c.emailHash,
      ativo: c.ativo,
      limiteCredito: c.limiteCredito,
      observacaoGeral: c.observacaoGeral,
      observacaoCredito: c.observacaoCredito,
      vendedoraCodigoErp: c.vendedoraCodigoErp,
    };
  }

  private perfilToOrm(p: ClientePerfil): Partial<ClientePerfilOrmEntity> {
    return {
      whatsapp: p.whatsapp,
      whatsappHash: p.whatsappHash,
      origemContato: p.origemContato,
      estadoConversa: p.estadoConversa,
      estadoAtualizadoEm: p.estadoAtualizadoEm ?? new Date(),
      tipoCompra: p.tipoCompra,
      urgencia: p.urgencia,
      dataPretendidaCompra: p.dataPretendidaCompra,
      ticketEstimado: p.ticketEstimado,
      intencaoCompra: p.intencaoCompra,
      wishlist: p.wishlist,
      nivelConhecimento: p.nivelConhecimento,
      vendedoraSugeridaCodigo: p.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: p.vendedoraAprovadaCodigo,
      resumoTriagem: p.resumoTriagem,
      notasInternas: p.notasInternas,
      tags: p.tags ?? [],
      scorePerfil: p.scorePerfil,
      motivacaoCompra: p.motivacaoCompra,
      sexo: p.sexo,
      faixaEtaria: p.faixaEtaria,
      idade: p.idade,
    };
  }

  private toDomain(
    c: ClienteOrmEntity,
    perfilRow?: ClientePerfilOrmEntity | null,
  ): Cliente {
    return Cliente.create({
      id: c.id,
      idErp: c.idErp,
      codigoErp: c.codigoErp,
      nome: c.nome,
      nomeFantasia: c.nomeFantasia,
      tipoPessoa: c.tipoPessoa,
      tabelaPreco: c.tabelaPreco,
      telefone1: c.telefone1,
      telefone1Hash: c.telefone1Hash,
      telefone2: c.telefone2,
      email: c.email,
      emailHash: c.emailHash,
      ativo: c.ativo,
      // Decimal vem como string do Postgres — converte preservando null.
      limiteCredito: c.limiteCredito != null ? Number(c.limiteCredito) : null,
      observacaoGeral: c.observacaoGeral,
      observacaoCredito: c.observacaoCredito,
      vendedoraCodigoErp: c.vendedoraCodigoErp,
      criadoEm: c.criadoEm,
      atualizadoEm: c.atualizadoEm,
      perfil: perfilRow ? this.perfilToDomain(perfilRow) : null,
    });
  }

  private perfilToDomain(p: ClientePerfilOrmEntity): ClientePerfil {
    return ClientePerfil.create({
      clienteId: p.clienteId,
      whatsapp: p.whatsapp,
      whatsappHash: p.whatsappHash,
      origemContato: p.origemContato,
      estadoConversa: p.estadoConversa,
      estadoAtualizadoEm: p.estadoAtualizadoEm,
      tipoCompra: p.tipoCompra,
      urgencia: p.urgencia,
      dataPretendidaCompra: p.dataPretendidaCompra,
      ticketEstimado: p.ticketEstimado != null ? Number(p.ticketEstimado) : null,
      intencaoCompra: p.intencaoCompra,
      wishlist: p.wishlist,
      nivelConhecimento: p.nivelConhecimento,
      vendedoraSugeridaCodigo: p.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: p.vendedoraAprovadaCodigo,
      resumoTriagem: p.resumoTriagem,
      notasInternas: p.notasInternas,
      tags: p.tags ?? [],
      scorePerfil: p.scorePerfil,
      motivacaoCompra: p.motivacaoCompra,
      sexo: p.sexo,
      faixaEtaria: p.faixaEtaria,
      idade: p.idade != null ? Number(p.idade) : null,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    });
  }
}
