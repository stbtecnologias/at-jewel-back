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
import { AtualizarFormaPagamentoUseCase } from '../../../application/use-cases/atualizar-forma-pagamento.use-case';
import { BuscarFormaPagamentoUseCase } from '../../../application/use-cases/buscar-forma-pagamento.use-case';
import { CriarFormaPagamentoUseCase } from '../../../application/use-cases/criar-forma-pagamento.use-case';
import { ListarFormasPagamentoUseCase } from '../../../application/use-cases/listar-formas-pagamento.use-case';
import { RemoverFormaPagamentoUseCase } from '../../../application/use-cases/remover-forma-pagamento.use-case';
import { AtualizarFormaPagamentoDto } from '../dto/atualizar-forma-pagamento.dto';
import { CriarFormaPagamentoDto } from '../dto/criar-forma-pagamento.dto';
import { FiltroFormaPagamentoDto } from '../dto/filtro-forma-pagamento.dto';

// Todas as rotas usam JwtOrApiKeyGuard: JWT valida a PERMISSAO do papel
// (@Permissions), chave de API valida o SCOPE (@RequireScopes). Mesmo padrao de
// vendedoras, clientes e fornecedores.
//
// Leitura -> formas_pagamento:read   (ampla: toda tela de venda exibe a forma)
// Escrita -> formas_pagamento:write  (gestao; cadastro estrutural)
//
// As permissoes foram concedidas na migracao 28, junto com a tabela.
@Controller('formas-pagamento')
export class FormasPagamentoController {
  constructor(
    private readonly criar: CriarFormaPagamentoUseCase,
    private readonly buscar: BuscarFormaPagamentoUseCase,
    private readonly listar: ListarFormasPagamentoUseCase,
    private readonly atualizar: AtualizarFormaPagamentoUseCase,
    private readonly remover: RemoverFormaPagamentoUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('formas_pagamento:read')
  @RequireScopes('formas_pagamento:read')
  async listarFormas(@Query() filtros: FiltroFormaPagamentoDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((f) => f.toPublic());
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('formas_pagamento:read')
  @RequireScopes('formas_pagamento:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const f = await this.buscar.execute(id);
    return f.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('formas_pagamento:write')
  @RequireScopes('formas_pagamento:write')
  async criarForma(@Body() dto: CriarFormaPagamentoDto) {
    const criado = await this.criar.execute({ ...dto, idErp: dto.idErpFormaPagamento });
    return criado.toPublic();
  }

  @Patch(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('formas_pagamento:write')
  @RequireScopes('formas_pagamento:write')
  async atualizarForma(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarFormaPagamentoDto,
  ) {
    const atualizado = await this.atualizar.execute(id, { ...dto, idErp: dto.idErpFormaPagamento });
    return atualizado.toPublic();
  }

  // Exclusao FISICA. Aqui o desligamento suave (PATCH com `ativo: false`) e
  // quase sempre o certo: forma descontinuada precisa continuar existindo para
  // as vendas antigas fazerem sentido. Hoje apagar nao afeta nada porque
  // pagamentos_venda.forma_pagamento ainda e o ENUM, sem FK para ca.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('formas_pagamento:write')
  @RequireScopes('formas_pagamento:write')
  async removerForma(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
