import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ConsultarAuditoriaUseCase } from '../../../application/use-cases/consultar-auditoria.use-case';
import { FiltroAuditoriaDto } from '../dto/filtro-auditoria.dto';

/**
 * Auditoria dos atendimentos da equipe.
 *
 * SO JWT, SEM CHAVE DE API. As outras leituras do sistema aceitam as duas
 * portas porque a integracao com o Safira precisa delas. Esta nao: o que sai
 * daqui e o RELATO DA VENDEDORA — a vida da cliente dita em voz alta, cifrada
 * no banco justamente por isso. Nao ha caso de uso de integracao que precise
 * disso, e uma chave vazada nao deve abrir esta porta.
 *
 * `atendimentos:read` fica com ADMIN e GERENTE (migracao 38). A VENDEDORA nao
 * recebe: ela ja tem a propria agenda pelo canal interno, com escopo que nao
 * alcanca a de ninguem mais — dar esta permissao a ela abriria pelo painel o
 * que o canal fecha por ausencia de caminho.
 */
@Controller('atendimentos')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AtendimentosController {
  constructor(private readonly auditoria: ConsultarAuditoriaUseCase) {}

  /**
   * Os numeros do topo e a coluna de vendedoras, numa consulta so.
   * Declarado ANTES de `:id` — o Nest casa rotas na ordem em que aparecem, e
   * depois dele "resumo" seria lido como um uuid e cairia no ParseUUIDPipe.
   */
  @Get('resumo')
  @Permissions('atendimentos:read')
  async resumo(@Query() f: FiltroAuditoriaDto) {
    return this.auditoria.resumo({
      de: f.de ? new Date(f.de) : undefined,
      ate: f.ate ? new Date(f.ate) : undefined,
      etapa: f.etapa,
    });
  }

  @Get()
  @Permissions('atendimentos:read')
  async listar(@Query() f: FiltroAuditoriaDto) {
    return this.auditoria.listar({
      vendedoraId: f.vendedora_id,
      clienteNome: f.cliente,
      etapa: f.etapa,
      de: f.de ? new Date(f.de) : undefined,
      ate: f.ate ? new Date(f.ate) : undefined,
      limit: f.limit,
      offset: f.offset,
    });
  }

  /** Um episodio com a linha do tempo inteira. */
  @Get(':id')
  @Permissions('atendimentos:read')
  async detalhe(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditoria.detalhe(id);
  }
}
