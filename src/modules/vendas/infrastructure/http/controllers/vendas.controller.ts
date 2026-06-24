import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import type { JwtPayload } from '../../../../auth/infrastructure/http/strategies/jwt.strategy';
import { EscopoVendasService } from '../../../application/escopo-vendas.service';
import { BuscarVendaUseCase } from '../../../application/use-cases/buscar-venda.use-case';
import { ComparativoVendedorasUseCase } from '../../../application/use-cases/comparativo-vendedoras.use-case';
import { ListarVendasUseCase } from '../../../application/use-cases/listar-vendas.use-case';
import { RegistrarVendaUseCase } from '../../../application/use-cases/registrar-venda.use-case';
import { ResumoVendasUseCase } from '../../../application/use-cases/resumo-vendas.use-case';
import { FiltroResumoVendaDto } from '../dto/filtro-resumo-venda.dto';
import { FiltroVendaDto } from '../dto/filtro-venda.dto';
import { RegistrarVendaDto } from '../dto/registrar-venda.dto';

// Estrategia de auth por endpoint:
//  - Escrita (POST) => API Key + scope 'vendas:write'. Ingestao manual/generica.
//    A sync do ERP Safira usa a rota dedicada POST /erp/vendas (ErpController,
//    SafiraAuthGuard), que reaproveita a validacao de invariantes do dominio.
//  - Leitura de vendas (GET, GET /resumo) => JWT + permissao 'vendas:read'.
//    Isolamento por vendedora (RF-USU-02): quem NAO tem 'vendas:read_all' so
//    enxerga as proprias vendas (vendedora vinculada ao usuario); a gestao
//    (vendas:read_all) ve a carteira inteira e pode filtrar/comparar.
//  - Comparativo (GET /comparativo) => JWT + 'vendas:read_all' (so gestao).
//  - Detalhe (GET /:id) => JWT + role ADMIN/GERENTE (drill-down gerencial).
@Controller('vendas')
export class VendasController {
  constructor(
    private readonly registrar: RegistrarVendaUseCase,
    private readonly listar: ListarVendasUseCase,
    private readonly buscar: BuscarVendaUseCase,
    private readonly resumo: ResumoVendasUseCase,
    private readonly comparativo: ComparativoVendedorasUseCase,
    private readonly escopo: EscopoVendasService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('vendas:write')
  async registrarVenda(@Body() dto: RegistrarVendaDto) {
    const venda = await this.registrar.execute({
      codigoErp: dto.codigoErp,
      clienteId: dto.clienteId,
      vendedoraId: dto.vendedoraId,
      dataVenda: new Date(dto.dataVenda),
      dataContato: dto.dataContato ? new Date(dto.dataContato) : null,
      valorBruto: dto.valorBruto,
      valorDesconto: dto.valorDesconto,
      valorTotal: dto.valorTotal,
      status: dto.status,
      observacao: dto.observacao,
      itens: dto.itens.map((i) => ({
        produtoId: i.produtoId ?? null,
        codigoErpItem: i.codigoErpItem ?? null,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        valorCustoUnitario: i.valorCustoUnitario ?? null,
        valorDescontoItem: i.valorDescontoItem,
        valorTotalItem: i.valorTotalItem,
      })),
      pagamentos: dto.pagamentos.map((p) => ({
        formaPagamento: p.formaPagamento,
        valor: p.valor,
        parcelas: p.parcelas,
        valorParcela: p.valorParcela ?? null,
        bandeira: p.bandeira ?? null,
        dataPagamento: p.dataPagamento ? new Date(p.dataPagamento) : null,
      })),
    });
    return venda.toPublic();
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read')
  async listarVendas(
    @Query() filtros: FiltroVendaDto,
    @Request() req: { user: JwtPayload },
  ) {
    // Isolamento (RF-USU-02): se restrito, forca a vendedora propria e ignora
    // qualquer vendedoraId vindo do cliente; a gestao usa o filtro escolhido.
    const restrito = await this.escopo.vendedoraIdRestrito(req.user);
    return this.listar.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
      clienteId: filtros.clienteId,
      vendedoraId: restrito ?? filtros.vendedoraId,
      status: filtros.status,
      formaPagamento: filtros.formaPagamento,
      limit: filtros.limit,
      offset: filtros.offset,
    });
  }

  // Rota ESTATICA declarada antes de GET /:id para nao colidir com o
  // ParseUUIDPipe (que rejeitaria 'resumo' como UUID invalido).
  @Get('resumo')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read')
  async resumoVendas(
    @Query() filtros: FiltroResumoVendaDto,
    @Request() req: { user: JwtPayload },
  ) {
    const restrito = await this.escopo.vendedoraIdRestrito(req.user);
    return this.resumo.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
      vendedoraId: restrito ?? filtros.vendedoraId,
      status: filtros.status,
    });
  }

  // Comparativo de desempenho por vendedora (RF-USU-02) — so gestao.
  // Estatica, declarada antes de GET /:id.
  @Get('comparativo')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read_all')
  async comparativoVendedoras(@Query() filtros: FiltroResumoVendaDto) {
    return this.comparativo.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const venda = await this.buscar.execute(id);
    return venda.toPublic();
  }
}
