import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { EstadoConversaAgente } from '../../../../../clientes/domain/entities/enums';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type {
  OcasiaoLead,
  OrigemContato,
} from '../../../../domain/ports/repositories/lead-repository.port';

@Entity('leads')
export class LeadOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  nome: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  apelido: string | null;

  // Cifrada. O transformer decifra na leitura, entao o resto do codigo trata
  // como texto comum — e e este valor que a vendedora usa para ligar.
  @Column({ type: 'text', transformer: encryptedTransformer })
  whatsapp: string;

  // NAO e unique: um numero pode ter varios leads ao longo do tempo. O que e
  // unico e o lead ABERTO, garantido pelo indice parcial da migracao 40.
  @Index()
  @Column({ name: 'whatsapp_hash', type: 'varchar', length: 64 })
  whatsappHash: string;

  @Column({
    name: 'origem_contato',
    type: 'enum',
    enum: [
      'whatsapp',
      'instagram',
      'site',
      'indicacao',
      'loja_fisica',
      'outro',
    ],
    nullable: true,
  })
  origemContato: OrigemContato | null;

  @Column({
    type: 'enum',
    enum: [
      'CASAMENTO',
      'NOIVADO',
      'ANIVERSARIO',
      'FORMATURA',
      'DATA_COMEMORATIVA',
      'AUTOPRESENTE',
      'OUTRO',
    ],
    nullable: true,
  })
  ocasiao: OcasiaoLead | null;

  @Column({ name: 'produtos_desejados', type: 'text', nullable: true })
  produtosDesejados: string | null;

  @Column({ name: 'resumo_triagem', type: 'text', nullable: true })
  resumoTriagem: string | null;

  @Column({
    name: 'vendedora_sugerida_codigo',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  vendedoraSugeridaCodigo: string | null;

  @Column({
    type: 'enum',
    enum: [
      'TRIAGE_IN_PROGRESS',
      'READY_FOR_ROUTING',
      'WAITING_OWNER_APPROVAL',
      'IN_HUMAN_SERVICE',
      'NEEDS_HUMAN',
    ],
    default: 'TRIAGE_IN_PROGRESS',
  })
  estado: EstadoConversaAgente;

  @Column({ name: 'estado_atualizado_em', type: 'timestamptz' })
  estadoAtualizadoEm: Date;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Column({ name: 'vinculado_em', type: 'timestamptz', nullable: true })
  vinculadoEm: Date | null;

  @Column({
    name: 'direcionado_gestao_em',
    type: 'timestamptz',
    nullable: true,
  })
  direcionadoGestaoEm: Date | null;

  @Column({
    name: 'vendedora_aprovada_codigo',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  vendedoraAprovadaCodigo: string | null;

  @Column({
    name: 'direcionado_vendedora_em',
    type: 'timestamptz',
    nullable: true,
  })
  direcionadoVendedoraEm: Date | null;

  @Column({ name: 'fechado_em', type: 'timestamptz', nullable: true })
  fechadoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
