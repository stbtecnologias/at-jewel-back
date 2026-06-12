import { Inject, Injectable } from '@nestjs/common';
import { Conversa, MensagemAgente } from '../../domain/entities/conversa.entity';
import type { NomeAgente } from '../../domain/entities/enums';
import { CONVERSA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IConversaRepository } from '../../domain/ports/repositories/conversa-repository.port';

export interface SalvarConversaInput {
  agente: NomeAgente;
  mensagens: MensagemAgente[];
  contexto?: Record<string, unknown> | null;
  clienteId?: string | null;
  vendedoraId?: string | null;
}

@Injectable()
export class SalvarConversaUseCase {
  constructor(
    @Inject(CONVERSA_REPOSITORY)
    private readonly repo: IConversaRepository,
  ) {}

  async execute(input: SalvarConversaInput): Promise<Conversa> {
    const conversa = Conversa.create({
      agente: input.agente,
      mensagens: input.mensagens,
      contexto: input.contexto ?? null,
      clienteId: input.clienteId ?? null,
      vendedoraId: input.vendedoraId ?? null,
    });
    return this.repo.salvar(conversa);
  }
}
