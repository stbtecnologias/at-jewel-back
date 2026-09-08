import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ConsultarAuditoriaUseCase } from '../../../application/use-cases/consultar-auditoria.use-case';
import { ConsultarLinhaDoTempoUseCase } from '../../../application/use-cases/consultar-linha-do-tempo.use-case';
import { ReabrirAtendimentoUseCase } from '../../../application/use-cases/reabrir-atendimento.use-case';
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
  constructor(
    private readonly auditoria: ConsultarAuditoriaUseCase,
    private readonly linha: ConsultarLinhaDoTempoUseCase,
    private readonly reabrirUC: ReabrirAtendimentoUseCase,
  ) {}

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

  /**
   * A mesma contagem do resumo, quebrada no tempo. Tambem ANTES de `:id`.
   *
   * Sem granularidade nao ha resposta possivel — "a serie de agosto" pode ser
   * por dia ou por semana, e escolher por conta propria devolveria trinta e um
   * baldes onde a tela esperava cinco.
   */
  @Get('serie')
  @Permissions('atendimentos:read')
  async serie(@Query() f: FiltroAuditoriaDto) {
    return this.auditoria.serie(
      {
        vendedoraId: f.vendedora_id,
        etapa: f.etapa,
        de: f.de ? new Date(f.de) : undefined,
        ate: f.ate ? new Date(f.ate) : undefined,
      },
      f.granularidade ?? 'DIA',
    );
  }

  /**
   * A Linha do Tempo do dia — MEL-14.
   *
   * Declarada ANTES de `:id` pelo mesmo motivo de `resumo` e `serie`: o Nest
   * casa rotas na ordem em que aparecem.
   *
   * @param dia `YYYY-MM-DD`. Sem ele, hoje — e, se hoje estiver parado, o
   *        ultimo dia com movimento (a resposta diz qual, em `dia`/`recuado`).
   */
  @Get('linha-do-tempo')
  @Permissions('atendimentos:read')
  async linhaDoTempo(@Query('dia') dia?: string) {
    return this.linha.execute(/^\d{4}-\d{2}-\d{2}$/.test(dia ?? '') ? dia : undefined);
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
  /**
   * Desfaz um fechamento — a rede embaixo do MEL-15.
   *
   * `atendimentos:write` e nao `:read`: e a UNICA escrita de atendimento
   * pelo painel, e nasceu porque a leitura da conversa vai fechar episodio
   * sozinha. Ver a migracao 54.
   */
  @Post(':id/reabrir')
  @Permissions('atendimentos:write')
  async reabrir(@Param('id', ParseUUIDPipe) id: string) {
    await this.reabrirUC.execute(id);
    return { ok: true };
  }
}
