import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import {
  normalizarTelefone,
  variantesTelefone,
} from '../../../clientes/application/utils/normalizadores';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../domain/entities/enums';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

export interface AtualizarVendedoraInput {
  idErp?: string | null;
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

    // As colunas de hash sao UNIQUE. Sem esta checagem o conflito estourava
    // como 500 com stack do Postgres — o `criar` ja checava, o `atualizar` nao.
    // Todas as formas equivalentes (nono digito, DDI): o mesmo numero em outro
    // formato ja pertence a outra vendedora.
    if (emailMudou && input.email) {
      const dup = await this.repo.buscarPorEmailHash(hashField(input.email));
      if (dup && dup.id !== id) {
        throw new ConflictException('Email ja cadastrado em outra vendedora');
      }
    }
    if (whatsappMudou && input.whatsappInterno) {
      for (const variante of variantesTelefone(input.whatsappInterno)) {
        const dup = await this.repo.buscarPorWhatsappHash(hashField(variante));
        if (dup && dup.id !== id) {
          throw new ConflictException('WhatsApp ja cadastrado em outra vendedora');
        }
      }
    }

    const novo = Vendedora.create({
      id: atual.id,
      idErp: input.idErp !== undefined ? input.idErp : atual.idErp,
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
