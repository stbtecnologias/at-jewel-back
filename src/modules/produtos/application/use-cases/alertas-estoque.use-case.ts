import { Inject, Injectable } from '@nestjs/common';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type {
  AlertasEstoque,
  IProdutoRepository,
} from '../../../erp/domain/ports/repositories/produto-repository.port';

@Injectable()
export class AlertasEstoqueUseCase {
  constructor(
    @Inject(PRODUTO_REPOSITORY)
    private readonly repo: IProdutoRepository,
  ) {}

  // limiteBaixo: estoque <= N dispara alerta; diasGiroLento: dias em estoque
  // a partir dos quais o item e considerado de giro lento.
  execute(limiteBaixo = 2, diasGiroLento = 90): Promise<AlertasEstoque> {
    return this.repo.alertasEstoque(limiteBaixo, diasGiroLento);
  }
}
