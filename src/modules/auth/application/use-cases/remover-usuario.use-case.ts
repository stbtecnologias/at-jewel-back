import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';

@Injectable()
export class RemoverUsuarioUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
  ) {}

  async execute(idAlvo: string, idSolicitante: string): Promise<void> {
    if (idAlvo === idSolicitante) {
      throw new BadRequestException('Você não pode remover a própria conta');
    }
    const alvo = await this.repo.findById(idAlvo);
    if (!alvo) {
      throw new NotFoundException('Usuário não encontrado');
    }
    await this.repo.remover(idAlvo);
  }
}
