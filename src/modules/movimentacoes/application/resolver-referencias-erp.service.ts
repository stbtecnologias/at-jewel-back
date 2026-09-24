import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { normalizarIdErp } from '../../../shared/erp/normalizar-id-erp';
import { CLIENTE_REPOSITORY } from '../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../clientes/domain/ports/repositories/cliente-repository.port';
import { EMPRESA_REPOSITORY } from '../../empresas/domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../empresas/domain/ports/repositories/empresa-repository.port';
import { PRODUTO_REPOSITORY } from '../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../erp/domain/ports/repositories/produto-repository.port';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../formas-pagamento/domain/ports/injection-tokens';
import { FORNECEDOR_REPOSITORY } from '../../fornecedores/domain/ports/injection-tokens';
import type { IFornecedorRepository } from '../../fornecedores/domain/ports/repositories/fornecedor-repository.port';
import type { IFormaPagamentoRepository } from '../../formas-pagamento/domain/ports/repositories/forma-pagamento-repository.port';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../grupos-estoque/domain/ports/injection-tokens';
import { LOCAL_ESTOQUE_REPOSITORY } from '../../locais-estoque/domain/ports/injection-tokens';
import type { ILocalEstoqueRepository } from '../../locais-estoque/domain/ports/repositories/local-estoque-repository.port';
import type { IGrupoEstoqueRepository } from '../../grupos-estoque/domain/ports/repositories/grupo-estoque-repository.port';
import { OPERACAO_REPOSITORY } from '../../operacoes/domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../operacoes/domain/ports/repositories/operacao-repository.port';
import { VENDEDORA_REPOSITORY } from '../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../vendedoras/domain/ports/repositories/vendedora-repository.port';

/**
 * O par que toda referencia do ERP vira aqui dentro.
 *
 * `idErp` e SEMPRE preenchido quando o ERP mandou alguma coisa, mesmo que
 * `id` fique nulo. E a coluna-sombra da migracao 46, e e o ponto inteiro
 * deste servico.
 */
export interface Referencia {
  id: string | null;
  idErp: string | null;
}

const NAO_VEIO: Referencia = { id: null, idErp: null };

/**
 * O minimo que toda tabela referenciada tem: o nosso id e o do ERP.
 *
 * O `id` e opcional no tipo porque varias entidades de dominio o declaram
 * assim (ele so falta antes de gravar). Aqui elas sempre vem do banco, entao
 * o `id` existe — e o `?? null` no uso fecha o caso impossivel.
 */
interface RegistroComIdErp {
  id?: string;
  idErp?: string | null;
}

/**
 * O UUID veio e nao existe.
 *
 * ERRO, e nao pendencia: o id do ERP e dele e pode chegar antes da nossa
 * carga; o UUID e NOSSO, e so pode ter saido de uma consulta a esta API. Nao
 * achando, o mapa dele esta velho ou trocado — e gravar a movimentacao
 * apontando para o vazio seria perder o dado com cara de sucesso.
 */
/** De que tabela e a ponta da movimentacao. */
export type TipoEntidade = 'cliente' | 'fornecedor' | 'empresa' | 'local';

/** A ponta resolvida pelo nosso UUID: sempre com id, e com o tipo encontrado. */
export interface Entidade {
  id: string;
  idErp: string | null;
  tipo: TipoEntidade;
}

export class ReferenciaInexistenteError extends BadRequestException {
  constructor(
    readonly tipo: string,
    readonly uuid: string,
  ) {
    // 400 e nao 500: quem errou foi o payload, e a mensagem diz QUAL campo e
    // QUAL id — sem isso o integrador recebe "erro interno" e nao tem por
    // onde comecar.
    super(`${tipo} ${uuid} nao existe`);
  }
}

