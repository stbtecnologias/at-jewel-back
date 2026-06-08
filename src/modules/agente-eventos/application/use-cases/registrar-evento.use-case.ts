import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AgenteEvento } from '../../domain/entities/agente-evento.entity';
import type { NomeAgente } from '../../domain/entities/enums';
import { AGENTE_EVENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAgenteEventoRepository } from '../../domain/ports/repositories/agente-evento-repository.port';
import { chavesForaDaAllowlist } from '../utils/allowlist-payload';
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
    // Defesa em profundidade — camada 1 (allowlist, H-002): so chaves de topo
    // conhecidas e estritamente operacionais entram no payload. Qualquer chave
    // desconhecida e barrada antes de inspecionar valores. Veja
    // allowlist-payload.ts. Nao ecoamos valores — apenas o nome da chave.
    const chavesInvalidas = chavesForaDaAllowlist(input.payload);
    if (chavesInvalidas.length > 0) {
      throw new UnprocessableEntityException({
        message:
          'Payload contem chave(s) fora da allowlist de agente_eventos',
        chavesInvalidas,
      });
    }

    // Camada 2 (blocklist heuristica): rejeita payload com aparencia de PII,
    // mesmo dentro de chaves permitidas. Veja detectar-pii.ts (REGRA DE OURO
    // do agente_eventos).
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
