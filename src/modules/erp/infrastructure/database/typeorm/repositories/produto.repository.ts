import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  Produto,
  type PosicaoDeEstoque,
} from '../../../../domain/entities/produto.entity';
import {
  AlertasEstoque,
  FacetasProduto,
  FiltroProduto,
  IProdutoRepository,
  ProdutoAlerta,
  SaldoDaPeca,
} from '../../../../domain/ports/repositories/produto-repository.port';
import {
  SALDO_POR_PRODUTO,
  comSaldoEm,
  saldoDe,
} from '../../../../../../shared/database/sql/saldo-do-produto';
import { ProdutoOrmEntity } from '../entities/produto.orm-entity';

const NOME_PRODUTO = `COALESCE(NULLIF(descricao_etiqueta, ''), codigo_erp, categoria || ' ' || familia, LEFT(id::text, 8))`;

/**
 * O que o evento de produto do ERP NAO traz — e por isso nao reescreve.
 *
 * `codigoErp` e a chave do conflito. As outras duas o ERP nao conhece: o
 * `idErp` vem da API do integrador, a data de entrada vem de outro caminho. O
 * estoque nem passa por aqui — e a tabela `estoque`. Ver `upsertByCodigoErp`.
 */
const FORA_DO_EVENTO_DO_ERP = new Set<string>([
  'codigoErp',
  'idErp',
  'dataEntradaEstoque',
]);

@Injectable()
export class ProdutoRepository implements IProdutoRepository {
  constructor(
    @InjectRepository(ProdutoOrmEntity)
    private readonly repo: Repository<ProdutoOrmEntity>,
  ) {}

  /**
   * O caminho do ERP: cria a peca, ou atualiza o que o ERP manda sobre ela.
   *
   * ==========================================================================
   * O ERP NAO APAGA O QUE NAO MANDA — conserto de 11/09/2026.
   *
   * Isto era `repo.upsert(this.toOrm(produto))`. O evento do ERP nao traz
   * `idErp`, `estoqueAtual` nem `dataEntradaEstoque`, entao o `Produto` chegava
   * com `null`, `0` e `null` — e o TypeORM 1.0.0 sobrescreve no conflito TODA
   * coluna cujo valor nao seja `undefined`. Reproduzido no banco local: UM
   * evento tirou o `idErp` de uma peca, zerou o estoque e apagou a data de
   * entrada. No homolog, os 6.911 produtos estavam sem data — e sem data os
   * dois graficos de giro nunca teriam como funcionar.
   *
   * Agora o INSERT leva a peca inteira, e o `ON CONFLICT` so reescreve as
   * colunas que o ERP e dono. O que ele nao conhece fica como esta.
   *
   * PECA NOVA NASCE COM A DATA DE ENTRADA DE HOJE. O ERP nao manda a data, e a
   * chegada da peca no ERP e a melhor aproximacao que o sistema tem da chegada
   * na loja. Vale so no INSERT: no conflito a coluna nao esta na lista, entao
   * uma data que ja existe nunca e trocada.
   * ==========================================================================
   */
  async upsertByCodigoErp(produto: Produto): Promise<Produto> {
    const linha = this.toOrm(produto);

    const colunasDoErp = Object.keys(linha)
      .filter((propriedade) => !FORA_DO_EVENTO_DO_ERP.has(propriedade))
      .map((propriedade) => {
        const coluna =
          this.repo.metadata.findColumnWithPropertyName(propriedade);
        if (!coluna) {
          throw new Error(`Coluna do ERP sem mapeamento: ${propriedade}`);
        }
        return coluna.databaseName;
      });

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(ProdutoOrmEntity)
      .values({ ...linha, dataEntradaEstoque: () => 'now()' })
      .orUpdate(colunasDoErp, ['codigo_erp'], {
        skipUpdateIfNoValuesChanged: true,
      })
      .execute();

    const saved = await this.repo.findOneByOrFail({ codigoErp: produto.codigoErp! });
    return this.umComSaldo(saved);
  }

