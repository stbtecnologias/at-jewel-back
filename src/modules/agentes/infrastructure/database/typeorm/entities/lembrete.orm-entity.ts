import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptedTransformer } from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type { EstadoLembrete } from '../../../../domain/ports/repositories/lembretes-repository.port';

/** Ver a migracao 73. */
@Entity('lembretes')
@Index(['donoId', 'quando'])
@Index(['quando'])
export class LembreteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * O dono, e a unica chave por onde se le.
   *
   * `admin_user_id` no banco e `donoId` aqui de proposito: no codigo a palavra
   * que importa e DONO, e chamar de `adminUserId` convidaria a tratar como
   * "mais uma coluna de auditoria" — que e o que ela nao e.
   */
  @Column({ name: 'admin_user_id', type: 'uuid' })
  donoId: string;

  /**
   * [ENCRYPTED] O texto como a pessoa disse.
   *
   * Cifrado porque o conteudo e imprevisivel — hoje e o bolo da Faby, amanha e
   * uma consulta medica. E mais pessoal que o `relato` da vendedora, que ja e
   * cifrado.
   *
   * SEM HASH AO LADO, e a ausencia e deliberada: telefone ganha `*_hash` para
   * poder ser procurado por igualdade, e texto livre nao se procura assim. A
   * busca por "o lembrete da Faby" carrega os do dono e compara em memoria.
   */
  @Column({ type: 'text', transformer: encryptedTransformer })
  texto: string;

  @Column({ type: 'timestamptz' })
  quando: Date;

  @Column({ type: 'varchar', length: 20 })
  estado: EstadoLembrete;

  @Column({ name: 'enviado_em', type: 'timestamptz', nullable: true })
  enviadoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
