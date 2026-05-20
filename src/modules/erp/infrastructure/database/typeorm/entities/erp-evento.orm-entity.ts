import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('erp_eventos_processados')
export class ErpEventoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evento_id', type: 'uuid', unique: true })
  eventoId: string;

  @Column({ name: 'entidade_tipo', type: 'varchar', length: 50 })
  entidadeTipo: string;

  @CreateDateColumn({ name: 'processado_em', type: 'timestamptz' })
  processadoEm: Date;
}