  /** UPDATE de uma coluna so — ver o porque no `toOrm`. */
  async definirFotoArquivo(id: string, chave: string | null): Promise<void> {
    await this.repo.update({ id }, { fotoArquivoId: chave });
  }

  async buscarCodigosPresentesEm(texto: string): Promise<string[]> {
    const limpo = (texto ?? '').trim();
    if (!limpo) return [];

    // `position`, e NAO `LIKE`: existe `MESA_PERSONAL` na base, e o `_` e
    // curinga do LIKE — ele casaria com `MESAXPERSONAL`. `position` compara
    // texto puro.
    //
    // O `<> ''` nao e zelo: uma peca tem codigo VAZIO (string em branco, nao
    // NULL). Sem ele, a posicao de '' em qualquer texto e 1, e essa peca
    // casaria com toda legenda que chegasse.
    //
    // VARRE A TABELA, e tudo bem: sao ~7.000 linhas, e isto roda uma vez por
    // foto que chega pelo WhatsApp. Indice nao ajudaria — a busca e por
    // conteudo DENTRO do texto recebido, nao por prefixo do codigo.
    const linhas = await this.repo.manager.query<{ codigo_erp: string }[]>(
      `SELECT codigo_erp
         FROM produtos
        WHERE codigo_erp IS NOT NULL
          AND codigo_erp <> ''
          AND position(upper(codigo_erp) in upper($1)) > 0
        ORDER BY length(codigo_erp) DESC, codigo_erp
        LIMIT 50`,
      [limpo],
    );

    return linhas.map((l) => l.codigo_erp);
  }

  async findByCodigoErp(codigoErp: string): Promise<Produto | null> {
    const entity = await this.repo.findOneBy({ codigoErp });
    return entity ? this.umComSaldo(entity) : null;
  }

  async findByIdErp(idErp: string): Promise<Produto | null> {
    const entity = await this.repo.findOneBy({ idErp });
    return entity ? this.umComSaldo(entity) : null;
  }

  async findAll(filtros: FiltroProduto): Promise<Produto[]> {
    const qb = this.montarConsulta(filtros);

    // ORDEM DE PERGUNTA DE PRECO E O PRECO. Quem pede "pecas ate 20 mil" quer
    // uma tabela, e tabela de preco se le do mais barato para o mais caro —
    // e o mesmo formato do relatorio do Safira que a gestao usa hoje. Sem
    // faixa, segue valendo a entrada mais recente primeiro.
    const porPreco =
      filtros.precoDe !== undefined || filtros.precoAte !== undefined;
    if (porPreco) qb.orderBy('p.valor_venda', 'ASC');
    else qb.orderBy('p.criado_em', 'DESC');

    // O DESEMPATE NAO E ZELO — e o que faz a pagina 2 ser a pagina 2. Com
    // duas pecas do mesmo preco e sem segundo criterio, o Postgres pode
    // devolve-las em ordem diferente a cada consulta: uma repete na pagina
    // seguinte e outra desaparece, sem erro nenhum. Foi o conserto da
    // carteira em 05/10, e `id` e unico por definicao.
    qb.addOrderBy('p.id', 'ASC');

    if (filtros.deslocamento) qb.skip(Math.max(0, Math.trunc(filtros.deslocamento)));
    if (filtros.limit) qb.take(filtros.limit);

    return this.comSaldo(await qb.getMany());
  }

  /**
   * QUANTAS SAO DE VERDADE, sem o teto da lista — 07/10/2026.
   *
   * Nasceu de um teste do Lucas no mesmo dia. Ele perguntou "tem alguma
   * esmeralda sem estoque?" e a Anastasia respondeu:
   *
   *   "Nenhuma esmeralda esta sem estoque — todas as SEIS pecas que aparecem
   *    no catalogo estao disponiveis."
   *
   * Sao 112 no catalogo, 9 com saldo. O modelo recebeu as seis do teto e
   * raciocinou sobre elas como se fossem o catalogo inteiro — do mesmo jeito
   * que a carteira fazia antes de 21/08, quando passou a devolver AMOSTRA +
   * TOTAL. Teto sem total vira resposta confiante e errada.
   *
   * A MESMA consulta do `findAll`, sem `take` e sem ordem: nao da para contar
   * por uma regra e listar por outra.
   */
  async contar(filtros: FiltroProduto): Promise<number> {
    return this.montarConsulta(filtros).getCount();
  }

