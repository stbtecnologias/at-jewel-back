import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AlterarSenhaUseCase } from '../../../application/use-cases/alterar-senha.use-case';
import { AtualizarNomeUseCase } from '../../../application/use-cases/atualizar-nome.use-case';
import { BuscarPerfilUseCase } from '../../../application/use-cases/buscar-perfil.use-case';
import { LoginAdminUseCase } from '../../../application/use-cases/login-admin.use-case';
import { LoginGoogleUseCase } from '../../../application/use-cases/login-google.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/refresh-token.use-case';
import { AlterarSenhaDto } from '../dto/alterar-senha.dto';
import { AtualizarNomeDto } from '../dto/atualizar-nome.dto';
import { LoginDto } from '../dto/login.dto';
import { LoginGoogleDto } from '../dto/login-google.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginAdmin: LoginAdminUseCase,
    private readonly loginGoogle: LoginGoogleUseCase,
    private readonly refreshToken: RefreshTokenUseCase,
    private readonly buscarPerfil: BuscarPerfilUseCase,
    private readonly atualizarNome: AtualizarNomeUseCase,
    private readonly alterarSenha: AlterarSenhaUseCase,
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

  // Login via Google (OIDC): o front envia o ID token; o back valida com a
  // Google e emite o NOSSO JWT. So contas ja cadastradas como admin entram.
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  google(@Body() dto: LoginGoogleDto) {
    return this.loginGoogle.execute(dto.idToken);
  }

  // Refresh tambem rate-limited mas com folga maior — usuario
  // legitimo pode precisar renovar varias vezes por hora.
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.refreshToken.execute(dto.refreshToken);
  }

  // --- Perfil do usuario autenticado (tela de configuracoes) ---

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: { user: JwtPayload }) {
    return this.buscarPerfil.execute(req.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  atualizar(@Request() req: { user: JwtPayload }, @Body() dto: AtualizarNomeDto) {
    return this.atualizarNome.execute(req.user.sub, dto.nome);
  }

  @Post('senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async senha(@Request() req: { user: JwtPayload }, @Body() dto: AlterarSenhaDto) {
    await this.alterarSenha.execute(req.user.sub, dto.senha_atual, dto.nova_senha);
  }
}
