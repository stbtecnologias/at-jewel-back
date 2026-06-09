import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  encryptedJsonTransformer,
  encryptedTransformer,
} from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type {
  EstadoConversaAgente,
  MotivacaoCompra,
  NivelConhecimento,
  OrigemContato,
  TipoCompra,
  UrgenciaCompra,
} from '../../../../domain/entities/enums';
import { ClienteOrmEntity } from './cliente.orm-entity';

@Entity('clientes_perfil')
export class ClientePerfilOrmEntity {
  @PrimaryColumn({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @OneToOne(() => ClienteOrmEntity, (cliente) => cliente.perfil, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cliente_id' })
  cliente: ClienteOrmEntity;

  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  whatsapp: string | null;

  @Column({ name: 'whatsapp_hash', type: 'varchar', length: 64, unique: true, nullable: true })
  whatsappHash: string | null;

  @Column({
    name: 'origem_contato',
    type: 'enum',
    enum: ['whatsapp', 'instagram', 'site', 'indicacao', 'loja_fisica', 'outro'],
    nullable: true,
  })
  origemContato: OrigemContato | null;

  @Column({
    name: 'estado_conversa',
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
  estadoConversa: EstadoConversaAgente;

  @Column({ name: 'estado_atualizado_em', type: 'timestamptz' })
  estadoAtualizadoEm: Date;

  @Column({ name: 'tipo_compra', type: 'enum', enum: ['pessoal', 'presente'], nullable: true })
  tipoCompra: TipoCompra | null;

  @Column({
    type: 'enum',
    enum: ['imediata', 'proximas_semanas', 'sem_pressa'],
    nullable: true,
  })
  urgencia: UrgenciaCompra | null;

  @Column({ name: 'data_pretendida_compra', type: 'date', nullable: true })
  dataPretendidaCompra: Date | null;

  @Column({ name: 'ticket_estimado', type: 'decimal', precision: 15, scale: 2, nullable: true })
  ticketEstimado: number | null;

  @Column({
    name: 'intencao_compra',
    type: 'text',
    nullable: true,
    transformer: encryptedTransformer,
  })
  intencaoCompra: string | null;

  // Cifrado como JSON serializado. O encryptedJsonTransformer faz o
  // ciclo completo: stringify -> encrypt -> ... -> decrypt -> parse.
  @Column({ type: 'text', nullable: true, transformer: encryptedJsonTransformer })
  wishlist: object | null;

  @Column({
    name: 'nivel_conhecimento',
    type: 'enum',
    enum: ['iniciante', 'intermediario', 'conhecedor'],
    nullable: true,
  })
  nivelConhecimento: NivelConhecimento | null;

  @Column({ name: 'vendedora_sugerida_codigo', type: 'varchar', length: 50, nullable: true })
  vendedoraSugeridaCodigo: string | null;

  @Column({ name: 'vendedora_aprovada_codigo', type: 'varchar', length: 50, nullable: true })
  vendedoraAprovadaCodigo: string | null;

  @Column({
    name: 'resumo_triagem',
    type: 'text',
    nullable: true,
    transformer: encryptedTransformer,
  })
  resumoTriagem: string | null;

  @Column({
    name: 'notas_internas',
    type: 'text',
    nullable: true,
    transformer: encryptedTransformer,
  })
  notasInternas: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'score_perfil', type: 'smallint', nullable: true })
  scorePerfil: number | null;

  @Column({
    name: 'motivacao_compra',
    type: 'enum',
    enum: ['uso_proprio', 'presente', 'status', 'investimento'],
    nullable: true,
  })
  motivacaoCompra: MotivacaoCompra | null;

  // Marca o primeiro contato da vendedora apos o handoff. Para o cronometro
  // do SLA de primeiro contato. NULL = ainda nao contatado. Nao e PII.
  @Column({ name: 'primeiro_contato_em', type: 'timestamptz', nullable: true })
  primeiroContatoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
