import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizarIdErp } from '../../../shared/erp/normalizar-id-erp';
import { CLIENTE_REPOSITORY } from '../../clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../../clientes/domain/ports/repositories/cliente-repository.port';
import { EMPRESA_REPOSITORY } from '../../empresas/domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../empresas/domain/ports/repositories/empresa-repository.port';
import { PRODUTO_REPOSITORY } from '../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../erp/domain/ports/repositories/produto-repository.port';
import { FORMA_PAGAMENTO_REPOSITORY } from '../../formas-pagamento/domain/ports/injection-tokens';
import type { IFormaPagamentoRepository } from '../../formas-pagamento/domain/ports/repositories/forma-pagamento-repository.port';
import { GRUPO_ESTOQUE_REPOSITORY } from '../../grupos-estoque/domain/ports/injection-tokens';
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
  ) {}

  async operacao(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('operacao', idErpBruto, async (chave) => {
      const achado = await this.operacoes.buscarPorIdErp(chave);
      return achado?.id ?? null;
    });
  }

  async empresa(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('empresa', idErpBruto, async (chave) => {
      const achado = await this.empresas.buscarPorIdErp(chave);
      return achado?.id ?? null;
    });
  }

  async grupoEstoque(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('grupo_estoque', idErpBruto, async (chave) => {
      const achado = await this.grupos.buscarPorIdErp(chave);
      return achado?.id ?? null;
    });
  }

  async cliente(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('cliente', idErpBruto, async (chave) => {
      const achado = await this.clientes.buscarPorIdErp(chave);
      return achado?.id ?? null;
    });
  }

  async vendedora(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('vendedora', idErpBruto, async (chave) => {
      const achado = await this.vendedoras.buscarPorIdErp(chave);
      return achado?.id ?? null;
    });
  }

  async produto(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('produto', idErpBruto, async (chave) => {
      const achado = await this.produtos.findByIdErp(chave);
      return achado?.id ?? null;
    });
  }

  async formaPagamento(idErpBruto: unknown): Promise<Referencia> {
    return this.resolver('forma_pagamento', idErpBruto, async (chave) => {
      const achado = await this.formasPagamento.buscarPorIdErp(chave);
      return achado?.id ?? null;
    });
  }

  private async resolver(
    tipo: string,
    idErpBruto: unknown,
    buscar: (chave: string) => Promise<string | null>,
  ): Promise<Referencia> {
    const idErp = normalizarIdErp(idErpBruto as string | number | null);
    if (!idErp) return NAO_VEIO;

    const id = await buscar(idErp);
    if (!id) {
      this.logger.debug(
        `${tipo} id_erp=${idErp} ainda nao cadastrado — id cru guardado para religar depois`,
      );
    }

    return { id, idErp };
  }
}
