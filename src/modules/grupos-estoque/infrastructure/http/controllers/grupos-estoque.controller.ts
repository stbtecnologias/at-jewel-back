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
import { AtualizarGrupoEstoqueUseCase } from '../../../application/use-cases/atualizar-grupo-estoque.use-case';
import { BuscarGrupoEstoqueUseCase } from '../../../application/use-cases/buscar-grupo-estoque.use-case';
import { BuscarGrupoEstoquePorIdErpUseCase } from '../../../application/use-cases/buscar-grupo-estoque-por-id-erp.use-case';
import { CriarGrupoEstoqueUseCase } from '../../../application/use-cases/criar-grupo-estoque.use-case';
import { ListarGruposEstoqueUseCase } from '../../../application/use-cases/listar-grupos-estoque.use-case';
import { RemoverGrupoEstoqueUseCase } from '../../../application/use-cases/remover-grupo-estoque.use-case';
import { AtualizarGrupoEstoqueDto } from '../dto/atualizar-grupo-estoque.dto';
import { CriarGrupoEstoqueDto } from '../dto/criar-grupo-estoque.dto';
import { FiltroGrupoEstoqueDto } from '../dto/filtro-grupo-estoque.dto';

// Todas as rotas usam JwtOrApiKeyGuard: JWT valida a PERMISSAO do papel
// (@Permissions), chave de API valida o SCOPE (@RequireScopes). Mesmo padrao de
// empresas, fornecedores e formas de pagamento.
//
// Um par de scopes cobre as TRES tabelas do assunto (grupos, locais e o proprio
// saldo): quem integra estoque precisa das tres juntas, e separar so aumentaria
// o numero de scopes a administrar sem separar risco nenhum.
//
// Leitura -> estoque:read
// Escrita -> estoque:write
//
// Permissoes concedidas na migracao 33.
@Controller('grupos-estoque')
export class GruposEstoqueController {
  constructor(
    private readonly criar: CriarGrupoEstoqueUseCase,
    private readonly buscar: BuscarGrupoEstoqueUseCase,
    private readonly buscarPorIdErp: BuscarGrupoEstoquePorIdErpUseCase,
    private readonly listar: ListarGruposEstoqueUseCase,
    private readonly atualizar: AtualizarGrupoEstoqueUseCase,
    private readonly remover: RemoverGrupoEstoqueUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:read')
  @RequireScopes('estoque:read')
  async listarGruposEstoque(@Query() filtros: FiltroGrupoEstoqueDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((e) => e.toPublic());
  }

  // Busca pela identidade no ERP. Declarada ANTES de @Get(':id') porque o Nest
  // casa as rotas na ordem em que aparecem — depois dele, "iderp" seria lido
  // como um id e cairia no ParseUUIDPipe.
  @Get('iderp/:id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:read')
  @RequireScopes('estoque:read')
  async buscarPeloIdErp(@Param('id') idErp: string) {
    const e = await this.buscarPorIdErp.execute(idErp);
    return e.toPublic();
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:read')
  @RequireScopes('estoque:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const e = await this.buscar.execute(id);
    return e.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async criarGrupoEstoque(@Body() dto: CriarGrupoEstoqueDto) {
    // O campo da API leva o sufixo da tabela (`idErpGrupo`) para quem monta o
    // payload saber de que cadastro e o id; dentro, o dominio chama de `idErp`.
    const e = await this.criar.execute({ ...dto, idErp: dto.idErpGrupo });
    return e.toPublic();
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async atualizarGrupoEstoque(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarGrupoEstoqueDto,
  ) {
    const e = await this.atualizar.execute(id, { ...dto, idErp: dto.idErpGrupo });
    return e.toPublic();
  }

  // Exclusao FISICA. O desligamento do dia a dia e PATCH com ativo:false.
  // `estoque` referencia esta tabela: apagar registro que tenha saldo vinculado
  // e recusado pelo banco, e nao permitido em silencio.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async removerGrupoEstoque(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
