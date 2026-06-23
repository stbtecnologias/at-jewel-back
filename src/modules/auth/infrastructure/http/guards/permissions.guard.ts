import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PermissionsService } from '../../../application/permissions.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { JwtPayload } from '../strategies/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const role = req.user?.role;
    if (!role) {
      throw new ForbiddenException('Token sem papel — acesso negado');
    }

    for (const permissao of required) {
      if (await this.permissions.possui(role, permissao)) return true;
    }
    throw new ForbiddenException(
      `Papel '${role}' sem permissão (requer: ${required.join(' ou ')})`,
    );
  }
}
