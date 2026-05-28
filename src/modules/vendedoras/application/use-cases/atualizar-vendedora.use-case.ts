import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { normalizarTelefone } from '../../../clientes/application/utils/normalizadores';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../domain/entities/enums';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

export interface AtualizarVendedoraInput {
  nome?: string;
  tipo?: TipoVendedora;
  ativo?: boolean;
  statusDisponibilidade?: StatusDisponibilidadeVendedora;
  especialidades?: string[];
  // Em plaintext — use case calcula hash novo se mudar.
  email?: string | null;
  whatsappInterno?: string | null;
  adminUserId?: string | null;
}

@Injectable()
export class AtualizarVendedoraUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(id: string, input: AtualizarVendedoraInput): Promise<Vendedora> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Vendedora ${id} nao encontrada`);

    const emailMudou = input.email !== undefined && input.email !== atual.email;
    const whatsappMudou =
      input.whatsappInterno !== undefined && input.whatsappInterno !== atual.whatsappInterno;

    const novo = Vendedora.create({
      id: atual.id,
      codigoErp: atual.codigoErp,
      nome: input.nome ?? atual.nome,
      tipo: input.tipo ?? atual.tipo,
      ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
      statusDisponibilidade: input.statusDisponibilidade ?? atual.statusDisponibilidade,
      especialidades: input.especialidades ?? atual.especialidades,
      email: input.email !== undefined ? input.email : atual.email,
      emailHash: emailMudou
        ? input.email
          ? hashField(input.email)
          : null
        : atual.emailHash,
      whatsappInterno:
        input.whatsappInterno !== undefined ? input.whatsappInterno : atual.whatsappInterno,
      whatsappInternoHash: whatsappMudou
        ? input.whatsappInterno
          ? hashField(normalizarTelefone(input.whatsappInterno))
          : null
        : atual.whatsappInternoHash,
      adminUserId: input.adminUserId !== undefined ? input.adminUserId : atual.adminUserId,
    });

    return this.repo.atualizar(novo);
  }
}