/**
 * Traduz os identificadores do Safira nos nossos UUIDs.
 *
 * ==========================================================================
 * RESOLUCAO E BEST-EFFORT, E O ID CRU NUNCA SE PERDE.
 *
 * Nao achar o cadastro NAO e erro. Vai acontecer o tempo todo, e o dump prova:
 * a movimentacao 1308414 referencia a entidade 1308412 e o vendedor 1308425 —
 * vizinhos dela na sequencia do ERP. Sao cliente e vendedor criados no ATO da
 * venda. O documento chega antes do cadastro, e nao ha ordem de sincronizacao
 * que impeca isso sempre.
 *
 * O que NAO pode acontecer e o que `/erp/vendas` faz hoje: gravar a FK nula,
 * escrever um warning e devolver 200, jogando fora o id que veio. Aquilo e
 * perda de dado disfarcada de sucesso — nao ha como religar depois sem pedir o
 * documento de novo.
 *
 * Aqui o id cru fica gravado. Uma passada de reparo liga a FK quando o
 * cadastro chegar, e os indices parciais da migracao 46 existem exatamente
 * para achar essas linhas sem varrer a tabela.
 * ==========================================================================
 *
 * O log continua, em `debug` e nao em `warn`: com o volume esperado de
 * movimentacao, um warn por referencia nao resolvida afogaria o log com o
 * caso NORMAL, e o efeito seria ninguem mais ler warn nenhum. O que precisa de
 * atencao esta consultavel no banco, pelos indices de pendencia.
 */
