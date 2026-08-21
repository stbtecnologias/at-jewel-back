import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import {
  normalizarTelefone,
  variantesTelefone,
} from '../../../clientes/application/utils/normalizadores';
import {
  ADMIN_USER_REPOSITORY,
  ROLE_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import type { IRoleRepository } from '../../domain/ports/repositories/role-repository.port';
import { AdminRole } from '../../domain/entities/admin-user.entity';
import { toUsuarioPublico, UsuarioPublico } from './usuario-publico';

export interface CriarUsuarioCmd {
  email: string;
  nome?: string | null;
  role: AdminRole;
  // Senha inicial opcional. Se ausente, o usuario so entra via Google.
  senha?: string | null;
  // Celular em qualquer formato; normalizado aqui antes de gravar.
  telefone?: string | null;
}

@Injectable()
export class CriarUsuarioUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY)
    private readonly roles: IRoleRepository,
  ) {}

  async execute(cmd: CriarUsuarioCmd): Promise<UsuarioPublico> {
    const email = cmd.email.toLowerCase().trim();

    const papel = await this.roles.buscar(cmd.role);
    if (!papel) {
      throw new BadRequestException(`Papel desconhecido: ${cmd.role}`);
    }

    const existente = await this.repo.findByEmail(email);
    if (existente) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }

    // TELEFONE — o hash e o que da para procurar; o valor legivel vai cifrado.
    //
    // A busca por duplicata percorre as FORMAS EQUIVALENTES do numero, nao so
    // a digitada. Sem isso, o mesmo celular cadastrado com e sem o nono digito
    // criaria dois usuarios, e o canal de WhatsApp resolveria para um deles ao
    // acaso, conforme o formato que o provedor entregasse naquele dia.
    const telefoneLimpo = cmd.telefone?.trim() || null;
    let telefone: string | null = null;
    let telefoneHash: string | null = null;

    if (telefoneLimpo) {
      const digitos = normalizarTelefone(telefoneLimpo);
      if (digitos.length < 10 || digitos.length > 13) {
        throw new BadRequestException(
          'Telefone inválido. Use DDD + número, ex.: (85) 98646-7241',
        );
      }
      for (const variante of variantesTelefone(telefoneLimpo)) {
        const dup = await this.repo.buscarPorTelefoneHash(hashField(variante));
        if (dup) {
          throw new ConflictException('Já existe um usuário com este telefone');
        }
      }
      telefone = telefoneLimpo;
      telefoneHash = hashField(digitos);
    }

    const passwordHash = cmd.senha ? await bcrypt.hash(cmd.senha, 12) : null;

    const usuario = await this.repo.criarUsuario({
      email,
      nome: cmd.nome?.trim() || null,
      role: cmd.role,
      passwordHash,
      telefone,
      telefoneHash,
    });

    return toUsuarioPublico(usuario);
  }
}
