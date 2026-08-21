import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AtualizarUsuarioUseCase } from '../../../application/use-cases/atualizar-usuario.use-case';
import { CriarUsuarioUseCase } from '../../../application/use-cases/criar-usuario.use-case';
import { ListarUsuariosUseCase } from '../../../application/use-cases/listar-usuarios.use-case';
import { RemoverUsuarioUseCase } from '../../../application/use-cases/remover-usuario.use-case';
import { AtualizarUsuarioDto } from '../dto/atualizar-usuario.dto';
import { CriarUsuarioDto } from '../dto/criar-usuario.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { Permissions } from '../decorators/permissions.decorator';
import { JwtPayload } from '../strategies/jwt.strategy';

// Gestao de usuarios do painel — exige usuarios:manage (RF-USU-01), validado
// no servidor independentemente do que o front mostra.
@Controller('usuarios')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('usuarios:manage')
export class UsuariosController {
  constructor(
    private readonly listar: ListarUsuariosUseCase,
    private readonly criar: CriarUsuarioUseCase,
    private readonly atualizar: AtualizarUsuarioUseCase,
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
      telefone: dto.telefone ?? null,
    });
  }

  /**
   * Edita nome e telefone. Papel, e-mail e senha ficam de fora — ver o comentario
   * em `AtualizarUsuarioUseCase`.
   *
   * Campo ausente do corpo nao e tocado; `telefone: ""` apaga o telefone.
   */
  @Patch(':id')
  atualizarUsuario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarUsuarioDto,
  ) {
    return this.atualizar.execute({
      id,
      nome: dto.nome,
      telefone: dto.telefone,
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
