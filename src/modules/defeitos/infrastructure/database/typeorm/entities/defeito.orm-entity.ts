import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TipoDefeito } from '../../../../domain/entities/enums';

@Entity('defeitos_devolucoes')
export class DefeitoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  // De quem era a peca. NULL quando nao passou por cliente — defeito de
  // fornecedor, quebra em loja. Ver a migracao 52.
  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ['DEFEITO', 'DEVOLUCAO', 'RECLAMACAO'],
    enumName: 'tipo_defeito',
  })
  tipo: TipoDefeito;

  @Column({ type: 'text' })
  descricao: string;

  @Index()
  @Column({ type: 'timestamptz' })
  data: Date;

  @Column({ type: 'text', nullable: true })
  resolucao: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
