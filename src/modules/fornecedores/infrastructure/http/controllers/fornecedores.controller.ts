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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { JwtOrApiKeyGuard } from '../../../../auth/infrastructure/http/guards/jwt-or-api-key.guard';
import { AtualizarFornecedorUseCase } from '../../../application/use-cases/atualizar-fornecedor.use-case';
import { BuscarFornecedorUseCase } from '../../../application/use-cases/buscar-fornecedor.use-case';
import { CriarFornecedorUseCase } from '../../../application/use-cases/criar-fornecedor.use-case';
import { ListarFornecedoresUseCase } from '../../../application/use-cases/listar-fornecedores.use-case';
import { RemoverFornecedorUseCase } from '../../../application/use-cases/remover-fornecedor.use-case';
import { AtualizarFornecedorDto } from '../dto/atualizar-fornecedor.dto';
import { CriarFornecedorDto } from '../dto/criar-fornecedor.dto';
import { FiltroFornecedorDto } from '../dto/filtro-fornecedor.dto';

// Estrategia de auth: todas as rotas usam JwtOrApiKeyGuard, atendendo os dois
// caminhos — JWT valida a PERMISSAO do papel (@Permissions), chave de API
// valida o SCOPE (@RequireScopes). Mesmo padrao ja aplicado em vendedoras e
// clientes.
//
// Leitura  -> fornecedores:read   (gestao, estoque; precisam ver a origem da peca)
// Escrita  -> fornecedores:write  (gestao; cadastro e decisao comercial)
//
// As permissoes foram concedidas na migracao 26, junto com a tabela.
@Controller('fornecedores')
export class FornecedoresController {
  constructor(
    private readonly criar: CriarFornecedorUseCase,
    private readonly buscar: BuscarFornecedorUseCase,
    private readonly listar: ListarFornecedoresUseCase,
    private readonly atualizar: AtualizarFornecedorUseCase,
    private readonly remover: RemoverFornecedorUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('fornecedores:read')
  @RequireScopes('fornecedores:read')
  async listarFornecedores(@Query() filtros: FiltroFornecedorDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((f) => f.toPublic());
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('fornecedores:read')
  @RequireScopes('fornecedores:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.buscar.execute(id);
    return f.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('fornecedores:write')
  @RequireScopes('fornecedores:write')
  async criarFornecedor(@Body() dto: CriarFornecedorDto) {
    const criado = await this.criar.execute({ ...dto, idErp: dto.idErpFornecedor });
    return criado.toPublic();
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('fornecedores:write')
  @RequireScopes('fornecedores:write')
  async atualizarFornecedor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarFornecedorDto,
  ) {
    const atualizado = await this.atualizar.execute(id, { ...dto, idErp: dto.idErpFornecedor });
    return atualizado.toPublic();
  }

  // Exclusao FISICA. O desligamento do dia a dia e PATCH com `ativo: false`.
  // Hoje nenhuma FK aponta para fornecedores, entao apagar nao afeta outras
  // tabelas — isso muda quando produtos.fornecedor_id existir (RF-INT-08).
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('fornecedores:write')
  @RequireScopes('fornecedores:write')
  async removerFornecedor(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
