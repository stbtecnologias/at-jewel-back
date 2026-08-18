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
import { Throttle } from '@nestjs/throttler';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../../../../auth/infrastructure/http/guards/jwt-or-api-key.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
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
import { RemoverVendedoraUseCase } from '../../../application/use-cases/remover-vendedora.use-case';
import { SugerirVendedorasUseCase } from '../../../application/use-cases/sugerir-vendedoras.use-case';
import { AtualizarVendedoraDto } from '../dto/atualizar-vendedora.dto';
import { CriarVendedoraDto } from '../dto/criar-vendedora.dto';
import { FiltroVendedoraDto } from '../dto/filtro-vendedora.dto';
import { SugerirVendedoraDto } from '../dto/sugerir-vendedora.dto';

// Estrategia de auth por endpoint:
//  - Roteamento do agente (GET /disponiveis) => API Key + scope
//    'vendedoras:read' (chamado por n8n; serializacao reduzida sem PII)
//  - CRUD (GET, GET /:id, POST, PATCH, DELETE) => JwtOrApiKeyGuard, aceitando
//    JWT (checa @Permissions do papel) OU API Key (checa @RequireScopes).
//    Aberto para chave em 12/08/2026 para a integracao do ERP Safira poder
//    manter o cadastro — o ERP so envia codigo e nome, entao whatsapp_interno
//    e especialidades continuam sendo preenchidos pelo painel.
//  - Escrita (POST/PATCH/DELETE) => permissao 'vendedoras:write' ou scope
//    de mesmo nome (criar e mudar status/tipo sao operacoes administrativas;
//    a propria vendedora nao se cadastra)
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
    private readonly remover: RemoverVendedoraUseCase,
  ) {}

  // Rotas estaticas de metricas declaradas ANTES de GET /:id para nao
  // serem capturadas pela rota de parametro.
  // Metricas de desempenho seguem restritas a gestao por PAPEL (nao por
  // permissao): mapear para vendedoras:read vazaria as metricas das colegas
  // para a VENDEDORA (que tem vendedoras:read). SUPERADMIN incluido p/ a equipe STB.
  @Get('metricas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'GERENTE')
  async listarVendedorasMetricas() {
    const lista = await this.listarMetricas.execute();
    return lista.map((m) => m.toPublic());
  }

  @Post('metricas/refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN')
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
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:read')
  @RequireScopes('vendedoras:read')
  async listarVendedoras(@Query() filtros: FiltroVendedoraDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((v) => v.toPublic());
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:read')
  @RequireScopes('vendedoras:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const v = await this.buscar.execute(id);
    return v.toPublic();
  }

  @Get(':id/metricas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN', 'ADMIN', 'GERENTE')
  async buscarMetricasPorId(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.buscarMetricas.execute(id);
    return m.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:write')
  @RequireScopes('vendedoras:write')
  async criarVendedora(@Body() dto: CriarVendedoraDto) {
    const v = await this.criar.execute({
      idErp: dto.idErpVendedora,
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
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:write')
  @RequireScopes('vendedoras:write')
  async atualizarVendedora(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarVendedoraDto,
  ) {
    const v = await this.atualizar.execute(id, {
      idErp: dto.idErpVendedora,
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

  // Exclusao FISICA. O desligamento do dia a dia e PATCH com `ativo: false`,
  // que preserva a atribuicao de todo o historico. Aqui a linha some e as
  // referencias caem para NULL (ON DELETE SET NULL em vendas, consignacoes,
  // conversas, agente_eventos e nas FKs da migracao 29) — sem erro e sem
  // reconstrucao possivel. Existe para a integracao ter o CRUD completo.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:write')
  @RequireScopes('vendedoras:write')
  async removerVendedora(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.remover.execute(id);
  }
}
