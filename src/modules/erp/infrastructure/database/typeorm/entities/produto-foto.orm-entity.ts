import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * UMA FOTO DA PECA — RF33, migracao 74.
 *
 * A peca passou a ter varias; a `capa` e a que ganha da foto do ERP e vai na
 * lista, no catalogo e na resposta da agente.
 *
 * `arquivoId` e a CHAVE NO ARMAZENAMENTO, e nao o arquivo. A mesma chave pode
 * aparecer em pecas diferentes — e e isso que atende o RF34 sem tabela de
 * ligacao. O preco esta no DELETE: so se apaga o arquivo quando nenhuma outra
 * linha aponta para ele.
 */
@Entity('produto_fotos')
@Index(['produtoId', 'capa', 'posicao'])
export class ProdutoFotoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @Column({ name: 'arquivo_id', type: 'text' })
  arquivoId: string;

  @Column({ name: 'mime', type: 'text' })
  mime: string;

  @Column({ name: 'bytes', type: 'int' })
  bytes: number;

  @Column({ name: 'capa', type: 'boolean', default: false })
  capa: boolean;

  @Column({ name: 'posicao', type: 'int', default: 0 })
  posicao: number;

  @Column({ name: 'origem', type: 'text', default: 'PAINEL' })
  origem: 'PAINEL' | 'WHATSAPP';

  @Column({ name: 'enviado_por', type: 'text', nullable: true })
  enviadoPor: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
