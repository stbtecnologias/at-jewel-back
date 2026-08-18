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
import { AtualizarLocalEstoqueUseCase } from '../../../application/use-cases/atualizar-local-estoque.use-case';
import { BuscarLocalEstoqueUseCase } from '../../../application/use-cases/buscar-local-estoque.use-case';
import { CriarLocalEstoqueUseCase } from '../../../application/use-cases/criar-local-estoque.use-case';
import { ListarLocaisEstoqueUseCase } from '../../../application/use-cases/listar-locais-estoque.use-case';
import { RemoverLocalEstoqueUseCase } from '../../../application/use-cases/remover-local-estoque.use-case';
import { AtualizarLocalEstoqueDto } from '../dto/atualizar-local-estoque.dto';
import { CriarLocalEstoqueDto } from '../dto/criar-local-estoque.dto';
import { FiltroLocalEstoqueDto } from '../dto/filtro-local-estoque.dto';

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
@Controller('locais-estoque')
export class LocaisEstoqueController {
  constructor(
    private readonly criar: CriarLocalEstoqueUseCase,
    private readonly buscar: BuscarLocalEstoqueUseCase,
    private readonly listar: ListarLocaisEstoqueUseCase,
    private readonly atualizar: AtualizarLocalEstoqueUseCase,
    private readonly remover: RemoverLocalEstoqueUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:read')
  @RequireScopes('estoque:read')
  async listarLocaisEstoque(@Query() filtros: FiltroLocalEstoqueDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((e) => e.toPublic());
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
  async criarLocalEstoque(@Body() dto: CriarLocalEstoqueDto) {
    // O campo da API leva o sufixo da tabela (`idErpLocal`) para quem monta o
    // payload saber de que cadastro e o id; dentro, o dominio chama de `idErp`.
    const e = await this.criar.execute({ ...dto, idErp: dto.idErpLocal });
    return e.toPublic();
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async atualizarLocalEstoque(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarLocalEstoqueDto,
  ) {
    const e = await this.atualizar.execute(id, { ...dto, idErp: dto.idErpLocal });
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
  async removerLocalEstoque(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
