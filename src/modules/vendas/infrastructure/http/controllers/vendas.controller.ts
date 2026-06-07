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
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import { BuscarVendaUseCase } from '../../../application/use-cases/buscar-venda.use-case';
import { ListarVendasUseCase } from '../../../application/use-cases/listar-vendas.use-case';
import { RegistrarVendaUseCase } from '../../../application/use-cases/registrar-venda.use-case';
import { FiltroVendaDto } from '../dto/filtro-venda.dto';
import { RegistrarVendaDto } from '../dto/registrar-venda.dto';

// Estrategia de auth por endpoint:
//  - Escrita (POST) => API Key + scope 'vendas:write'. Sera chamado
//    pela futura sync do ERP (n8n). TODO: rota dedicada /erp/vendas.
//  - Leitura administrativa (GET, GET /:id) => JWT + role ADMIN/GERENTE.
//    Faturamento e dado gerencial; pelo principio de menor exposicao,
//    VENDEDORA NAO recebe acesso a carteira inteira de vendas aqui.
@Controller('vendas')
export class VendasController {
  constructor(
    private readonly registrar: RegistrarVendaUseCase,
    private readonly listar: ListarVendasUseCase,
    private readonly buscar: BuscarVendaUseCase,
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  async listarVendas(@Query() filtros: FiltroVendaDto) {
    const vendas = await this.listar.execute({
      dataDe: filtros.dataDe ? new Date(filtros.dataDe) : undefined,
      dataAte: filtros.dataAte ? new Date(filtros.dataAte) : undefined,
      clienteId: filtros.clienteId,
      vendedoraId: filtros.vendedoraId,
      status: filtros.status,
      limit: filtros.limit,
      offset: filtros.offset,
    });
    return vendas.map((v) => v.toResumo());
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const venda = await this.buscar.execute(id);
    return venda.toPublic();
  }
}
