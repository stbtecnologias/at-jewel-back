import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  FormatoCatalogo,
  OrigemFinal,
  StatusCatalogo,
} from '../../../../domain/entities/enums';
import { CatalogoFotoOrmEntity } from './catalogo-foto.orm-entity';
import { CatalogoReferenciaOrmEntity } from './catalogo-referencia.orm-entity';

@Entity('catalogos')
export class CatalogoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Gerado pelo DEFAULT da coluna (sequence + lpad). Por isso `insert: false`:
  // o TypeORM nao deve mandar valor nenhum aqui, senao atropela a sequence.
  @Column({ type: 'text', insert: false, update: false })
  numero: string;

  @Column({ type: 'text' })
  nome: string;

  @Column({ type: 'text', nullable: true })
  tema: string | null;

  @Column({ type: 'text', default: '9:16' })
  formato: FormatoCatalogo;

  @Index()
  @Column({ type: 'text', default: 'RASCUNHO' })
  status: StatusCatalogo;

  @Column({ name: 'criado_por_user_id', type: 'uuid', nullable: true })
  criadoPorUserId: string | null;

  @Column({ name: 'criado_por_nome', type: 'text' })
  criadoPorNome: string;

  @Column({ name: 'final_origem', type: 'text', nullable: true })
  finalOrigem: OrigemFinal | null;

  @Column({ name: 'final_arquivo_id', type: 'text', nullable: true })
  finalArquivoId: string | null;

  // A referencia escolhida como capa. NULL = automatica (a primeira imagem).
  // Sem `@ManyToOne`: a coluna e lida em lote junto com a contagem de fotos, e
  // uma relacao aqui faria o TypeORM carregar a referencia inteira em toda
  // listagem — ver a migracao 48.
  @Column({ name: 'capa_referencia_id', type: 'uuid', nullable: true })
  capaReferenciaId: string | null;

  // A APROVACAO — migracao 59. As quatro andam juntas: ou todas preenchidas
  // (PUBLICADO), ou todas nulas. Quem grava e so `registrarAprovacao`.
  @Column({ name: 'aprovado_final_id', type: 'uuid', nullable: true })
  aprovadoFinalId: string | null;

  @Column({ name: 'aprovado_capa_arquivo_id', type: 'text', nullable: true })
  aprovadoCapaArquivoId: string | null;

  @Column({ name: 'aprovado_por', type: 'text', nullable: true })
  aprovadoPor: string | null;

  @Column({ name: 'aprovado_em', type: 'timestamptz', nullable: true })
  aprovadoEm: Date | null;

  @Column({ name: 'final_nome_arquivo', type: 'text', nullable: true })
  finalNomeArquivo: string | null;

  @Column({ name: 'final_entregue_em', type: 'timestamptz', nullable: true })
  finalEntregueEm: Date | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => CatalogoReferenciaOrmEntity, (r) => r.catalogo)
  referencias: CatalogoReferenciaOrmEntity[];

  @OneToMany(() => CatalogoFotoOrmEntity, (f) => f.catalogo)
  fotos: CatalogoFotoOrmEntity[];
}
