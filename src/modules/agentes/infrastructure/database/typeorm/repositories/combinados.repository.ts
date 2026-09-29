import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  Combinado,
  ICombinadosRepository,
} from '../../../../domain/ports/repositories/combinados-repository.port';
import { AgenteCombinadoOrmEntity } from '../entities/agente-combinado.orm-entity';

@Injectable()
export class CombinadosRepository implements ICombinadosRepository {
  constructor(
    @InjectRepository(AgenteCombinadoOrmEntity)
    private readonly repo: Repository<AgenteCombinadoOrmEntity>,
  ) {}

  async listarAtivos(agente: string): Promise<Combinado[]> {
    const linhas = await this.repo.find({
      where: { agente, removidoEm: IsNull() },
      order: { criadoEm: 'ASC' },
    });
    return linhas.map(paraDominio);
  }

  async guardar(
    agente: string,
    texto: string,
    criadoPorId: string | null,
  ): Promise<Combinado> {
    const salvo = await this.repo.save(
      this.repo.create({ agente, texto, criadoPor: criadoPorId }),
    );
    return paraDominio(salvo);
  }

  async remover(id: string, removidoPorId: string | null): Promise<boolean> {
    // `removidoEm: IsNull()` no WHERE e o que torna a operacao idempotente sem
    // mentir: remover duas vezes afeta 1 linha e depois 0, e o `false` da
    // segunda vez e o que impede a agente de dizer "pronto, esqueci" sobre
    // algo que ela ja tinha esquecido.
    const r = await this.repo.update(
      { id, removidoEm: IsNull() },
      { removidoEm: new Date(), removidoPor: removidoPorId },
    );
    return (r.affected ?? 0) > 0;
  }

  async contarAtivos(agente: string): Promise<number> {
    return this.repo.count({ where: { agente, removidoEm: IsNull() } });
  }
}

function paraDominio(o: AgenteCombinadoOrmEntity): Combinado {
  return {
    id: o.id,
    agente: o.agente,
    texto: o.texto,
    criadoEm: o.criadoEm,
    criadoPorId: o.criadoPor,
  };
}
