import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cliente } from '../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../domain/entities/cliente-perfil.entity';
import {
  EstadoConversaAgente,
  MotivacaoCompra,
  NivelConhecimento,
  TipoCompra,
  UrgenciaCompra,
  transicaoEhValida,
} from '../../domain/entities/enums';
import {
  CLIENTE_PERFIL_REPOSITORY,
  CLIENTE_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';

export interface AtualizarPerfilInput {
  estadoConversa?: EstadoConversaAgente;
  tipoCompra?: TipoCompra | null;
  urgencia?: UrgenciaCompra | null;
  dataPretendidaCompra?: Date | null;
  ticketEstimado?: number | null;
  intencaoCompra?: string | null;
  wishlist?: object | null;
  nivelConhecimento?: NivelConhecimento | null;
  vendedoraSugeridaCodigo?: string | null;
  vendedoraAprovadaCodigo?: string | null;
  resumoTriagem?: string | null;
  notasInternas?: string | null;
  tags?: string[];
  scorePerfil?: number | null;
  motivacaoCompra?: MotivacaoCompra | null;
  primeiroContatoEm?: Date | null;
}

@Injectable()
export class AtualizarPerfilClienteUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
    @Inject(CLIENTE_PERFIL_REPOSITORY)
    private readonly perfilRepo: IClientePerfilRepository,
  ) {}

  async execute(clienteId: string, input: AtualizarPerfilInput): Promise<Cliente> {
    const perfilAtual = await this.perfilRepo.buscarPorClienteId(clienteId);
    if (!perfilAtual) {
      throw new NotFoundException(`Perfil do cliente ${clienteId} nao encontrado`);
    }

    // Determina o estado novo (mantem o atual se nao foi enviado).
    const estadoNovo = input.estadoConversa ?? perfilAtual.estadoConversa;
    const estadoMudou = estadoNovo !== perfilAtual.estadoConversa;

    // Valida transicao via maquina de estados.
    if (estadoMudou && !transicaoEhValida(perfilAtual.estadoConversa, estadoNovo)) {
      throw new UnprocessableEntityException(
        `Transicao de estado invalida: ${perfilAtual.estadoConversa} -> ${estadoNovo}`,
      );
    }

    // Valida coerencia tipo_compra x motivacao_compra:
    // se motivacao = 'presente', tipo deve ser 'presente' (e vice-versa).
    const tipoNovo = input.tipoCompra !== undefined ? input.tipoCompra : perfilAtual.tipoCompra;
    const motivacaoNova =
      input.motivacaoCompra !== undefined
        ? input.motivacaoCompra
        : perfilAtual.motivacaoCompra;
    if (motivacaoNova === 'presente' && tipoNovo !== null && tipoNovo !== 'presente') {
      throw new UnprocessableEntityException(
        'Inconsistencia: motivacao_compra=presente exige tipo_compra=presente',
      );
    }
    if (
      tipoNovo === 'presente' &&
      motivacaoNova !== null &&
      motivacaoNova !== undefined &&
      motivacaoNova !== 'presente'
    ) {
      throw new UnprocessableEntityException(
        'Inconsistencia: tipo_compra=presente exige motivacao_compra=presente (ou nula)',
      );
    }

    const perfilAtualizado = ClientePerfil.create({
      clienteId,
      whatsapp: perfilAtual.whatsapp,
      whatsappHash: perfilAtual.whatsappHash,
      origemContato: perfilAtual.origemContato,
      estadoConversa: estadoNovo,
      estadoAtualizadoEm: estadoMudou ? new Date() : perfilAtual.estadoAtualizadoEm,
      tipoCompra: tipoNovo,
      urgencia: input.urgencia !== undefined ? input.urgencia : perfilAtual.urgencia,
      dataPretendidaCompra:
        input.dataPretendidaCompra !== undefined
          ? input.dataPretendidaCompra
          : perfilAtual.dataPretendidaCompra,
      ticketEstimado:
        input.ticketEstimado !== undefined
          ? input.ticketEstimado
          : perfilAtual.ticketEstimado,
      intencaoCompra:
        input.intencaoCompra !== undefined
          ? input.intencaoCompra
          : perfilAtual.intencaoCompra,
      wishlist: input.wishlist !== undefined ? input.wishlist : perfilAtual.wishlist,
      nivelConhecimento:
        input.nivelConhecimento !== undefined
          ? input.nivelConhecimento
          : perfilAtual.nivelConhecimento,
      vendedoraSugeridaCodigo:
        input.vendedoraSugeridaCodigo !== undefined
          ? input.vendedoraSugeridaCodigo
          : perfilAtual.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo:
        input.vendedoraAprovadaCodigo !== undefined
          ? input.vendedoraAprovadaCodigo
          : perfilAtual.vendedoraAprovadaCodigo,
      resumoTriagem:
        input.resumoTriagem !== undefined ? input.resumoTriagem : perfilAtual.resumoTriagem,
      notasInternas:
        input.notasInternas !== undefined ? input.notasInternas : perfilAtual.notasInternas,
      tags: input.tags !== undefined ? input.tags : perfilAtual.tags,
      scorePerfil:
        input.scorePerfil !== undefined ? input.scorePerfil : perfilAtual.scorePerfil,
      motivacaoCompra: motivacaoNova,
      primeiroContatoEm:
        input.primeiroContatoEm !== undefined
          ? input.primeiroContatoEm
          : perfilAtual.primeiroContatoEm,
    });

    await this.perfilRepo.atualizar(perfilAtualizado);

    // Retorna o cliente completo (com perfil atualizado).
    const cliente = await this.clienteRepo.buscarPorId(clienteId, { incluirPerfil: true });
    if (!cliente) {
      // Esse caso so acontece se o cliente foi deletado entre as duas operacoes.
      throw new NotFoundException(`Cliente ${clienteId} nao encontrado apos atualizacao`);
    }
    return cliente;
  }
}
