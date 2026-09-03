import {
  Body,
  Controller,
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
import { AtualizarOperacaoUseCase } from '../../../application/use-cases/atualizar-operacao.use-case';
import { BuscarOperacaoPorIdErpUseCase } from '../../../application/use-cases/buscar-operacao-por-id-erp.use-case';
import { BuscarOperacaoUseCase } from '../../../application/use-cases/buscar-operacao.use-case';
import { CriarOperacaoUseCase } from '../../../application/use-cases/criar-operacao.use-case';
import { ListarOperacoesUseCase } from '../../../application/use-cases/listar-operacoes.use-case';
import { SincronizarOperacaoUseCase } from '../../../application/use-cases/sincronizar-operacao.use-case';
import { AtualizarOperacaoDto } from '../dto/atualizar-operacao.dto';
import { CriarOperacaoDto } from '../dto/criar-operacao.dto';
import { FiltroOperacaoDto } from '../dto/filtro-operacao.dto';
import { SincronizarOperacaoDto } from '../dto/sincronizar-operacao.dto';

// Todas as rotas usam JwtOrApiKeyGuard: JWT valida a PERMISSAO do papel
// (@Permissions), chave de API valida o SCOPE (@RequireScopes). Mesmo padrao de
// formas-pagamento, estoque e fornecedores.
//
// Leitura -> movimentacoes:read
// Escrita -> movimentacoes:write
//
// UM PAR PARA AS DUAS TABELAS (operacoes e movimentacoes), pelo argumento da
// migracao 33: quem le a movimentacao precisa da operacao para saber o que ela
// e. As permissoes foram concedidas na migracao 46, junto com as tabelas.
//
// SEM DELETE, e nao por esquecimento: `movimentacoes.operacao_id` e ON DELETE
// RESTRICT, entao apagar uma operacao com documento pendurado ja e recusado
// pelo banco — a rota so produziria um 500 do Postgres. O caminho certo e
// PATCH com `ativo: false`, que preserva o historico.
@Controller('operacoes')
export class OperacoesController {
  constructor(
    private readonly criar: CriarOperacaoUseCase,
    private readonly sincronizar: SincronizarOperacaoUseCase,
    private readonly buscar: BuscarOperacaoUseCase,
    private readonly buscarPorIdErp: BuscarOperacaoPorIdErpUseCase,
    private readonly listar: ListarOperacoesUseCase,
    private readonly atualizar: AtualizarOperacaoUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:read')
  @RequireScopes('movimentacoes:read')
  async listarOperacoes(@Query() filtros: FiltroOperacaoDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((o) => o.toPublic());
  }

  // Declarada ANTES de @Get(':id') porque o Nest casa as rotas na ordem em que
  // aparecem — depois dele, "iderp" seria lido como id e cairia no
  // ParseUUIDPipe.
  @Get('iderp/:id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:read')
  @RequireScopes('movimentacoes:read')
  async buscarPeloIdErp(@Param('id') idErp: string) {
    const o = await this.buscarPorIdErp.execute(idErp);
    return o.toPublic();
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:read')
  @RequireScopes('movimentacoes:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const o = await this.buscar.execute(id);
    return o.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:write')
  @RequireScopes('movimentacoes:write')
  async criarOperacao(@Body() dto: CriarOperacaoDto) {
    const criada = await this.criar.execute({
      ...dto,
      idErp: dto.idErpOperacao,
    });
    return criada.toPublic();
  }

  // O caminho da INTEGRACAO: upsert por `id_erp`, no padrao do PUT /estoque.
  // Reenviar o catalogo inteiro tem de ser barato e sem efeito — com POST, a
  // segunda remessa seria uma parede de 409.
  //
  // 200 nos dois casos, com `criada` no corpo dizendo o que aconteceu. Nao 201
  // no primeiro: o integrador manda o lote todo e nao le status por item.
  @Put()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:write')
  @RequireScopes('movimentacoes:write')
  async sincronizarOperacao(@Body() dto: SincronizarOperacaoDto) {
    const { operacao, criada } = await this.sincronizar.execute({
      ...dto,
      idErp: dto.idErpOperacao,
    });
    return { ...operacao.toPublic(), criada };
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:write')
  @RequireScopes('movimentacoes:write')
  async atualizarOperacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarOperacaoDto,
  ) {
    const atualizada = await this.atualizar.execute(id, {
      ...dto,
      idErp: dto.idErpOperacao,
    });
    return atualizada.toPublic();
  }
}
