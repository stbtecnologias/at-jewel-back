import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LoginAdminUseCase } from '../../../application/use-cases/login-admin.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/refresh-token.use-case';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginAdmin: LoginAdminUseCase,
    private readonly refreshToken: RefreshTokenUseCase,
  ) {}

  // Throttle agressivo: 5 tentativas por 15 minutos por IP.
  // Conta TODAS as tentativas (sucesso e falha) para impedir
  // brute-force sem afetar uso humano legitimo (que digita errado
  // 2-3 vezes no maximo).
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.loginAdmin.execute(dto.email, dto.password);
  }

  // Refresh tambem rate-limited mas com folga maior — usuario
  // legitimo pode precisar renovar varias vezes por hora.
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshToken.execute(dto.refreshToken);
  }
}
