import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CriarRoleUseCase } from '../../../application/use-cases/criar-role.use-case';
import { AtualizarRoleUseCase } from '../../../application/use-cases/atualizar-role.use-case';
import { ListarRolesUseCase } from '../../../application/use-cases/listar-roles.use-case';
import { RemoverRoleUseCase } from '../../../application/use-cases/remover-role.use-case';
import { PERMISSOES } from '../../../domain/permissions';
import { Permissions } from '../decorators/permissions.decorator';
import { CriarRoleDto } from '../dto/criar-role.dto';
import { AtualizarRoleDto } from '../dto/atualizar-role.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

// Gestao de papeis e permissoes (RF-USU-01/06). Restrito a quem tem
// roles:manage. A leitura tambem e liberada a quem gere usuarios (para o
// seletor de papel na tela de usuarios).
@Controller('auth/roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(
    private readonly listar: ListarRolesUseCase,
    private readonly criar: CriarRoleUseCase,
    private readonly atualizar: AtualizarRoleUseCase,
    private readonly remover: RemoverRoleUseCase,
  ) {}

  @Get()
  @Permissions('roles:manage', 'usuarios:manage')
  findAll() {
    return this.listar.execute();
  }

  @Get('catalogo')
  @Permissions('roles:manage')
  catalogo() {
    return PERMISSOES;
  }

  @Post()
  @Permissions('roles:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CriarRoleDto) {
    await this.criar.execute({
      chave: dto.chave,
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      permissoes: dto.permissoes,
    });
    return { ok: true };
  }

  @Put(':chave')
  @Permissions('roles:manage')
  async update(@Param('chave') chave: string, @Body() dto: AtualizarRoleDto) {
    await this.atualizar.execute(chave.toUpperCase(), {
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      permissoes: dto.permissoes,
    });
    return { ok: true };
  }

  @Delete(':chave')
  @Permissions('roles:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('chave') chave: string) {
    await this.remover.execute(chave.toUpperCase());
  }
}
