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
} from '@nestjs/common';
import { AtualizarVendedoraUseCase } from '../../../application/use-cases/atualizar-vendedora.use-case';
import { BuscarVendedoraUseCase } from '../../../application/use-cases/buscar-vendedora.use-case';
import { CriarVendedoraUseCase } from '../../../application/use-cases/criar-vendedora.use-case';
import { ListarVendedorasUseCase } from '../../../application/use-cases/listar-vendedoras.use-case';
import { AtualizarVendedoraDto } from '../dto/atualizar-vendedora.dto';
import { CriarVendedoraDto } from '../dto/criar-vendedora.dto';
import { FiltroVendedoraDto } from '../dto/filtro-vendedora.dto';

// TODO(S4): aplicar guards (API Key para sync ERP, JWT para dashboard).
@Controller('vendedoras')
export class VendedorasController {
  constructor(
    private readonly criar: CriarVendedoraUseCase,
    private readonly buscar: BuscarVendedoraUseCase,
    private readonly listar: ListarVendedorasUseCase,
    private readonly atualizar: AtualizarVendedoraUseCase,
  ) {}

  @Get()
  async listarVendedoras(@Query() filtros: FiltroVendedoraDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((v) => v.toPublic());
  }

  @Get(':id')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const v = await this.buscar.execute(id);
    return v.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
