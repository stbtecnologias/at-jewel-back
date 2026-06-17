import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AlterarSenhaUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
  ) {}

  async execute(id: string, senhaAtual: string, novaSenha: string): Promise<void> {
    const admin = await this.repo.findById(id);
    if (!admin) throw new NotFoundException('Usuario nao encontrado');

    // Conta "so Google" nao tem senha para conferir nesse fluxo.
    if (!admin.passwordHash) {
      throw new UnauthorizedException('Esta conta acessa via Google e não possui senha');
    }

    const confere = await bcrypt.compare(senhaAtual, admin.passwordHash);
    if (!confere) throw new UnauthorizedException('Senha atual incorreta');

    const novoHash = await bcrypt.hash(novaSenha, BCRYPT_ROUNDS);
    await this.repo.atualizarSenha(id, novoHash);

    // Invalida o refresh token corrente — troca de senha encerra sessoes
    // antigas (forca novo login no proximo refresh).
    await this.repo.updateRefreshToken(id, null, null);
  }
}
