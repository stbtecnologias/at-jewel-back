import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { OrigemFinal } from '../../../../domain/entities/enums';
import { CatalogoOrmEntity } from './catalogo.orm-entity';

/**
 * Uma versão da peça final. A ATUAL é a mais recente — não há coluna de
 * "atual", porque uma segunda verdade divergiria da primeira no dia em que
 * alguém inserisse uma linha sem atualizá-la.
 */
@Entity('catalogo_finais')
@Index(['catalogoId', 'createdAt'])
export class CatalogoFinalOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'catalogo_id', type: 'uuid' })
  catalogoId: string;

  @ManyToOne(() => CatalogoOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalogo_id' })
  catalogo: CatalogoOrmEntity;

  @Column({ type: 'text' })
  origem: OrigemFinal;

  @Column({ name: 'arquivo_id', type: 'text' })
  arquivoId: string;

  @Column({ name: 'nome_arquivo', type: 'text' })
  nomeArquivo: string;

  @Column({ type: 'text', nullable: true })
  mime: string | null;

  // BIGINT volta como STRING do driver do pg — convertido no repositório, no
  // mapeamento para o read-model. Mesmo critério de `preco_a_vista`.
  @Column({ name: 'tamanho_bytes', type: 'bigint', nullable: true })
  tamanhoBytes: string | null;

  /** Nome do staff que enviou. Nulo quando foi o sistema que montou. */
  @Column({ name: 'enviado_por', type: 'text', nullable: true })
  enviadoPor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
