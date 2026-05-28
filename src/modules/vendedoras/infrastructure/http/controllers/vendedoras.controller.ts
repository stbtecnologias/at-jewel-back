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
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { AtualizarVendedoraUseCase } from '../../../application/use-cases/atualizar-vendedora.use-case';
import { BuscarVendedoraUseCase } from '../../../application/use-cases/buscar-vendedora.use-case';
import { CriarVendedoraUseCase } from '../../../application/use-cases/criar-vendedora.use-case';
import { ListarVendedorasUseCase } from '../../../application/use-cases/listar-vendedoras.use-case';
import { AtualizarVendedoraDto } from '../dto/atualizar-vendedora.dto';
import { CriarVendedoraDto } from '../dto/criar-vendedora.dto';
import { FiltroVendedoraDto } from '../dto/filtro-vendedora.dto';

// Estrategia de auth:
//  - Leitura (GET) => JWT qualquer role (ADMIN/GERENTE/VENDEDORA)
//  - Escrita (POST/PATCH) => JWT + role ADMIN (criar e mudar status/tipo
//    sao operacoes administrativas; a propria vendedora nao se cadastra)
@Controller('vendedoras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendedorasController {
  constructor(
    private readonly criar: CriarVendedoraUseCase,
    private readonly buscar: BuscarVendedoraUseCase,
    private readonly listar: ListarVendedorasUseCase,
    private readonly atualizar: AtualizarVendedoraUseCase,
  ) {}

  @Get()
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  async listarVendedoras(@Query() filtros: FiltroVendedoraDto) {
    const lista = await this.listar.execute(filtros);
    return lista.map((v) => v.toPublic());
  }

  @Get(':id')
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const v = await this.buscar.execute(id);
    return v.toPublic();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
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
