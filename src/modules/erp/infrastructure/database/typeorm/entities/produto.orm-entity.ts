import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('produtos')
export class ProdutoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'codigo_erp', type: 'varchar', length: 50, unique: true, nullable: true })
  codigoErp: string | null;

  @Column({ name: 'categoria', type: 'varchar', length: 50 })
  categoria: string;

  @Column({ name: 'familia', type: 'varchar', length: 50 })
  familia: string;

  @Column({ name: 'colecao', type: 'varchar', length: 100, nullable: true })
  colecao: string | null;

  @Column({ name: 'cor', type: 'varchar', length: 100, nullable: true })
  cor: string | null;

  @Column({ name: 'tamanho', type: 'varchar', length: 50, nullable: true })
  tamanho: string | null;

  @Column({ name: 'tipo_pedra', type: 'varchar', length: 50, nullable: true })
  tipoPedra: string | null;

  @Column({ name: 'colecao_pedra', type: 'varchar', length: 50, nullable: true })
  colecaoPedra: string | null;

  @Column({ name: 'referencia_fornecedor', type: 'varchar', length: 100, nullable: true })
  referenciaFornecedor: string | null;

  @Column({ name: 'descricao_etiqueta', type: 'varchar', length: 255, nullable: true })
  descricaoEtiqueta: string | null;

  @Column({ name: 'peso_gramas', type: 'decimal', precision: 10, scale: 4, nullable: true })
  pesoGramas: number | null;

  @Column({ name: 'unidade', type: 'varchar', length: 20 })
  unidade: string;

  @Column({ name: 'valor_compra', type: 'decimal', precision: 15, scale: 2, nullable: true })
  valorCompra: number | null;

  @Column({ name: 'valor_custo', type: 'decimal', precision: 15, scale: 2, nullable: true })
  valorCusto: number | null;

  @Column({ name: 'margem_percentual', type: 'decimal', precision: 5, scale: 2, nullable: true })
  margemPercentual: number | null;

  @Column({ name: 'valor_venda', type: 'decimal', precision: 15, scale: 2 })
  valorVenda: number;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao: string | null;

  @Column({ name: 'foto_url', type: 'varchar', length: 500, nullable: true })
  fotoUrl: string | null;

  @Column({ name: 'ativo', type: 'boolean', default: true })
  ativo: boolean;

  // Snapshot de estoque (fonte da verdade no ERP). Usado pelos KPIs de
  // inventario/giro sem precisar consultar o Safira.
  @Column({ name: 'estoque_atual', type: 'int', default: 0 })
  estoqueAtual: number;

  @Column({ name: 'data_entrada_estoque', type: 'timestamptz', nullable: true })
  dataEntradaEstoque: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
