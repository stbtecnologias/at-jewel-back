import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EMPRESA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IEmpresaRepository } from '../../domain/ports/repositories/empresa-repository.port';

/**
 * Exclusao FISICA. Espelha os removers dos demais cadastros.
 *
 * O caminho do dia a dia e PATCH com ativo:false — empresa desativada some das
 * selecoes e o historico dela continua consultavel.
 *
 * Hoje apagar nao afeta nada: nenhuma FK aponta para empresas. Isso MUDA assim
 * que vendas.empresa_id (RF-INT-06) e a tabela de estoque existirem, e ai
 * apagar empresa com venda ou estoque vinculado precisa ser impedido pelo
 * banco — nao permitido em silencio.
 */
@Injectable()
export class RemoverEmpresaUseCase {
  constructor(
    @Inject(EMPRESA_REPOSITORY)
    private readonly repo: IEmpresaRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException(`Empresa ${id} nao encontrada`);
    await this.repo.remover(id);
  }
}
