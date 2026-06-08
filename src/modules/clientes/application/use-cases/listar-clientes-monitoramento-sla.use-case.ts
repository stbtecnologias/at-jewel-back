import { Inject, Injectable } from '@nestjs/common';
import {
  ESTADOS_MONITORADOS_SLA,
  EstadoConversaAgente,
} from '../../domain/entities/enums';
import { CLIENTE_PERFIL_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';

export interface ListarMonitoramentoSlaParams {
  // Quando informado, restringe a um unico estado monitorado. Quando ausente,
  // retorna os tres estados monitorados para SLA.
  estado?: EstadoConversaAgente;
  limit: number;
}

export interface MonitoramentoSlaItem {
  clienteId: string;
  estadoConversa: EstadoConversaAgente;
  estadoAtualizadoEm: string | null;
  urgencia: string | null;
  vendedoraSugeridaCodigo: string | null;
  vendedoraAprovadaCodigo: string | null;
}

/**
 * Lista clientes nos estados de atendimento monitorados para SLA, ordenados
 * por estado_atualizado_em ASC (mais antigo primeiro), para a Sofia (agente
 * gerencial via n8n) comparar com os SLAs configurados no n8n.
 *
 * A API NAO calcula SLA nem "minutos no estado": a politica de SLA e o
 * horario comercial vivem no n8n. Aqui so entregamos o estado + o timestamp
 * da ultima transicao. O retorno e ZERO-PII (so metadados de estado).
 */
@Injectable()
export class ListarClientesMonitoramentoSlaUseCase {
  constructor(
    @Inject(CLIENTE_PERFIL_REPOSITORY)
    private readonly perfilRepo: IClientePerfilRepository,
  ) {}

  async execute(
    params: ListarMonitoramentoSlaParams,
  ): Promise<MonitoramentoSlaItem[]> {
    // Se um estado especifico foi pedido, ele deve ser um dos monitorados.
    // O DTO ja restringe os valores aceitos; este filtro e a defesa em
    // profundidade contra um estado fora da lista de SLA.
    const estados: EstadoConversaAgente[] = params.estado
      ? ESTADOS_MONITORADOS_SLA.includes(params.estado)
        ? [params.estado]
        : []
      : [...ESTADOS_MONITORADOS_SLA];

    if (estados.length === 0) {
      return [];
    }

    const perfis = await this.perfilRepo.listarPorEstados(estados, params.limit);
    return perfis.map((p) => p.toMonitoramentoSla());
  }
}
