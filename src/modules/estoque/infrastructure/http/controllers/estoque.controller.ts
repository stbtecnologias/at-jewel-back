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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { JwtOrApiKeyGuard } from '../../../../auth/infrastructure/http/guards/jwt-or-api-key.guard';
import { AtualizarEstoqueUseCase } from '../../../application/use-cases/atualizar-estoque.use-case';
import { BuscarEstoqueUseCase } from '../../../application/use-cases/buscar-estoque.use-case';
import { BuscarEstoquePorIdErpUseCase } from '../../../application/use-cases/buscar-estoque-por-id-erp.use-case';
import { CriarEstoqueUseCase } from '../../../application/use-cases/criar-estoque.use-case';
import { ListarEstoqueUseCase } from '../../../application/use-cases/listar-estoque.use-case';
import { RemoverEstoqueUseCase } from '../../../application/use-cases/remover-estoque.use-case';
import { SincronizarEstoqueUseCase } from '../../../application/use-cases/sincronizar-estoque.use-case';
import { AtualizarEstoqueDto } from '../dto/atualizar-estoque.dto';
import { CriarEstoqueDto } from '../dto/criar-estoque.dto';
import { FiltroEstoqueDto } from '../dto/filtro-estoque.dto';

// Todas as rotas usam JwtOrApiKeyGuard: JWT valida a PERMISSAO do papel
// (@Permissions), chave de API valida o SCOPE (@RequireScopes).
//
// Um par de scopes cobre as TRES tabelas do assunto (grupos, locais e saldo):
// quem integra estoque precisa das tres juntas.
//
// Leitura -> estoque:read
// Escrita -> estoque:write
//
// Permissoes concedidas na migracao 33.
@Controller('estoque')
export class EstoqueController {
  constructor(
    private readonly criar: CriarEstoqueUseCase,
    private readonly sincronizar: SincronizarEstoqueUseCase,
    private readonly buscar: BuscarEstoqueUseCase,
    private readonly buscarPorIdErp: BuscarEstoquePorIdErpUseCase,
    private readonly listar: ListarEstoqueUseCase,
    private readonly atualizar: AtualizarEstoqueUseCase,
    private readonly remover: RemoverEstoqueUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:read')
  @RequireScopes('estoque:read')
  async listarEstoque(@Query() filtros: FiltroEstoqueDto) {
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

  // Criacao avulsa. Combinacao ja existente devolve 409 apontando para o PUT —
  // quem sincroniza nao deveria passar por aqui.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async criarEstoque(@Body() dto: CriarEstoqueDto) {
    // O campo da API leva o sufixo da tabela (`idErpEstoque`) para quem monta o
    // payload saber de que tabela e o id; dentro, o dominio chama de `idErp`.
    const e = await this.criar.execute({ ...dto, idErp: dto.idErpEstoque });
    return e.toPublic();
  }

  // SINCRONIZACAO com o ERP. Idempotente de proposito — o Safira manda a FOTO
  // do saldo, e reenviar a mesma foto e o comportamento normal, nao erro.
  //
  // Identifica o registro por `idErpEstoque` quando ele vem; sem ele, pela
  // chave (empresa, grupo, produto, local). Sem :id na URL porque quem integra
  // nao conhece nossos UUIDs de linha.
  @Put()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async sincronizarEstoque(@Body() dto: CriarEstoqueDto) {
    const e = await this.sincronizar.execute({ ...dto, idErp: dto.idErpEstoque });
    return e.toPublic();
  }

  // Ajuste manual da quantidade. As quatro dimensoes nao mudam: elas sao a
  // identidade do saldo.
  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async atualizarEstoque(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarEstoqueDto,
  ) {
    const e = await this.atualizar.execute(id, dto);
    return e.toPublic();
  }

  // Exclusao FISICA da linha. Zerar a quantidade (PATCH) e diferente: zero diz
  // "ja esteve aqui e hoje nao tem", e essa informacao costuma valer.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('estoque:write')
  @RequireScopes('estoque:write')
  async removerEstoque(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
