import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MovimentacaoItemOrmEntity } from './movimentacao-item.orm-entity';
import { MovimentacaoPagamentoOrmEntity } from './movimentacao-pagamento.orm-entity';

/**
 * Espelha `movimentacoes` da migracao 46. Nenhuma coluna cifrada — o documento
 * do ERP nao carrega PII: cliente e vendedora aparecem so por FK e por id do
 * ERP, e nome/telefone continuam cifrados nas tabelas deles.
 *
 * Os `decimal` sao declarados como `string`, no mesmo padrao de
 * `VendaOrmEntity`: o driver do Postgres devolve DECIMAL como texto para nao
 * perder precisao, e a conversao para `number` acontece no `toDomain` do
 * repositorio.
 */
@Entity('movimentacoes')
export class MovimentacaoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'id_erp', type: 'varchar', length: 50, unique: true })
  idErp: string;

  @Column({ type: 'int', nullable: true })
  numero: number | null;

  @Index()
  @Column({ name: 'data_movimentacao', type: 'timestamptz' })
  dataMovimentacao: Date;

  @Index()
  @Column({ name: 'operacao_id', type: 'uuid', nullable: true })
  operacaoId: string | null;

  @Column({ name: 'operacao_id_erp', type: 'varchar', length: 50, nullable: true })
  operacaoIdErp: string | null;

  @Column({ name: 'empresa_id', type: 'uuid', nullable: true })
  empresaId: string | null;

  @Column({ name: 'empresa_id_erp', type: 'varchar', length: 50, nullable: true })
  empresaIdErp: string | null;

  @Column({ name: 'grupo_origem_id', type: 'uuid', nullable: true })
  grupoOrigemId: string | null;

  @Column({ name: 'grupo_origem_id_erp', type: 'varchar', length: 50, nullable: true })
  grupoOrigemIdErp: string | null;

  @Column({ name: 'grupo_destino_id', type: 'uuid', nullable: true })
  grupoDestinoId: string | null;

  @Column({ name: 'grupo_destino_id_erp', type: 'varchar', length: 50, nullable: true })
  grupoDestinoIdErp: string | null;

  @Column({
    name: 'entidade_origem_id_erp',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  entidadeOrigemIdErp: string | null;

  @Column({
    name: 'entidade_destino_id_erp',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  entidadeDestinoIdErp: string | null;

  @Index()
  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId: string | null;

  @Column({ name: 'cliente_id_erp', type: 'varchar', length: 50, nullable: true })
  clienteIdErp: string | null;

  @Index()
  @Column({ name: 'vendedora_id', type: 'uuid', nullable: true })
  vendedoraId: string | null;

  @Column({ name: 'vendedora_id_erp', type: 'varchar', length: 50, nullable: true })
  vendedoraIdErp: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  valor: string;

  @Column({ type: 'boolean', default: false })
  entrada: boolean;

  @Column({ type: 'boolean', default: false })
  saida: boolean;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'venda_id', type: 'uuid', nullable: true })
  vendaId: string | null;

  @Column({ name: 'recebido_em', type: 'timestamptz', default: () => 'now()' })
  recebidoEm: Date;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @OneToMany(() => MovimentacaoItemOrmEntity, (i) => i.movimentacao, {
    cascade: false,
  })
  itens: MovimentacaoItemOrmEntity[];

  @OneToMany(() => MovimentacaoPagamentoOrmEntity, (p) => p.movimentacao, {
    cascade: false,
  })
  pagamentos: MovimentacaoPagamentoOrmEntity[];
}
