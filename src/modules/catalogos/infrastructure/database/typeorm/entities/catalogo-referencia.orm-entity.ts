import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { TipoReferencia } from '../../../../domain/entities/enums';
import { CatalogoOrmEntity } from './catalogo.orm-entity';

@Entity('catalogo_referencias')
@Index(['catalogoId', 'ordem'])
export class CatalogoReferenciaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'catalogo_id', type: 'uuid' })
  catalogoId: string;

  @ManyToOne(() => CatalogoOrmEntity, (c) => c.referencias, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'catalogo_id' })
  catalogo: CatalogoOrmEntity;

  @Column({ type: 'text' })
  tipo: TipoReferencia;

  // Para IMAGEM guarda o nome original do arquivo — e o que a tela mostra.
  // Para os outros tipos e o proprio texto da referencia.
  @Column({ type: 'text' })
  valor: string;

  @Column({ name: 'arquivo_id', type: 'text', nullable: true })
  arquivoId: string | null;

  @Column({ type: 'text', nullable: true })
  mime: string | null;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
