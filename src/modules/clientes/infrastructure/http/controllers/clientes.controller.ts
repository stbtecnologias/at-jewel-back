import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import { AtualizarPerfilClienteUseCase } from '../../../application/use-cases/atualizar-perfil-cliente.use-case';
import { BuscarClienteUseCase } from '../../../application/use-cases/buscar-cliente.use-case';
import { BuscarClientePorWhatsappUseCase } from '../../../application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { CriarClienteUseCase } from '../../../application/use-cases/criar-cliente.use-case';
import { ListarClientesUseCase } from '../../../application/use-cases/listar-clientes.use-case';
import { AtualizarPerfilClienteDto } from '../dto/atualizar-perfil-cliente.dto';
import { CriarClienteDto } from '../dto/criar-cliente.dto';
import { FiltroClienteDto } from '../dto/filtro-cliente.dto';
import { LookupClienteDto } from '../dto/lookup-cliente.dto';

// Estrategia de auth por endpoint:
//  - Endpoints de operacao do agente (lookup, criar, atualizar perfil) =>
//    API Key com scopes especificos (chamados por n8n)
//  - Endpoints de leitura administrativa (listar, buscar) =>
//    JWT + role ADMIN/GERENTE
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly criar: CriarClienteUseCase,
    private readonly buscar: BuscarClienteUseCase,
    private readonly buscarPorWhatsapp: BuscarClientePorWhatsappUseCase,
    private readonly listar: ListarClientesUseCase,
    private readonly atualizarPerfil: AtualizarPerfilClienteUseCase,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  async listarClientes(@Query() filtros: FiltroClienteDto) {
    const clientes = await this.listar.execute(filtros);
    return clientes.map((c) => c.toPublic());
  }

  @Get('lookup')
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('clientes:read')
  async lookupPorWhatsapp(@Query() query: LookupClienteDto) {
    const cliente = await this.buscarPorWhatsapp.execute(query.whatsapp);
    if (!cliente) {
      throw new NotFoundException('Cliente nao encontrado para esse whatsapp');
    }
    // View REDUZIDA: esta resposta vai para o contexto do LLM externo via
    // n8n. NAO usar toPublic() aqui (vazaria PII/financeiro/notas internas).
    return cliente.toAgenteContexto();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const cliente = await this.buscar.execute(id);
    return cliente.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('clientes:write')
  async criarCliente(@Body() dto: CriarClienteDto) {
    const cliente = await this.criar.execute({
      nome: dto.nome,
      nomeFantasia: dto.nomeFantasia,
      tipoPessoa: dto.tipoPessoa,
      tabelaPreco: dto.tabelaPreco,
      telefone1: dto.telefone1,
      telefone2: dto.telefone2,
      email: dto.email,
      whatsapp: dto.whatsapp,
      origemContato: dto.origemContato,
    });
    return cliente.toPublic();
  }

  @Patch(':id/perfil')
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('clientes:write')
  async atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarPerfilClienteDto,
  ) {
    const cliente = await this.atualizarPerfil.execute(id, {
      estadoConversa: dto.estadoConversa,
      tipoCompra: dto.tipoCompra,
      urgencia: dto.urgencia,
      dataPretendidaCompra: dto.dataPretendidaCompra
        ? new Date(dto.dataPretendidaCompra)
        : dto.dataPretendidaCompra === null
          ? null
          : undefined,
      ticketEstimado: dto.ticketEstimado,
      intencaoCompra: dto.intencaoCompra,
      wishlist: dto.wishlist,
      nivelConhecimento: dto.nivelConhecimento,
      vendedoraSugeridaCodigo: dto.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: dto.vendedoraAprovadaCodigo,
      resumoTriagem: dto.resumoTriagem,
      notasInternas: dto.notasInternas,
      tags: dto.tags,
      scorePerfil: dto.scorePerfil,
      motivacaoCompra: dto.motivacaoCompra,
    });
    return cliente.toPublic();
  }
}
