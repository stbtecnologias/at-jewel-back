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
import { Throttle } from '@nestjs/throttler';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import { AtualizarPerfilClienteUseCase } from '../../../application/use-cases/atualizar-perfil-cliente.use-case';
import { BuscarClienteUseCase } from '../../../application/use-cases/buscar-cliente.use-case';
import { BuscarClientePorWhatsappUseCase } from '../../../application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { BuscarHistoricoClienteUseCase } from '../../../application/use-cases/buscar-historico-cliente.use-case';
import { CriarClienteUseCase } from '../../../application/use-cases/criar-cliente.use-case';
import { DistribuicaoTiersUseCase } from '../../../application/use-cases/distribuicao-tiers.use-case';
import { ListarClientesUseCase } from '../../../application/use-cases/listar-clientes.use-case';
import { ListarClientesMonitoramentoSlaUseCase } from '../../../application/use-cases/listar-clientes-monitoramento-sla.use-case';
import { AtualizarPerfilClienteDto } from '../dto/atualizar-perfil-cliente.dto';
import { CriarClienteDto } from '../dto/criar-cliente.dto';
import { FiltroClienteDto } from '../dto/filtro-cliente.dto';
import { HistoricoClienteQueryDto } from '../dto/historico-cliente.dto';
import { LookupClienteDto } from '../dto/lookup-cliente.dto';
import { MonitoramentoSlaQueryDto } from '../dto/monitoramento-sla.dto';
import type { FiltroDemografico } from '../../../domain/ports/repositories/cliente-repository.port';

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
    private readonly buscarHistorico: BuscarHistoricoClienteUseCase,
    private readonly monitoramentoSla: ListarClientesMonitoramentoSlaUseCase,
    private readonly distribuicaoTiers: DistribuicaoTiersUseCase,
  ) {}

  // Distribuicao por faixa de fidelidade (agregado, sem PII). Antes de :id.
  // Aceita o filtro comum das telas administrativas (periodo + sexo/origem/
  // faixa). Periodo filtra por clientes criados no intervalo.
  @Get('tiers')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('clientes:read')
  async tiers(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string,
    @Query('origem') origem?: string,
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
  ) {
    const filtro: FiltroDemografico = {};
    if (dataInicio && dataFim) {
      const di = new Date(dataInicio);
      const df = new Date(dataFim);
      if (!Number.isNaN(di.getTime()) && !Number.isNaN(df.getTime())) {
        filtro.dataInicio = di;
        filtro.dataFim = df;
      }
    }
    if (sexo) filtro.sexo = sexo;
    if (origem) filtro.origem = origem;
    if (faixa) filtro.faixaEtaria = faixa;
    if (idadeMin) {
      const min = Number(idadeMin);
      if (Number.isInteger(min) && min >= 0) filtro.idadeMin = min;
    }
    if (idadeMax) {
      const max = Number(idadeMax);
      if (Number.isInteger(max) && max >= 0) filtro.idadeMax = max;
    }
    return this.distribuicaoTiers.execute(
      Object.keys(filtro).length > 0 ? filtro : undefined,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('clientes:read')
  async listarClientes(@Query() filtros: FiltroClienteDto) {
    const clientes = await this.listar.execute(filtros);
    return clientes.map((c) => c.toPublic());
  }

  // Throttle estrito (20 req/min/IP): lookup por whatsapp e o endpoint de
  // maior risco de ENUMERACAO (descobrir clientes testando telefones) caso a
  // API key vaze. Limite agressivo abaixo do global (100/min). NOTA: rate
  // limit por IP e mitigacao PARCIAL — a defesa real e scope minimo
  // (clientes:read), expiracao da chave (M-002) e a view reduzida
  // toAgenteContexto (C-001). Esta camada apenas reduz a velocidade de abuso.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
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

  // Monitoramento de SLA da Sofia (agente gerencial via n8n): lista clientes
  // nos estados de atendimento monitorados, ordenados do mais antigo para o
  // mais recente. Retorno ZERO-PII (so estado + timestamp + codigos de
  // vendedora). A API NAO calcula SLA: a politica e o horario comercial vivem
  // no n8n, que calcula o tempo decorrido a partir de estadoAtualizadoEm.
  // Mesmo scope de leitura do agente (clientes:read). Throttle consistente
  // com os demais endpoints do agente (20 req/min/IP) — endpoint de polling,
  // mitigacao parcial contra abuso caso a API key vaze; a defesa real e o
  // scope minimo e a expiracao da chave.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('monitoramento-sla')
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('clientes:read')
  async listarMonitoramentoSla(@Query() query: MonitoramentoSlaQueryDto) {
    return this.monitoramentoSla.execute({
      estado: query.estado,
      limit: query.limit ?? 200,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('clientes:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const cliente = await this.buscar.execute(id);
    return cliente.toPublic();
  }

  // Historico de compras do cliente para o dashboard. Apenas dados de venda
  // (sem PII; nome do cliente nao se repete aqui). Leitura administrativa:
  // exige clientes:read (RF-USU-01).
  @Get(':id/historico')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('clientes:read')
  async historico(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: HistoricoClienteQueryDto,
  ) {
    return this.buscarHistorico.execute(id, {
      limit: query.limit,
      offset: query.offset,
    });
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
      primeiroContatoEm: dto.primeiroContatoEm
        ? new Date(dto.primeiroContatoEm)
        : dto.primeiroContatoEm === null
          ? null
          : undefined,
      sexo: dto.sexo,
      faixaEtaria: dto.faixaEtaria,
      idade: dto.idade,
    });
    return cliente.toPublic();
  }
}
