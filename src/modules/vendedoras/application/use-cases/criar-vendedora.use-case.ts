import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { normalizarTelefone } from '../../../clientes/application/utils/normalizadores';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type { TipoVendedora } from '../../domain/entities/enums';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

export interface CriarVendedoraInput {
  codigoErp?: string | null;
  nome: string;
  tipo?: TipoVendedora;
  especialidades?: string[];
  email?: string | null;
  whatsappInterno?: string | null;
  adminUserId?: string | null;
}

@Injectable()
export class CriarVendedoraUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(input: CriarVendedoraInput): Promise<Vendedora> {
    const emailHash = input.email ? hashField(input.email) : null;
    const whatsappInternoHash = input.whatsappInterno
      ? hashField(normalizarTelefone(input.whatsappInterno))
      : null;

    if (emailHash) {
      const dup = await this.repo.buscarPorEmailHash(emailHash);
      if (dup) throw new ConflictException('Email ja cadastrado em outra vendedora');
    }
    if (whatsappInternoHash) {
      const dup = await this.repo.buscarPorWhatsappHash(whatsappInternoHash);
      if (dup) throw new ConflictException('WhatsApp ja cadastrado em outra vendedora');
    }
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) throw new ConflictException('Codigo ERP ja cadastrado');
    }

    const vendedora = Vendedora.create({
      codigoErp: input.codigoErp ?? null,
      nome: input.nome,
      tipo: input.tipo ?? 'LOCAL',
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
      especialidades: input.especialidades ?? [],
      email: input.email ?? null,
      emailHash,
      whatsappInterno: input.whatsappInterno ?? null,
      whatsappInternoHash,
      adminUserId: input.adminUserId ?? null,
    });

    return this.repo.criar(vendedora);
  }
}
