import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('agente_prompts')
export class AgentePromptOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  agente: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt: string;

  @Column({ name: 'atualizado_por', type: 'uuid', nullable: true })
  atualizadoPor: string | null;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
