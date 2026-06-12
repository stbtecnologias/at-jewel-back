import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversa } from '../../../../domain/entities/conversa.entity';
import type { IConversaRepository } from '../../../../domain/ports/repositories/conversa-repository.port';
import { ConversaOrmEntity } from '../entities/conversa.orm-entity';

@Injectable()
export class ConversaRepository implements IConversaRepository {
  constructor(
    @InjectRepository(ConversaOrmEntity)
    private readonly repo: Repository<ConversaOrmEntity>,
  ) {}

  async salvar(conversa: Conversa): Promise<Conversa> {
    const entity = this.repo.create({
      ...(conversa.id ? { id: conversa.id } : {}),
      agente: conversa.agente,
      mensagens: conversa.mensagens,
      contexto: conversa.contexto,
      clienteId: conversa.clienteId,
      vendedoraId: conversa.vendedoraId,
    });
    const saved = await this.repo.save(entity);
    return Conversa.create({
      id: saved.id,
      agente: saved.agente,
      mensagens: saved.mensagens,
      contexto: saved.contexto,
      clienteId: saved.clienteId,
      vendedoraId: saved.vendedoraId,
      criadoEm: saved.criadoEm,
      atualizadoEm: saved.atualizadoEm,
    });
  }
}
