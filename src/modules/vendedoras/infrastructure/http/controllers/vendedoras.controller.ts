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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import { AtualizarVendedoraUseCase } from '../../../application/use-cases/atualizar-vendedora.use-case';
import { BuscarVendedoraUseCase } from '../../../application/use-cases/buscar-vendedora.use-case';
import { BuscarVendedoraMetricasUseCase } from '../../../application/use-cases/buscar-vendedora-metricas.use-case';
import { CriarVendedoraUseCase } from '../../../application/use-cases/criar-vendedora.use-case';
import { ListarVendedorasUseCase } from '../../../application/use-cases/listar-vendedoras.use-case';
import { ListarVendedorasDisponiveisUseCase } from '../../../application/use-cases/listar-vendedoras-disponiveis.use-case';
import { ListarVendedorasMetricasUseCase } from '../../../application/use-cases/listar-vendedoras-metricas.use-case';
import { RefreshVendedorasMetricasUseCase } from '../../../application/use-cases/refresh-vendedoras-metricas.use-case';
import { SugerirVendedorasUseCase } from '../../../application/use-cases/sugerir-vendedoras.use-case';
import { AtualizarVendedoraDto } from '../dto/atualizar-vendedora.dto';
import { CriarVendedoraDto } from '../dto/criar-vendedora.dto';
import { FiltroVendedoraDto } from '../dto/filtro-vendedora.dto';
import { SugerirVendedoraDto } from '../dto/sugerir-vendedora.dto';

// Estrategia de auth por endpoint:
//  - Roteamento do agente (GET /disponiveis) => API Key + scope
//    'vendedoras:read' (chamado por n8n; serializacao reduzida sem PII)
//  - Leitura administrativa (GET, GET /:id) => JWT qualquer role
//    (ADMIN/GERENTE/VENDEDORA)
//  - Escrita (POST/PATCH) => JWT + role ADMIN (criar e mudar status/tipo
//    sao operacoes administrativas; a propria vendedora nao se cadastra)
//  - Metricas (GET /metricas, GET /:id/metricas) => JWT + ADMIN/GERENTE.
//    Dado gerencial agregado: NAO exposto a role VENDEDORA (uma vendedora
//    nao deve ver a performance/carteira das colegas).
//  - Refresh (POST /metricas/refresh) => JWT + ADMIN. Operacao de job,
//    disparada por cron/n8n externo diariamente.
//  - Sugestao (POST /sugerir) => API Key + scope 'vendedoras:read'. Roteamento
//    da Anastasia: recebe dados de triagem e devolve vendedoras ranqueadas
//    (score + motivos). Sem metricas cruas nem PII de cliente no retorno.
@Controller('vendedoras')
export class VendedorasController {
  constructor(
    private readonly criar: CriarVendedoraUseCase,
    private readonly buscar: BuscarVendedoraUseCase,
    private readonly listar: ListarVendedorasUseCase,
    private readonly listarDisponiveis: ListarVendedorasDisponiveisUseCase,
    private readonly atualizar: AtualizarVendedoraUseCase,
    private readonly listarMetricas: ListarVendedorasMetricasUseCase,
    private readonly buscarMetricas: BuscarVendedoraMetricasUseCase,
    private readonly refreshMetricas: RefreshVendedorasMetricasUseCase,
    private readonly sugerir: SugerirVendedorasUseCase,
  ) {}

  // Rotas estaticas de metricas declaradas ANTES de GET /:id para nao
  // serem capturadas pela rota de parametro.
  @Get('metricas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  async listarVendedorasMetricas() {
    const lista = await this.listarMetricas.execute();
    return lista.map((m) => m.toPublic());
  }

  @Post('metricas/refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async refreshVendedorasMetricas() {
    return this.refreshMetricas.execute();
  }

  // Declarado antes de GET /:id para nao ser capturado pela rota de param.
  // Throttle estrito (20 req/min/IP), consistente com os demais endpoints de
  // agente (API key). Rate limit por IP e mitigacao PARCIAL: a defesa real e
  // scope minimo (vendedoras:read), expiracao da chave (M-002) e a view
  // reduzida toAgentePublic (sem PII/metricas cruas).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('disponiveis')
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('vendedoras:read')
  async listarDisponiveisParaAgente() {
    const lista = await this.listarDisponiveis.execute();
    return lista.map((v) => v.toAgentePublic());
  }

  // Roteamento da Anastasia (n8n). Recebe dados de triagem e devolve
  // vendedoras ranqueadas. Mesmo scope de leitura do agente. A logica de
  // score fica no servidor (testavel; metricas nao chegam ao LLM).
  // Throttle estrito (20 req/min/IP), consistente com /disponiveis e
  // /clientes/lookup. Mesma ressalva: mitigacao parcial; defesa real e scope
  // minimo + expiracao da chave + retorno reduzido (score + motivos, sem PII).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('sugerir')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('vendedoras:read')
  async sugerirVendedoras(@Body() dto: SugerirVendedoraDto) {
    return this.sugerir.execute({
      clienteId: dto.clienteId ?? null,
      especialidade: dto.especialidade ?? null,
      ticketEstimado: dto.ticketEstimado ?? null,
      limit: dto.limit,
      excluir: dto.excluir ?? null,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  async listarVendedoras(@Query() filtros: FiltroVendedoraDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((v) => v.toPublic());
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const v = await this.buscar.execute(id);
    return v.toPublic();
  }

  @Get(':id/metricas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  async buscarMetricasPorId(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.buscarMetricas.execute(id);
    return m.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async criarVendedora(@Body() dto: CriarVendedoraDto) {
    const v = await this.criar.execute({
      codigoErp: dto.codigoErp,
      nome: dto.nome,
      tipo: dto.tipo,
      especialidades: dto.especialidades,
      email: dto.email,
      whatsappInterno: dto.whatsappInterno,
      adminUserId: dto.adminUserId,
    });
    return v.toPublic();
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async atualizarVendedora(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarVendedoraDto,
  ) {
    const v = await this.atualizar.execute(id, {
      nome: dto.nome,
      tipo: dto.tipo,
      ativo: dto.ativo,
      statusDisponibilidade: dto.statusDisponibilidade,
      especialidades: dto.especialidades,
      email: dto.email,
      whatsappInterno: dto.whatsappInterno,
      adminUserId: dto.adminUserId,
    });
    return v.toPublic();
  }
}
