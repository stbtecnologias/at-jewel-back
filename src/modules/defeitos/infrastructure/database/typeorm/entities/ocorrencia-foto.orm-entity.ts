import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Uma foto de ocorrencia.
 *
 * Tabela a parte, e nao uma coluna na ocorrencia: uma peca com defeito quase
 * nunca se explica numa foto so — o arranhao de um angulo, a solda de outro, a
 * nota fiscal de um terceiro. Ver a migracao 52.
 *
 * Guarda a CHAVE do armazenamento, nunca a URL: a mesma regra do catalogo, e
 * pelo mesmo motivo — URL absoluta amarraria a linha ao host de hoje.
 */
@Entity('ocorrencia_fotos')
export class OcorrenciaFotoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'ocorrencia_id', type: 'uuid' })
  ocorrenciaId: string;

  @Column({ name: 'arquivo_id', type: 'text' })
  arquivoId: string;

  @Column({ type: 'text' })
  mime: string;

  @Column({ name: 'nome_arquivo', type: 'text', nullable: true })
  nomeArquivo: string | null;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
