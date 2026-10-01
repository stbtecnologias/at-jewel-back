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
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import type { JwtPayload } from '../../../../auth/infrastructure/http/strategies/jwt.strategy';
import { EscopoVendasService } from '../../../application/escopo-vendas.service';
import { BuscarVendaUseCase } from '../../../application/use-cases/buscar-venda.use-case';
import { ComparativoVendedorasUseCase } from '../../../application/use-cases/comparativo-vendedoras.use-case';
import { ListarVendasUseCase } from '../../../application/use-cases/listar-vendas.use-case';
import { RegistrarVendaUseCase } from '../../../application/use-cases/registrar-venda.use-case';
import { ResumoVendasUseCase } from '../../../application/use-cases/resumo-vendas.use-case';
import { SerieMensalVendasUseCase } from '../../../application/use-cases/serie-mensal-vendas.use-case';
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
//  - Serie mensal (GET /serie-mensal) => JWT + 'vendas:read', com o mesmo
//    isolamento do resumo.
//  - Detalhe (GET /:id) => JWT + role ADMIN/GERENTE (drill-down gerencial).
@Controller('vendas')
export class VendasController {
  constructor(
    private readonly registrar: RegistrarVendaUseCase,
    private readonly listar: ListarVendasUseCase,
    private readonly buscar: BuscarVendaUseCase,
    private readonly resumo: ResumoVendasUseCase,
    private readonly comparativo: ComparativoVendedorasUseCase,
    private readonly serieMensal: SerieMensalVendasUseCase,
    private readonly escopo: EscopoVendasService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ApiKeyGuard, ScopesGuard)
  @RequireScopes('vendas:write')
  async registrarVenda(@Body() dto: RegistrarVendaDto) {
    const venda = await this.registrar.execute({
      idErp: dto.idErpVenda,
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
        idErpItem: i.idErpItem ?? null,
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
    // O ECO DO POST LEVA O CUSTO, e isso nao e excecao a regra — e o outro
    // lado dela. Quem entra aqui e o integrador, por API Key com escopo
    // `vendas:write`, e foi ELE quem acabou de mandar o `valorCustoUnitario`.
    // Recortar o eco quebraria a ida e volta da integracao sem proteger nada:
    // o dado ja e dele. Mesmo raciocinio do `paraIntegrador` em produtos.
    return venda.toPublic(true);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read')
  async listarVendas(
    @Query() filtros: FiltroVendaDto,
    @Request() req: { user: JwtPayload },
  ) {
    // Isolamento (RF-USU-02, e o recorte de EQUIPE desde 28/09/2026): quando
    // ha recorte ele MANDA, e o vendedoraId vindo do cliente e ignorado; quem
    // ve a loja inteira usa o filtro escolhido na tela.
    const restrito = await this.escopo.recorteDeVendas(req.user);
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
    const restrito = await this.escopo.recorteDeVendas(req.user);
    return this.resumo.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
      vendedoraId: restrito ?? filtros.vendedoraId,
      status: filtros.status,
      formaPagamento: filtros.formaPagamento,
    });
  }

  // Comparativo de desempenho por vendedora (RF-USU-02) — so gestao.
  // Estatica, declarada antes de GET /:id.
  //
  // O RECORTE INTEIRO desde 11/09/2026. O DTO sempre aceitou status, forma e
  // vendedora; esta rota os descartava e passava so as datas — o "Top
  // vendedoras" ignorava o filtro que o resto da tela respeitava.
  //
  // E O RECORTE DE EQUIPE TAMBEM, desde 28/09/2026 — esta rota era a que mais
  // precisava dele. `vendas:read_all` sozinho a abria inteira, e ela e
  // literalmente a lista de quem vendeu quanto: sem o recorte, a gerente veria
  // o desempenho das vendedoras dos outros times ao lado do das dela.
  @Get('comparativo')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read_all')
  async comparativoVendedoras(
    @Query() filtros: FiltroResumoVendaDto,
    @Request() req: { user: JwtPayload },
  ) {
    const restrito = await this.escopo.recorteDeVendas(req.user);
    return this.comparativo.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
      vendedoraId: restrito ?? filtros.vendedoraId,
      status: filtros.status,
      formaPagamento: filtros.formaPagamento,
    });
  }

  // A serie mensal da tela de vendas, no recorte da tela. Estatica, antes de
  // GET /:id. `vendas:read` e o isolamento do resumo: a vendedora so ve a
  // propria serie, qualquer que seja o `vendedoraId` que chegue.
  @Get('serie-mensal')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read')
  async serieMensalVendas(
    @Query() filtros: FiltroResumoVendaDto,
    @Request() req: { user: JwtPayload },
  ) {
    const restrito = await this.escopo.recorteDeVendas(req.user);
    return this.serieMensal.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
      vendedoraId: restrito ?? filtros.vendedoraId,
      status: filtros.status,
      formaPagamento: filtros.formaPagamento,
    });
  }

  /**
   * O DETALHE DA VENDA — e a porta por onde o custo saia.
   *
   * ========================================================================
   * `vendas:read_all` NAO E `produtos:custo`, e a diferenca tem dono.
   *
   * O `GERENTE_VENDAS` tem a primeira e nao tem a segunda, de proposito: a
   * migracao 72 diz que ela acompanha o TIME dela e nao ve custo nem margem.
   * Ate 01/10/2026 bastava abrir uma venda para ver o custo de cada peca.
   *
   * E a mesma reincidencia de 28/09, quando o custo foi fechado no produto e
   * continuou saindo por outro caminho. A licao ficou escrita no repositorio e
   * vale repetir: *um campo sensivel nao se protege no serializador, se
   * protege em TODA porta por onde ele sai*.
   * ========================================================================
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('vendas:read_all')
  async buscarPorId(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: JwtPayload },
  ) {
    const venda = await this.buscar.execute(id);
    return venda.toPublic(await this.escopo.podeVerCusto(req.user));
  }
}
