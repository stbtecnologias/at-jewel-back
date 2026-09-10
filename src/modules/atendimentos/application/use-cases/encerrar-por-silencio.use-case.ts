import { Inject, Injectable, Logger } from '@nestjs/common';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';

/**
 * O silencio que encerra.
 *
 * As mesmas 48 horas do `HORAS_RETOMADA` no canal pessoal, e de proposito: e a
 * mesma pergunta — "faz tempo demais que ninguem fala" — respondida com o
 * mesmo prazo nos dois canais.
 */
const HORAS_DE_SILENCIO = 48;

/** Teto por rodada. Uma varredura nao deve fechar a base inteira de uma vez. */
const LOTE = 50;

/**
 * Da baixa nos atendimentos que morreram no silencio do numero corporativo —
 * MEL-15.
 *
 * ==========================================================================
 * A REGRA, NAS PALAVRAS DO LUCAS (08/09/2026):
 *
 *   "Se as mensagens pararam ha 2 dias e nao tem nenhum motivo na conversa
 *    dizendo que retorna depois... vai ver em outro canto, ou simplesmente nao
 *    quer. Pode dar baixa. Se ele voltar a conversar do nada, acredito que
 *    seja outro atendimento."
 *
 * A ultima frase ja funciona sozinha e nao precisou de codigo: quando a
 * mensagem chega, `RegistrarContatoWhatsappUseCase` procura um atendimento
 * ABERTO. Nao achando, abre um novo.
 * ==========================================================================
 *
 * ISTO NAO USA IA. A parte que exige leitura e distinguir "ela disse que
 * volta" dentro do texto da conversa; o que da para ver sem ler e se existe
 * COMPROMISSO MARCADO, e isso o `listarSilenciosos` ja filtra. Quando o leitor
 * existir, ele cobre o resto — sem mudar esta regra.
 *
 * UMA VOLTA SO, e nao varias como no canal pessoal. La cada retomada e uma
 * PERGUNTA a vendedora, e vale insistir. Aqui e so olhar: se ninguem falou,
 * olhar de novo daqui a dois dias nao descobre nada novo.
 */
@Injectable()
export class EncerrarPorSilencioUseCase {
  private readonly logger = new Logger(EncerrarPorSilencioUseCase.name);

  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly repo: IAtendimentoRepository,
  ) {}

  async execute(): Promise<{ encerrados: number }> {
    const ids = await this.repo.listarSilenciosos(HORAS_DE_SILENCIO, LOTE);
    if (ids.length === 0) return { encerrados: 0 };

    let encerrados = 0;
    for (const id of ids) {
      try {
        await this.repo.fechar(id, 'INATIVIDADE');
        encerrados += 1;
      } catch (err) {
        // Um que falha nao leva os outros junto: a rodada seguinte tenta de
        // novo, porque ele continua aparecendo na consulta.
        this.logger.error(
          `Falha ao encerrar ${id} por silêncio: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Log com contagem e nao com ids: a linha serve para notar volume estranho
    // ("encerrou 50 de uma vez") sem despejar a base no arquivo.
    this.logger.log(
      `${encerrados} atendimento(s) encerrado(s) por ${HORAS_DE_SILENCIO}h de silêncio no corporativo.`,
    );
    return { encerrados };
  }
}
