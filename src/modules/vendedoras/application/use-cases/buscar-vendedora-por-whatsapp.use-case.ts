import { Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { variantesTelefone } from '../../../clientes/application/utils/normalizadores';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

/**
 * De quem e este telefone? Recebe o numero em plaintext (com ou sem
 * formatacao, com ou sem DDI) e devolve a vendedora, ou null.
 *
 * TENTA TODAS AS VARIANTES. O numero cadastrado e o identificador da conta de
 * WhatsApp nem sempre sao o mesmo texto: contas brasileiras criadas antes do
 * nono digito mantem o identificador antigo. A Marina esta cadastrada como
 * 5585 9 8646 7241 e o WhatsApp entrega as mensagens dela como 5585 8646 7241.
 * Casar so pela forma exata deixaria de reconhecer justamente quem mais usa.
 *
 * O `criar-vendedora` ja faz o mesmo na deteccao de duplicata — aqui e a outra
 * ponta da mesma regra.
 *
 * INATIVA NAO CONTA: quem saiu da equipe nao conversa com o agente.
 */
@Injectable()
export class BuscarVendedoraPorWhatsappUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(telefone: string): Promise<Vendedora | null> {
    for (const variante of variantesTelefone(telefone)) {
      const achada = await this.repo.buscarPorWhatsappHash(hashField(variante));
      if (achada?.ativo) return achada;
    }
    return null;
  }
}
