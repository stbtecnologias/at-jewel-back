import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Demanda } from '../../domain/entities/demanda.entity';
import type { CanalDemanda, TipoDemanda } from '../../domain/entities/enums';
import { DEMANDA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IDemandaRepository } from '../../domain/ports/repositories/demanda-repository.port';

export interface CriarDemandaInput {
  tipo: TipoDemanda;
  descricao: string;
  canal: CanalDemanda;
  // Identidade de quem abriu (JWT do painel ou do chat da Anastasia).
  solicitanteUserId?: string | null;
  // Rotulo de fallback quando o usuario nao tem nome cadastrado
  // (ex: email do token). O nome cadastrado, se existir, tem prioridade.
  solicitanteNomeFallback?: string | null;
}

@Injectable()
export class CriarDemandaUseCase {
  constructor(
    @Inject(DEMANDA_REPOSITORY)
    private readonly repo: IDemandaRepository,
  ) {}

  async execute(input: CriarDemandaInput): Promise<Demanda> {
    // Resolve o rotulo do solicitante: nome cadastrado do staff tem
    // prioridade; senao usa o fallback do token (email); por fim, um
    // rotulo generico para nunca violar o NOT NULL de solicitante_nome.
    const nomeCadastrado = input.solicitanteUserId
      ? await this.repo.buscarNomeUsuario(input.solicitanteUserId)
      : null;
    const solicitanteNome =
      nomeCadastrado?.trim() ||
      input.solicitanteNomeFallback?.trim() ||
      'Usuaria';

    let demanda: Demanda;
    try {
      demanda = Demanda.create({
        solicitanteUserId: input.solicitanteUserId ?? null,
        solicitanteNome,
        canal: input.canal,
        tipo: input.tipo,
        descricao: input.descricao,
        status: 'ABERTA',
      });
    } catch (erro) {
      // Violacao de invariante de dominio (descricao vazia) vira 400.
      throw new BadRequestException((erro as Error).message);
    }

    return this.repo.criar(demanda);
  }
}
