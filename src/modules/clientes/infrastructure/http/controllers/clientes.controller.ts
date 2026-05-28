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
} from '@nestjs/common';
import { AtualizarPerfilClienteUseCase } from '../../../application/use-cases/atualizar-perfil-cliente.use-case';
import { BuscarClienteUseCase } from '../../../application/use-cases/buscar-cliente.use-case';
import { BuscarClientePorWhatsappUseCase } from '../../../application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { CriarClienteUseCase } from '../../../application/use-cases/criar-cliente.use-case';
import { ListarClientesUseCase } from '../../../application/use-cases/listar-clientes.use-case';
import { AtualizarPerfilClienteDto } from '../dto/atualizar-perfil-cliente.dto';
import { CriarClienteDto } from '../dto/criar-cliente.dto';
import { FiltroClienteDto } from '../dto/filtro-cliente.dto';
import { LookupClienteDto } from '../dto/lookup-cliente.dto';

// TODO(S4): aplicar guards de autorizacao quando RBAC for implementado.
// Endpoints chamados pelo n8n (POST /clientes, GET /clientes/lookup, PATCH /perfil)
// devem exigir API Key. Endpoints do dashboard (GET /clientes, GET /:id) podem
// aceitar JWT ou API Key.
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
  async listarClientes(@Query() filtros: FiltroClienteDto) {
    const clientes = await this.listar.execute(filtros);
    // Listagem nao expoe perfil — apenas dados operacionais (sem hashes).
    return clientes.map((c) => c.toPublic());
  }

  @Get('lookup')
  async lookupPorWhatsapp(@Query() query: LookupClienteDto) {
    const cliente = await this.buscarPorWhatsapp.execute(query.whatsapp);
    if (!cliente) {
      // 404 e o sinal claro para o n8n decidir entre "cria novo" ou "ignora".
      throw new NotFoundException('Cliente nao encontrado para esse whatsapp');
    }
    return cliente.toPublic();
  }

  @Get(':id')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const cliente = await this.buscar.execute(id);
    return cliente.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