  private montarConsulta(filtros: FiltroProduto) {
    const qb = this.repo.createQueryBuilder('p');

    if (filtros.categoria !== undefined) {
      qb.andWhere('p.categoria = :categoria', { categoria: filtros.categoria });
    }
    if (filtros.familia !== undefined) {
      qb.andWhere('p.familia = :familia', { familia: filtros.familia });
    }
    if (filtros.ativo !== undefined) {
      qb.andWhere('p.ativo = :ativo', { ativo: filtros.ativo });
    }

    // CADA PALAVRA precisa aparecer em ALGUM campo — e nao a frase inteira
    // num campo so. "brinco de esmeralda" nao casa com "Brinco Vintage
    // Esmeralda" se procurado como uma string unica, porque as palavras nao
    // sao vizinhas. Entao: AND entre as palavras, OR entre as colunas.
    //
    // Palavras de ate dois caracteres saem ("de", "do", "e"): elas casam com
    // quase tudo e so estragariam o filtro.
    //
    // ======================================================================
    // ... E O CODIGO VALE SOZINHO — 06/10/2026.
    //
    // A gestora escreveu "An24084 me da a descricao desse produto". O AND
    // exigia que "descricao" tambem aparecesse em algum campo; nao aparece
    // em nenhum, e a consulta voltou VAZIA. A peca existe, esta ativa e vale
    // R$ 37.900 — e a Anastasia respondeu "pode ser que o codigo esteja um
    // pouco diferente", inventando uma explicacao para um defeito nosso.
    //
    // Mesma familia do "Rafaela Santos" de 02/10: o defeito mais caro e o
    // que responde com CONFIANCA, porque quem pergunta desiste ali.
    //
    // O OR NAO AFROUXA NADA: casa por igualdade exata, e so com palavra que
    // tem letra E digito (ver `codigosNaBusca`). Medido na base antes de
    // entrar — "brinco de esmeralda", "anel ouro", "colar safira" e
    // "pulseira diamante" devolvem exatamente o mesmo de antes.
    // ======================================================================
    const palavras = palavrasDaBusca(filtros.busca);
    const codigos = codigosNaBusca(filtros.busca);

    if (palavras.length > 0 || codigos.length > 0) {
      qb.andWhere(
        // Os parenteses importam: sem eles o OR vazaria e anularia os
        // filtros de categoria/familia/ativo acima.
        new Brackets((raiz) => {
          if (palavras.length > 0) {
            raiz.where(
              new Brackets((todas) => {
                // AQUI DENTRO, E NAO LA EM CIMA — 07/10/2026.
                //
                // O filtro de saldo mora no ramo das PALAVRAS para que o ramo
                // do CODIGO, logo abaixo no mesmo OR, passe por fora dele.
                // "Me da a descricao do An24084" tem que achar a peca mesmo
                // sem estoque; "anel de esmeralda" nao pode trazer o que a
                // loja nao tem.
                if (filtros.apenasDisponiveis) {
                  todas.andWhere(comSaldoEm('p'));
                }
                if (filtros.categoriaSugerida) {
                  todas.andWhere('p.categoria = :categoriaSugerida', {
                    categoriaSugerida: filtros.categoriaSugerida,
                  });
                }
                if (filtros.precoDe !== undefined) {
                  todas.andWhere('p.valor_venda >= :precoDe', {
                    precoDe: filtros.precoDe,
                  });
                }
                if (filtros.precoAte !== undefined) {
                  todas.andWhere('p.valor_venda <= :precoAte', {
                    precoAte: filtros.precoAte,
                  });
                }
                for (const [i, palavra] of palavras.entries()) {
                  const chave = `busca${i}`;
                  const termo = `%${palavra}%`;
                  todas.andWhere(
                    new Brackets((b) =>
                      b
                        .where(`p.descricao_etiqueta ILIKE :${chave}`, { [chave]: termo })
                        .orWhere(`p.categoria ILIKE :${chave}`, { [chave]: termo })
                        .orWhere(`p.familia ILIKE :${chave}`, { [chave]: termo })
                        .orWhere(`p.colecao ILIKE :${chave}`, { [chave]: termo })
                        .orWhere(`p.tipo_pedra ILIKE :${chave}`, { [chave]: termo })
                        .orWhere(`p.cor ILIKE :${chave}`, { [chave]: termo })
                        .orWhere(`p.codigo_erp ILIKE :${chave}`, { [chave]: termo }),
                    ),
                  );
                }
              }),
            );
          } else {
            // So codigo na busca: a parte das palavras nao pode casar nada,
            // senao o OR abaixo traria o catalogo inteiro.
            raiz.where('1 = 0');
          }

          if (codigos.length > 0) {
            raiz.orWhere(`upper(p.codigo_erp) = ANY(:codigosDaBusca)`, {
              codigosDaBusca: codigos,
            });
          }
        }),
      );
    } else {
      // Sem texto nenhum — a listagem do painel, ou a tool sem termo. Nao ha
      // ramo de codigo para preservar, entao os filtros sao diretos.
      if (filtros.apenasDisponiveis) qb.andWhere(comSaldoEm('p'));
      if (filtros.categoriaSugerida) {
        qb.andWhere('p.categoria = :categoriaSugerida', {
          categoriaSugerida: filtros.categoriaSugerida,
        });
      }
      if (filtros.precoDe !== undefined) {
        qb.andWhere('p.valor_venda >= :precoDe', { precoDe: filtros.precoDe });
      }
      if (filtros.precoAte !== undefined) {
        qb.andWhere('p.valor_venda <= :precoAte', {
          precoAte: filtros.precoAte,
        });
      }
    }

    return qb;
  }

