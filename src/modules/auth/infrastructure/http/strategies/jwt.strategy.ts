import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AdminRole } from '../../../domain/entities/admin-user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Retorna o payload inteiro — fica disponivel em `request.user`.
  // O RolesGuard le request.user.role para autorizacao.
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
