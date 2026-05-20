import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IErpEventoRepository } from '../../../../domain/ports/repositories/erp-evento-repository.port';
import { ErpEventoOrmEntity } from '../entities/erp-evento.orm-entity';

@Injectable()
export class ErpEventoRepository implements IErpEventoRepository {
  constructor(
    @InjectRepository(ErpEventoOrmEntity)
    private readonly repo: Repository<ErpEventoOrmEntity>,
  ) {}

  async jaProcessado(eventoId: string): Promise<boolean> {
    return this.repo.existsBy({ eventoId });
  }

  async marcarComoProcessado(
    eventoId: string,
    entidadeTipo: string,
  ): Promise<void> {
    await this.repo.save({ eventoId, entidadeTipo });
  }
}