  async findById(id: string): Promise<Produto | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.umComSaldo(entity) : null;
  }

  async save(produto: Produto): Promise<Produto> {
    const data: Partial<ProdutoOrmEntity> = {
      ...this.toOrm(produto),
      ...(produto.id ? { id: produto.id } : {}),
    };
    const entity = this.repo.create(data);
    const saved = await this.repo.save(entity);
    return this.umComSaldo(saved);
  }

  async saveMany(produtos: Produto[]): Promise<Produto[]> {
    const entities = produtos.map((p) =>
      this.repo.create({
        ...this.toOrm(p),
        ...(p.id ? { id: p.id } : {}),
      }),
    );
    // repo.save com array roda numa transacao (all-or-nothing): se um item
    // viola constraint (ex.: codigoErp duplicado), o lote inteiro reverte.
    const saved = await this.repo.save(entities);
    return this.comSaldo(saved);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async facetas(): Promise<FacetasProduto> {
    const [
      fornecedores,
      categorias,
      familias,
      pedras,
      colecoes,
      cores,
      empresas,
      locais,
      grupos,
    ] = await Promise.all([
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT referencia_fornecedor AS v FROM produtos
         WHERE referencia_fornecedor IS NOT NULL AND referencia_fornecedor <> '' ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT categoria AS v FROM produtos WHERE categoria <> '' ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT familia AS v FROM produtos WHERE familia <> '' ORDER BY 1`,
      ),
      // As tres seguintes alimentam o cadastro manual de peca. Sao colunas de
      // TEXTO LIVRE, sem tabela de dominio: a lista de opcoes e a propria base
      // dizendo o que ja existe.
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT tipo_pedra AS v FROM produtos
         WHERE tipo_pedra IS NOT NULL AND tipo_pedra <> '' ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT colecao AS v FROM produtos
         WHERE colecao IS NOT NULL AND colecao <> '' ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT cor AS v FROM produtos
         WHERE cor IS NOT NULL AND cor <> '' ORDER BY 1`,
      ),
      // Os tres eixos do estoque: o CADASTRO inteiro, com peca ou sem.
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT nome AS v FROM empresas WHERE ativo ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT nome AS v FROM locais_estoque WHERE ativo ORDER BY 1`,
      ),
      this.repo.manager.query<{ v: string }[]>(
        `SELECT DISTINCT nome AS v FROM grupos_estoque WHERE ativo ORDER BY 1`,
      ),
    ]);
    return {
      fornecedores: fornecedores.map((r) => r.v),
      categorias: categorias.map((r) => r.v),
      familias: familias.map((r) => r.v),
      pedras: pedras.map((r) => r.v),
      colecoes: colecoes.map((r) => r.v),
      cores: cores.map((r) => r.v),
      empresas: empresas.map((r) => r.v),
      locais: locais.map((r) => r.v),
      grupos: grupos.map((r) => r.v),
    };
  }

  async alertasEstoque(limiteBaixo: number, diasGiroLento: number): Promise<AlertasEstoque> {
    // O TOTAL SAI DA MESMA CONSULTA, pelo `count(*) OVER()`: a janela conta
    // as linhas que passaram no WHERE ANTES de o LIMIT cortar. Uma segunda
    // consulta so para contar repetiria o filtro — e as duas copias divergiriam
    // na primeira vez que alguem mexesse em uma so.
    const [estoqueBaixo, giroLento] = await Promise.all([
      this.repo.manager.query<ProdutoAlertaComTotal[]>(
        `
        SELECT id, ${NOME_PRODUTO} AS nome, categoria, familia,
               NULLIF(referencia_fornecedor, '') AS fornecedor,
               ${saldoDe('sal')} AS "estoqueAtual",
               NULL::int AS "diasEmEstoque",
               count(*) OVER() AS total
        FROM produtos
        LEFT JOIN ${SALDO_POR_PRODUTO} sal ON sal.produto_id = produtos.id
        -- BAIXO E "TEM, MAS POUCO": de 1 ao limite. Era \`<= limite\`, e com
        -- o saldo real o zero punha ~6.500 pecas no alerta — o catalogo
        -- inteiro. Zero e "sem estoque", como no filtro da tela.
        WHERE ativo = true AND ${saldoDe('sal')} BETWEEN 1 AND $1
        ORDER BY ${saldoDe('sal')} ASC
        LIMIT 50
        `,
        [limiteBaixo],
      ),
      this.repo.manager.query<ProdutoAlertaComTotal[]>(
        `
        SELECT id, ${NOME_PRODUTO} AS nome, categoria, familia,
               NULLIF(referencia_fornecedor, '') AS fornecedor,
               ${saldoDe('sal')} AS "estoqueAtual",
               EXTRACT(DAY FROM (now() - data_entrada_estoque))::int AS "diasEmEstoque",
               count(*) OVER() AS total
        FROM produtos
        LEFT JOIN ${SALDO_POR_PRODUTO} sal ON sal.produto_id = produtos.id
        WHERE ativo = true AND ${saldoDe('sal')} > 0
          AND data_entrada_estoque IS NOT NULL
          AND data_entrada_estoque <= now() - ($1::int * interval '1 day')
        ORDER BY data_entrada_estoque ASC
        LIMIT 50
        `,
        [diasGiroLento],
      ),
    ]);
    return {
      estoqueBaixo: estoqueBaixo.map(semTotal),
      giroLento: giroLento.map(semTotal),
      totalEstoqueBaixo: totalDa(estoqueBaixo),
      totalGiroLento: totalDa(giroLento),
    };
  }

  async saldoPorEmpresa(produtoId: string): Promise<SaldoDaPeca[]> {
    const linhas = await this.repo.manager.query<
      {
        empresa: string;
        local: string;
        grupo: string;
        quantidade: number;
        atualizadoEm: Date;
      }[]
    >(
      `SELECT e.nome AS empresa, l.nome AS local, g.nome AS grupo,
              s.quantidade, s.atualizado_em AS "atualizadoEm"
         FROM estoque s
         JOIN empresas e ON e.id = s.empresa_id
         JOIN locais_estoque l ON l.id = s.local_estoque_id
         JOIN grupos_estoque g ON g.id = s.grupo_estoque_id
        WHERE s.produto_id = $1 AND s.quantidade <> 0
        ORDER BY s.quantidade DESC, e.nome`,
      [produtoId],
    );
    return linhas.map((l) => ({ ...l, quantidade: Number(l.quantidade) }));
  }

  /**
   * A foto propria NAO passa por aqui, e a ausencia e deliberada.
   *
   * Este mapeamento alimenta o `upsertByCodigoErp`, que e o caminho do ERP.
   * Listar `fotoArquivoId` aqui faria toda sincronizacao do Safira escrever
   * nela — NULL, na pratica, porque o ERP nao conhece o campo — e a foto que a
   * loja subiu sumiria sem aviso. Quem escreve nela e o `definirFotoArquivo`.
   */
  private toOrm(p: Produto): Partial<ProdutoOrmEntity> {
    return {
      idErp: p.idErp,
      codigoErp: p.codigoErp,
      categoria: p.categoria,
      familia: p.familia,
      colecao: p.colecao,
      cor: p.cor,
      tamanho: p.tamanho,
      tipoPedra: p.tipoPedra,
      colecaoPedra: p.colecaoPedra,
      referenciaFornecedor: p.referenciaFornecedor,
      descricaoEtiqueta: p.descricaoEtiqueta,
      pesoGramas: p.pesoGramas,
      unidade: p.unidade,
      valorCompra: p.valorCompra,
      valorCusto: p.valorCusto,
      margemPercentual: p.margemPercentual,
      valorVenda: p.valorVenda,
      observacao: p.observacao,
      fotoUrl: p.fotoUrl,
      ativo: p.ativo,
      dataEntradaEstoque: p.dataEntradaEstoque,
    };
  }

  /**
   * O saldo das pecas, numa consulta so — pela tabela `estoque`, e nao pela
   * coluna aposentada. Ver `saldo-do-produto.ts`.
   *
   * Uma ida ao banco por LISTA, e nao por peca: a tela de Produtos carrega
   * o catalogo inteiro (~7 mil) de uma vez.
   */
  private async comSaldo(entidades: ProdutoOrmEntity[]): Promise<Produto[]> {
    if (entidades.length === 0) return [];
    // AS POSICOES VEM JUNTO, e o saldo e a soma delas (17/09/2026): a tela de
    // Produtos mostra e filtra por empresa, local e grupo. Uma consulta so —
    // ~7 mil linhas para o catalogo inteiro. As zeradas vem tambem: filtrar
    // por empresa tem de achar a peca que existe la com zero.
    const linhas = await this.repo.manager.query<
      {
        produto_id: string;
        empresa: string;
        local: string;
        grupo: string;
        quantidade: number;
      }[]
    >(
      `SELECT s.produto_id,
              COALESCE(e.nome, '—') AS empresa,
              COALESCE(l.nome, '—') AS local,
              COALESCE(g.nome, '—') AS grupo,
              s.quantidade
         FROM estoque s
         LEFT JOIN empresas e ON e.id = s.empresa_id
         LEFT JOIN locais_estoque l ON l.id = s.local_estoque_id
         LEFT JOIN grupos_estoque g ON g.id = s.grupo_estoque_id
        WHERE s.produto_id = ANY($1)
        ORDER BY s.quantidade DESC, e.nome`,
      [entidades.map((e) => e.id)],
    );
    const porProduto = new Map<string, PosicaoDeEstoque[]>();
    for (const l of linhas) {
      const lista = porProduto.get(l.produto_id) ?? [];
      lista.push({
        empresa: l.empresa,
        local: l.local,
        grupo: l.grupo,
        quantidade: Number(l.quantidade),
      });
      porProduto.set(l.produto_id, lista);
    }
    return entidades.map((e) => this.toDomain(e, porProduto.get(e.id) ?? []));
  }

  private async umComSaldo(entidade: ProdutoOrmEntity): Promise<Produto> {
    const [produto] = await this.comSaldo([entidade]);
    return produto;
  }

  private toDomain(o: ProdutoOrmEntity, posicoes: PosicaoDeEstoque[]): Produto {
    return Produto.create({
      idErp: o.idErp,
      id: o.id,
      codigoErp: o.codigoErp,
      categoria: o.categoria,
      familia: o.familia,
      colecao: o.colecao,
      cor: o.cor,
      tamanho: o.tamanho,
      tipoPedra: o.tipoPedra,
      colecaoPedra: o.colecaoPedra,
      referenciaFornecedor: o.referenciaFornecedor,
      descricaoEtiqueta: o.descricaoEtiqueta,
      pesoGramas: o.pesoGramas ? Number(o.pesoGramas) : null,
      unidade: o.unidade,
      valorCompra: o.valorCompra ? Number(o.valorCompra) : null,
      valorCusto: o.valorCusto ? Number(o.valorCusto) : null,
      margemPercentual: o.margemPercentual ? Number(o.margemPercentual) : null,
      valorVenda: Number(o.valorVenda),
      observacao: o.observacao,
      fotoUrl: o.fotoUrl,
      fotoArquivoId: o.fotoArquivoId,
      ativo: o.ativo,
      estoqueAtual: posicoes.reduce((s, p) => s + p.quantidade, 0),
      posicoes,
      dataEntradaEstoque: o.dataEntradaEstoque,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}

/**
 * Palavras uteis de uma busca livre. Descarta as de ate dois caracteres — "de",
 * "do", "e" casam com quase tudo — e limita a quatro, para uma frase longa nao
 * virar oito condicoes no banco.
 */
function palavrasDaBusca(busca: string | undefined): string[] {
  return (busca ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 4);
}

/**
 * As palavras da busca que PARECEM UM CODIGO do ERP — 06/10/2026.
 *
 * ==========================================================================
 * LETRA **E** DIGITO, e e essa conjuncao que faz a regra funcionar.
 *
 * A primeira versao desta correcao tratava qualquer palavra como candidata a
 * codigo, e poluia a busca mais comum da casa: existem produtos cadastrados
 * com `codigo_erp` igual a ANEL, COLAR, BRINCO, PINGENTE e PULSEIRA (cinco
 * de cada). Procurar "anel ouro" passava a trazer, junto, a peca cujo codigo
 * e literalmente ANEL.
 *
 * Exigir digito mata isso pela raiz, e nao por lista de excecoes: ANEL so
 * tem letra, 1.54 so tem numero, AN24084 e CO24022 tem os dois.
 *
 * A PONTUACAO DAS BORDAS SAI antes de comparar. "tem o CO24022?" chegava com
 * a interrogacao grudada, e a igualdade falhava — o usuario escreve pergunta,
 * nao consulta.
 *
 * E ESTAS NAO PASSAM PELO CORTE DAS QUATRO PALAVRAS. Em "qual a descricao
 * completa daquele anel bonito An24084" o codigo e a SETIMA palavra longa, e
 * `palavrasDaBusca` para na quarta. Quem cita um codigo quer aquela peca,
 * esteja ela no comeco ou no fim da frase.
 *
 * Devolve em CAIXA ALTA porque a comparacao e `upper(codigo_erp) = ANY(...)`.
 * ==========================================================================
 */
export function codigosNaBusca(busca: string | undefined): string[] {
  return (busca ?? '')
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(
      (p) => p.length >= 3 && /\p{L}/u.test(p) && /\p{N}/u.test(p),
    )
    .slice(0, 4)
    .map((p) => p.toUpperCase());
}

/** A linha do alerta como sai do banco: com o total da janela pendurado. */
type ProdutoAlertaComTotal = ProdutoAlerta & { total: string | number };

/** Tira o total da linha — ele e da lista, nao da peca. */
function semTotal(l: ProdutoAlertaComTotal): ProdutoAlerta {
  return {
    id: l.id,
    nome: l.nome,
    categoria: l.categoria,
    familia: l.familia,
    fornecedor: l.fornecedor,
    estoqueAtual: l.estoqueAtual,
    diasEmEstoque: l.diasEmEstoque,
  };
}

/**
 * O total da janela. Toda linha carrega o mesmo; sem linha nenhuma, e zero. O
 * Postgres devolve `count` como bigint, que chega aqui como TEXTO.
 */
function totalDa(linhas: ProdutoAlertaComTotal[]): number {
  return linhas.length ? Number(linhas[0].total) : 0;
}
