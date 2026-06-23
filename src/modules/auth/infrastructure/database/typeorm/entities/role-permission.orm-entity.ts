import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('role_permissions')
export class RolePermissionOrmEntity {
  @PrimaryColumn({ name: 'role_chave', type: 'varchar', length: 40 })
  roleChave: string;

  @PrimaryColumn({ type: 'varchar', length: 60 })
  permissao: string;
}
