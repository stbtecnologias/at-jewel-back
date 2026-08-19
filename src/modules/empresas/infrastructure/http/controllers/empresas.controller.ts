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
import { AtualizarEmpresaUseCase } from '../../../application/use-cases/atualizar-empresa.use-case';
import { BuscarEmpresaUseCase } from '../../../application/use-cases/buscar-empresa.use-case';
import { BuscarEmpresaPorIdErpUseCase } from '../../../application/use-cases/buscar-empresa-por-id-erp.use-case';
import { CriarEmpresaUseCase } from '../../../application/use-cases/criar-empresa.use-case';
import { ListarEmpresasUseCase } from '../../../application/use-cases/listar-empresas.use-case';
import { RemoverEmpresaUseCase } from '../../../application/use-cases/remover-empresa.use-case';
import { AtualizarEmpresaDto } from '../dto/atualizar-empresa.dto';
import { CriarEmpresaDto } from '../dto/criar-empresa.dto';
import { FiltroEmpresaDto } from '../dto/filtro-empresa.dto';

// Todas as rotas usam JwtOrApiKeyGuard: JWT valida a PERMISSAO do papel
// (@Permissions), chave de API valida o SCOPE (@RequireScopes). Mesmo padrao de
// vendedoras, clientes, fornecedores e formas de pagamento.
//
// Leitura -> empresas:read   (ampla: toda tela de estoque e de venda vai
//                             precisar exibir e filtrar por empresa)
// Escrita -> empresas:write  (gestao; cadastro estrutural, muda pouco)
//
// As permissoes foram concedidas na migracao 27, junto com a tabela.
@Controller('empresas')
export class EmpresasController {
  constructor(
    private readonly criar: CriarEmpresaUseCase,
    private readonly buscar: BuscarEmpresaUseCase,
    private readonly buscarPorIdErp: BuscarEmpresaPorIdErpUseCase,
    private readonly listar: ListarEmpresasUseCase,
    private readonly atualizar: AtualizarEmpresaUseCase,
    private readonly remover: RemoverEmpresaUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('empresas:read')
  @RequireScopes('empresas:read')
  async listarEmpresas(@Query() filtros: FiltroEmpresaDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((e) => e.toPublic());
  }

  // Busca pela identidade no ERP. Declarada ANTES de @Get(':id') porque o Nest
  // casa as rotas na ordem em que aparecem — depois dele, "iderp" seria lido
  // como um id e cairia no ParseUUIDPipe.
  @Get('iderp/:id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('empresas:read')
  @RequireScopes('empresas:read')
  async buscarPeloIdErp(@Param('id') idErp: string) {
    const e = await this.buscarPorIdErp.execute(idErp);
    return e.toPublic();
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('empresas:read')
  @RequireScopes('empresas:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const e = await this.buscar.execute(id);
    return e.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('empresas:write')
  @RequireScopes('empresas:write')
  async criarEmpresa(@Body() dto: CriarEmpresaDto) {
    // O campo da API leva o sufixo da tabela para quem monta o payload saber de
    // que cadastro e o id; dentro, o dominio chama de `idErp`.
    const e = await this.criar.execute({ ...dto, idErp: dto.idErpEmpresa });
    return e.toPublic();
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('empresas:write')
  @RequireScopes('empresas:write')
  async atualizarEmpresa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarEmpresaDto,
  ) {
    const e = await this.atualizar.execute(id, { ...dto, idErp: dto.idErpEmpresa });
    return e.toPublic();
  }

  // Exclusao FISICA. O desligamento do dia a dia e PATCH com ativo:false.
  // Hoje apagar nao afeta nada porque nenhuma FK aponta para empresas — isso
  // muda quando vendas.empresa_id e a tabela de estoque existirem.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('empresas:write')
  @RequireScopes('empresas:write')
  async removerEmpresa(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