@Injectable()
export class ResolverReferenciasErpService {
  private readonly logger = new Logger(ResolverReferenciasErpService.name);

  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly operacoes: IOperacaoRepository,
    @Inject(EMPRESA_REPOSITORY)
    private readonly empresas: IEmpresaRepository,
    @Inject(GRUPO_ESTOQUE_REPOSITORY)
    private readonly grupos: IGrupoEstoqueRepository,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(FORMA_PAGAMENTO_REPOSITORY)
    private readonly formasPagamento: IFormaPagamentoRepository,
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly fornecedores: IFornecedorRepository,
    @Inject(LOCAL_ESTOQUE_REPOSITORY)
    private readonly locais: ILocalEstoqueRepository,
  ) {}

  /**
   * Uma ponta da movimentacao pelo NOSSO UUID — 16/09/2026.
   *
   * A ponta e POLIMORFICA, entao o UUID e procurado nas QUATRO tabelas ao
   * mesmo tempo. UUID nao se repete entre tabelas: no maximo uma acha, e ela
   * diz o TIPO. Nao achando em nenhuma e o mesmo erro de todo UUID desta API —
   * o UUID e NOSSO e so pode ter saido de uma consulta a ela.
   *
   * ==========================================================================
   * O LOCAL DE ESTOQUE ENTROU EM 24/09/2026 — decisao do Lucas, para as DUAS
   * pontas.
   *
   * O Safira poe a loja numa ponta da movimentacao, e o integrador vinha
   * mandando o UUID do local `ESTOQUE` — cujo `id_erp` e `009000000018`, o
   * mesmo numero da entidade da loja la. Tomava 400 ("entidade ... nao
   * existe") porque so procuravamos em cliente, fornecedor e empresa.
   *
   * O CUSTO, E FOI ACEITO: a coluna-sombra `entidade_*_id_erp` passa a guardar
   * id de dois espacos de numeracao — o de entidades e o de locais — sem nada
   * na linha dizendo qual e qual. Quem for reconciliar isso depois precisa
   * saber que a coluna nao e homogenea.
   *
   * A ORDEM IMPORTA POUCO e mesmo assim e deliberada: cliente vem primeiro
   * porque e a unica cujo tipo muda o resto do fluxo (`clienteDaMovimentacao`).
   * Local vem por ultimo por ser o caso menos frequente.
   * ==========================================================================
   *
   * Devolve `null` quando nao veio UUID: ai a ponta segue pelo id do ERP, se
   * tiver vindo.
   */
  async entidade(uuid?: string | null): Promise<Entidade | null> {
    if (!uuid) return null;

    const [cliente, fornecedor, empresa, local] = await Promise.all([
      this.clientes.buscarPorId(uuid),
      this.fornecedores.buscarPorId(uuid),
      this.empresas.buscarPorId(uuid),
      this.locais.buscarPorId(uuid),
    ]);

    const achados: Array<[RegistroComIdErp | null, TipoEntidade]> = [
      [cliente, 'cliente'],
      [fornecedor, 'fornecedor'],
      [empresa, 'empresa'],
      [local, 'local'],
    ];
    for (const [registro, tipo] of achados) {
      if (registro?.id) {
        return { id: registro.id, idErp: registro.idErp ?? null, tipo };
      }
    }
    throw new ReferenciaInexistenteError('entidade', uuid);
  }

  async operacao(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('operacao', idErpBruto, uuid, {
      porIdErp: (chave) => this.operacoes.buscarPorIdErp(chave),
      porId: (id) => this.operacoes.buscarPorId(id),
    });
  }

  async empresa(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('empresa', idErpBruto, uuid, {
      porIdErp: (chave) => this.empresas.buscarPorIdErp(chave),
      porId: (id) => this.empresas.buscarPorId(id),
    });
  }

  async grupoEstoque(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('grupo_estoque', idErpBruto, uuid, {
      porIdErp: (chave) => this.grupos.buscarPorIdErp(chave),
      porId: (id) => this.grupos.buscarPorId(id),
    });
  }

  async cliente(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('cliente', idErpBruto, uuid, {
      porIdErp: (chave) => this.clientes.buscarPorIdErp(chave),
      porId: (id) => this.clientes.buscarPorId(id),
    });
  }

  async vendedora(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('vendedora', idErpBruto, uuid, {
      porIdErp: (chave) => this.vendedoras.buscarPorIdErp(chave),
      porId: (id) => this.vendedoras.buscarPorId(id),
    });
  }

  async produto(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('produto', idErpBruto, uuid, {
      porIdErp: (chave) => this.produtos.findByIdErp(chave),
      porId: (id) => this.produtos.findById(id),
    });
  }

  async formaPagamento(
    idErpBruto: unknown,
    uuid?: string | null,
  ): Promise<Referencia> {
    return this.resolver('forma_pagamento', idErpBruto, uuid, {
      porIdErp: (chave) => this.formasPagamento.buscarPorIdErp(chave),
      porId: (id) => this.formasPagamento.buscarPorId(id),
    });
  }

  /**
   * ==========================================================================
   * DOIS CAMINHOS, E ELES NAO TEM O MESMO RIGOR — 15/09/2026.
   *
   * Pedido do integrador: mandar o NOSSO UUID no lugar do id do ERP, para o
   * payload de movimentacao ficar igual ao de estoque. Os dois passam a valer,
   * e o UUID vence quando vem.
   *
   * PELO ID DO ERP: best-effort, como sempre foi. Nao achar e NORMAL — o
   * documento chega antes do cadastro, e o id cru fica gravado para religar
   * depois (ver o cabecalho da classe).
   *
   * PELO NOSSO UUID: tem de existir, e nao existindo e ERRO de quem chamou.
   * A diferenca nao e capricho: o id do ERP e dele e pode chegar antes da
   * nossa carga; o UUID e NOSSO, e so pode ter saido de uma consulta a esta
   * API. Se nao acha, o mapa dele esta velho ou trocado — engolir isso em
   * silencio gravaria a movimentacao apontando para o vazio, com cara de
   * sucesso. Quem decide o que fazer com esse erro e o use case.
   * ==========================================================================
   */
  private async resolver(
    tipo: string,
    idErpBruto: unknown,
    uuid: string | null | undefined,
    buscas: {
      porIdErp: (chave: string) => Promise<RegistroComIdErp | null>;
      porId: (id: string) => Promise<RegistroComIdErp | null>;
    },
  ): Promise<Referencia> {
    if (uuid) {
      const registro = await buscas.porId(uuid);
      if (!registro?.id) throw new ReferenciaInexistenteError(tipo, uuid);

      // O `id_erp` VEM JUNTO DE BRINDE: a coluna-sombra continua preenchida,
      // entao documento mandado por UUID fica tao rastreavel quanto os outros
      // — e as duas formas convivem na mesma tabela sem divergir.
      return { id: registro.id, idErp: registro.idErp ?? null };
    }

    const idErp = normalizarIdErp(idErpBruto as string | number | null);
    if (!idErp) return NAO_VEIO;

    const achado = await buscas.porIdErp(idErp);
    if (!achado) {
      this.logger.debug(
        `${tipo} id_erp=${idErp} ainda nao cadastrado — id cru guardado para religar depois`,
      );
    }

    return { id: achado?.id ?? null, idErp };
  }
}
