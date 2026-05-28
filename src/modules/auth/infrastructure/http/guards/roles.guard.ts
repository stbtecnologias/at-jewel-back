import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { AdminRole } from '../../../domain/entities/admin-user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Sem @Roles: deixa passar (a propria autenticacao JWT ja garante
    // que ha um usuario; a falta de @Roles indica acesso a qualquer role).
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = req.user;

    if (!user?.role) {
      throw new ForbiddenException('Token sem role — acesso negado');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Role '${user.role}' nao tem permissao (requer: ${required.join(', ')})`,
      );
    }

    return true;
  }
}
