import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';

/**
 * Desfaz o fechamento de um atendimento — a rede embaixo do MEL-15.
 *
 * ==========================================================================
 * EXISTE POR CAUSA DO FECHAMENTO AUTOMATICO, E FOI FEITO ANTES DELE.
 *
 * Ate 08/09/2026 quem fechava era a vendedora, dizendo "vendi". Ela errar
 * sobre a propria venda e raro, e quando acontece ela sabe.
 *
 * Com a leitura da conversa concluindo sozinha, o erro muda de natureza: o
 * atendimento SAI DA FILA. Para de ser cobrado, some das pendencias, e a
 * cliente cai do acompanhamento — sem erro na tela, sem ninguem notar. O
 * atendimento so some.
 *
 * Por isso este arquivo nasceu ANTES do leitor: fechamento que nao se desfaz
 * nao deveria ser automatico.
 * ==========================================================================
 */
@Injectable()
export class ReabrirAtendimentoUseCase {
  private readonly logger = new Logger(ReabrirAtendimentoUseCase.name);

  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly repo: IAtendimentoRepository,
  ) {}

  async execute(atendimentoId: string): Promise<void> {
    const atendimento = await this.repo.buscarPorId(atendimentoId);
    if (!atendimento) {
      throw new NotFoundException('Atendimento não encontrado');
    }

    // Reabrir o que ja esta aberto nao e inofensivo: quem clicou acha que
    // desfez alguma coisa. Dizer que nao havia o que desfazer e a resposta.
    if (!atendimento.fechadoEm) {
      throw new BadRequestException('Este atendimento já está aberto');
    }

    // ======================================================================
    // O BANCO SO PERMITE UM ABERTO POR CLIENTE — E ISSO PODE BARRAR AQUI.
    //
    // O indice `uq_atendimento_aberto_por_cliente` garante no maximo um. Se a
    // cliente voltou a falar depois do fechamento, ja existe um episodio novo
    // aberto para ela, e reabrir o antigo violaria o indice.
    //
    // Recusar com uma frase e melhor do que deixar estourar como 500: quem
    // esta olhando precisa entender que o historico dela seguiu adiante.
    // ======================================================================
    const aberto = await this.repo.buscarAbertoPorCliente(atendimento.clienteId);
    if (aberto) {
      throw new BadRequestException(
        'Esta cliente já tem um atendimento em curso. O que foi fechado ficou no histórico.',
      );
    }

    await this.repo.reabrir(atendimentoId);
    this.logger.log(`Atendimento ${atendimentoId} reaberto.`);
  }
}
