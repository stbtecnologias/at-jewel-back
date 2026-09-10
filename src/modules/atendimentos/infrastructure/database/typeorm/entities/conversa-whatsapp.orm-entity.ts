import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type { EstadoConversa } from '../../../../domain/ports/repositories/conversa-whatsapp-repository.port';

/**
 * A fila de conversas a ler — migracao 56.
 *
 * O `chatId` e cifrado como qualquer telefone, e aqui ele guarda tambem numero
 * de quem NAO e cliente: e o preco de conseguir distinguir a cliente nova do
 * entregador, coisa que so a leitura sabe fazer.
 */
@Entity('conversas_whatsapp')
@Index('idx_conversas_whatsapp_vendedora', ['vendedoraId', 'ultimaMensagemEm'])
export class ConversaWhatsappOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendedora_id', type: 'uuid' })
  vendedoraId: string;

  @Column({ name: 'chat_id', type: 'text', transformer: encryptedTransformer })
  chatId: string;

  @Column({ name: 'chat_id_hash', type: 'varchar', length: 64 })
  chatIdHash: string;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Column({ name: 'atendimento_id', type: 'uuid', nullable: true })
  atendimentoId: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @Column({ name: 'ultima_mensagem_em', type: 'timestamptz' })
  ultimaMensagemEm: Date;

  @Column({ name: 'lida_ate', type: 'timestamptz', nullable: true })
  lidaAte: Date | null;

  @Column({ name: 'ler_em', type: 'timestamptz', nullable: true })
  lerEm: Date | null;

  @Column({ type: 'enum', enum: ['AGUARDANDO', 'LIDA', 'IGNORADA'], enumName: 'estado_conversa_whatsapp' })
  estado: EstadoConversa;

  @Column({ type: 'smallint', default: 0 })
  tentativas: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
