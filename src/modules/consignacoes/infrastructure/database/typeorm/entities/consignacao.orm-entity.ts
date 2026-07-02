import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { DestinoConsignacao, StatusConsignacao } from '../../../../domain/entities/enums';

@Entity('consignacoes')
export class ConsignacaoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @Column({ type: 'int' })
  quantidade: number;

  @Column({ name: 'destino_tipo', type: 'text' })
  destinoTipo: DestinoConsignacao;

  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Index()
  @Column({ name: 'vendedora_id', type: 'uuid', nullable: true })
  vendedoraId: string | null;

  @Index()
  @Column({ type: 'text', default: 'ABERTA' })
  status: StatusConsignacao;

  @Column({ name: 'data_saida', type: 'timestamptz', default: () => 'now()' })
  dataSaida: Date;

  @Column({ name: 'data_prevista_retorno', type: 'date', nullable: true })
  dataPrevistaRetorno: Date | null;

  @Column({ name: 'data_retorno', type: 'timestamptz', nullable: true })
  dataRetorno: Date | null;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
