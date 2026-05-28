import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AgenteEvento } from '../../domain/entities/agente-evento.entity';
import type { NomeAgente } from '../../domain/entities/enums';
import { AGENTE_EVENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAgenteEventoRepository } from '../../domain/ports/repositories/agente-evento-repository.port';
import { detectarPiiNoPayload } from '../utils/detectar-pii';

export interface RegistrarEventoInput {
  agente: NomeAgente;
  tipoEvento: string;
  clienteId?: string | null;
  vendedoraId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown> | null;
  criadoPorApiKeyId?: string | null;
}

@Injectable()
export class RegistrarEventoUseCase {
  constructor(
    @Inject(AGENTE_EVENTO_REPOSITORY)
    private readonly repo: IAgenteEventoRepository,
  ) {}

  async execute(input: RegistrarEventoInput): Promise<AgenteEvento> {
    // Defesa em profundidade: rejeita payload com aparencia de PII.
    // Veja detectar-pii.ts para o motivo (REGRA DE OURO do agente_eventos).
    const motivos = detectarPiiNoPayload(input.payload);
    if (motivos.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Payload contem PII — agente_eventos nao aceita dados pessoais',
        motivos,
      });
    }

    const evento = AgenteEvento.create({
      agente: input.agente,
      tipoEvento: input.tipoEvento,
      clienteId: input.clienteId,
      vendedoraId: input.vendedoraId,
      correlationId: input.correlationId,
      payload: input.payload,
      criadoPorApiKeyId: input.criadoPorApiKeyId,
    });

    return this.repo.registrar(evento);
  }
}
