import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EscopoVendasService } from '../../../../vendas/application/escopo-vendas.service';
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
import { BuscarVendedoraPorIdErpUseCase } from '../../../application/use-cases/buscar-vendedora-por-id-erp.use-case';
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
    private readonly buscarPorIdErp: BuscarVendedoraPorIdErpUseCase,
    private readonly listar: ListarVendedorasUseCase,
    private readonly listarDisponiveis: ListarVendedorasDisponiveisUseCase,
    private readonly atualizar: AtualizarVendedoraUseCase,
    private readonly listarMetricas: ListarVendedorasMetricasUseCase,
    private readonly buscarMetricas: BuscarVendedoraMetricasUseCase,
    private readonly refreshMetricas: RefreshVendedorasMetricasUseCase,
    private readonly sugerir: SugerirVendedorasUseCase,
    private readonly remover: RemoverVendedoraUseCase,
    // ====================================================================
    // QUEM ESTE USUARIO ALCANCA — 23/10/2026. NO FIM DA LISTA, para o
    // diff de quem adicionou ser uma linha e nao um deslocamento.
    //
    // O pedido: *"o perfil de gerente de vendas nao pode ver essas
    // vendedoras e tudo que contem elas"*. A resposta nao e uma regra nova:
    // e a EQUIPE, que existe desde a migracao 67 e so agora foi cadastrada.
    //
    // O modulo ja importava o de vendas (o score da sugestao le venda), entao
    // nao ha ciclo nem provider novo — so passar a perguntar.
    // ====================================================================
    private readonly escopo: EscopoVendasService,
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
  async listarVendedoras(
    @Query() filtros: FiltroVendedoraDto,
    @Request() req: RequisicaoComUsuario,
  ) {
    const lista = await this.listar.execute(filtros);
    const equipe = await this.daEquipe(req);
    // FILTRA DEPOIS DE BUSCAR, e nao no SQL: sao 23 vendedoras na base
    // inteira, e o filtro do `listar` ja e o da tela. Empurrar a equipe para
    // dentro do repositorio custaria uma assinatura nova em todo o caminho
    // para economizar nada.
    const visiveis =
      equipe === null ? lista : lista.filter((v) => v.id && equipe.includes(v.id));
    return visiveis.map((v) => v.toPublic());
  }

  // Busca pela identidade no ERP. Declarada ANTES de @Get(':id') porque o Nest
  // casa as rotas na ordem em que aparecem — depois dele, "iderp" seria lido
  // como um id e cairia no ParseUUIDPipe.
  @Get('iderp/:id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:read')
  @RequireScopes('vendedoras:read')
  async buscarPeloIdErp(
    @Param('id') idErp: string,
    @Request() req: RequisicaoComUsuario,
  ) {
    const v = await this.buscarPorIdErp.execute(idErp);
    await this.exigirDaEquipe(req, v.id);
    return v.toPublic();
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('vendedoras:read')
  @RequireScopes('vendedoras:read')
  async buscarPorId(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: RequisicaoComUsuario,
  ) {
    const v = await this.buscar.execute(id);
    await this.exigirDaEquipe(req, v.id);
    return v.toPublic();
  }

  /**
   * AS VENDEDORAS QUE ESTE USUARIO ALCANCA — `null` = todas.
   *
   * ======================================================================
   * SEM `req.user` E CHAVE DE API, e ela ve tudo. O `JwtOrApiKeyGuard`
   * popula `req.user` so no caminho do JWT; a integracao do ERP entra pela
   * chave, e recortar a integracao faria o Safira deixar de enxergar as
   * vendedoras que ele mesmo cadastrou.
   *
   * E `equipeDoUsuario` em vez de `recorteDeVendas` de proposito: aquele
   * exige `vendas:read_all` ou vinculo com vendedora e lanca 403 para quem
   * nao tem nenhum dos dois — o ESTOQUISTA tem `vendedoras:read` e nao tem
   * venda nenhuma, e passaria a levar 403 numa tela que sempre abriu.
   * ======================================================================
   */
  private async daEquipe(req: RequisicaoComUsuario): Promise<string[] | null> {
    const sub = req?.user?.sub;
    if (!sub) return null;
    return this.escopo.equipeDoUsuario(sub);
  }

  /**
   * Fora da equipe responde "nao achei", e nao "voce nao pode".
   *
   * Dizer que existe uma vendedora que ela nao pode ver ja e contar que ela
   * existe — a mesma regra que o canal da Anastasia usa desde 28/09.
   */
  private async exigirDaEquipe(
    req: RequisicaoComUsuario,
    id: string | undefined,
  ): Promise<void> {
    const equipe = await this.daEquipe(req);
    if (equipe === null) return;
    if (!id || !equipe.includes(id)) {
      throw new NotFoundException('Vendedora não encontrada');
    }
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
      whatsappExterno: dto.whatsappExterno,
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
      codigoErp: dto.codigoErp,
      statusDisponibilidade: dto.statusDisponibilidade,
      especialidades: dto.especialidades,
      email: dto.email,
      whatsappInterno: dto.whatsappInterno,
      whatsappExterno: dto.whatsappExterno,
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

/**
 * O que este controller le da requisicao — e so isso.
 *
 * `sub` e o id do usuario do painel; ausente quando a credencial foi chave de
 * API, e e por isso que ele e opcional.
 */
interface RequisicaoComUsuario {
  user?: { sub?: string };
}
