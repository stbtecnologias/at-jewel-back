import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CriarUsuarioUseCase } from '../../../application/use-cases/criar-usuario.use-case';
import { ListarUsuariosUseCase } from '../../../application/use-cases/listar-usuarios.use-case';
import { RemoverUsuarioUseCase } from '../../../application/use-cases/remover-usuario.use-case';
import { CriarUsuarioDto } from '../dto/criar-usuario.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

// Gestao de usuarios do painel — restrita a ADMIN (guard de papel no servidor,
// independente do que o front mostra).
@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsuariosController {
  constructor(
    private readonly listar: ListarUsuariosUseCase,
    private readonly criar: CriarUsuarioUseCase,
    private readonly remover: RemoverUsuarioUseCase,
  ) {}

  @Get()
  listarUsuarios() {
    return this.listar.execute();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  criarUsuario(@Body() dto: CriarUsuarioDto) {
    return this.criar.execute({
      email: dto.email,
      nome: dto.nome ?? null,
      role: dto.role,
      senha: dto.senha ?? null,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerUsuario(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtPayload },
  ) {
    await this.remover.execute(id, req.user.sub);
  }
}
