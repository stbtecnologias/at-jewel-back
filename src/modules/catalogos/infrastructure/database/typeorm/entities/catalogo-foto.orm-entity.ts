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
import type { OrigemFoto, StatusFoto } from '../../../../domain/entities/enums';
import { CatalogoOrmEntity } from './catalogo.orm-entity';

@Entity('catalogo_fotos')
@Index(['catalogoId', 'posicao'])
export class CatalogoFotoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'catalogo_id', type: 'uuid' })
  catalogoId: string;

  @ManyToOne(() => CatalogoOrmEntity, (c) => c.fotos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalogo_id' })
  catalogo: CatalogoOrmEntity;

  @Column({ type: 'int', default: 0 })
  posicao: number;

  // A chave DURAVEL da peca — a mesma impressa no catalogo. Sem FK de
  // proposito: a foto pode chegar antes de a peca existir no ERP.
  @Column({ name: 'codigo_erp', type: 'text', nullable: true })
  codigoErp: string | null;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  // NUMERIC volta do pg como STRING. A conversao acontece no repositorio, no
  // mapeamento para o read-model — mesmo criterio de produtos.valor_venda.
  @Column({
    name: 'preco_a_vista',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  precoAVista: string | null;

  @Column({ type: 'int', nullable: true })
  parcelas: number | null;

  @Column({ type: 'text', default: 'UPLOAD' })
  origem: OrigemFoto;

  @Column({ type: 'text', nullable: true })
  remetente: string | null;

  @Column({ name: 'arquivo_original_id', type: 'text', nullable: true })
  arquivoOriginalId: string | null;

  @Column({ name: 'arquivo_id', type: 'text', nullable: true })
  arquivoId: string | null;

  @Column({ type: 'text', nullable: true })
  mime: string | null;

  @Index()
  @Column({ type: 'text', default: 'APROVADA' })
  status: StatusFoto;

  @Column({ type: 'int', default: 1 })
  versoes: number;

  @Column({ name: 'aprovado_por', type: 'text', nullable: true })
  aprovadoPor: string | null;

  @Column({ name: 'aprovado_em', type: 'timestamptz', nullable: true })
  aprovadoEm: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
