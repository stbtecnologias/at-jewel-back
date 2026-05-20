import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class SafiraAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['x-safira-key'] as string | undefined;
    const expected = this.config.get<string>('SAFIRA_API_KEY');

    if (!key || !expected || key !== expected) {
      throw new UnauthorizedException('X-Safira-Key inválida ou ausente');
    }

    return true;
  }
}
