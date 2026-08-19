import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type {
  EstadoInteracao,
  TipoInteracao,
} from '../../../../domain/entities/enums';
import { AtendimentoOrmEntity } from './atendimento.orm-entity';

@Entity('atendimento_interacoes')
export class AtendimentoInteracaoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'atendimento_id', type: 'uuid' })
  atendimentoId: string;

  @ManyToOne(() => AtendimentoOrmEntity, (a) => a.interacoes)
  @JoinColumn({ name: 'atendimento_id' })
  atendimento?: AtendimentoOrmEntity;

  @Column({ type: 'text' })
  tipo: TipoInteracao;

  /**
   * Horario acertado com o CLIENTE. O `notificarEm` e derivado dele, nao o
   * contrario — mudar a politica de antecedencia nao mexe no combinado.
   */
  @Column({ name: 'combinado_em', type: 'timestamptz', nullable: true })
  combinadoEm: Date | null;

  /** Quando NOS mandamos a mensagem. E por aqui que o agendador varre. */
  @Column({ name: 'notificar_em', type: 'timestamptz', nullable: true })
  notificarEm: Date | null;

  /** Quando aconteceu de fato. */
  @Column({ name: 'ocorrido_em', type: 'timestamptz', nullable: true })
  ocorridoEm: Date | null;

  @Column({ type: 'text', default: 'PENDENTE' })
  estado: EstadoInteracao;

  /**
   * [ENCRYPTED] O que a vendedora contou, nas palavras dela. Texto livre nao
   * tem como ser previsto: o que chega aqui e a vida da cliente dita em voz
   * alta. O dado ANALITICO (a ocasiao) mora em `atendimentos.ocasiao`, em
   * claro, para poder ser filtrado.
   */
  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  relato: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
