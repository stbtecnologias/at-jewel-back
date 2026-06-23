import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AgentePromptOverride,
  IAgentePromptsRepository,
} from '../../../../domain/ports/repositories/agente-prompts-repository.port';
import { AgentePromptOrmEntity } from '../entities/agente-prompt.orm-entity';

@Injectable()
export class AgentePromptRepository implements IAgentePromptsRepository {
  constructor(
    @InjectRepository(AgentePromptOrmEntity)
    private readonly repo: Repository<AgentePromptOrmEntity>,
  ) {}

  async buscar(agente: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { agente } });
    return row?.systemPrompt ?? null;
  }

  async buscarTodos(): Promise<AgentePromptOverride[]> {
    const rows = await this.repo.find();
    return rows.map((r) => ({
      agente: r.agente,
      systemPrompt: r.systemPrompt,
      atualizadoEm: r.atualizadoEm,
      atualizadoPor: r.atualizadoPor,
    }));
  }

  async salvar(
    agente: string,
    systemPrompt: string,
    atualizadoPor: string | null,
  ): Promise<void> {
    await this.repo.save({ agente, systemPrompt, atualizadoPor });
  }
}
