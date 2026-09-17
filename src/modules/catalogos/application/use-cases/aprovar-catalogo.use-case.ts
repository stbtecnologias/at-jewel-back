import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { IArmazenamento } from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type {
  CatalogoDetalhe,
  FinalItem,
  ICatalogoRepository,
} from '../../domain/ports/repositories/catalogo-repository.port';
import {
  chaveDoPlano,
  fotosDoPlano,
  type PlanoDaMontagem,
} from '../plano-da-montagem';

/**
 * A TRAVA DO CATÁLOGO APROVADO.
 *
 * Montar, ajustar e enviar criam versão nova — e a aprovada deixaria de ser a
 * atual sem ninguém ter decidido isso. Quem chama é cada um desses casos de
 * uso, no começo; a tela esconde os botões, mas a tela pode ser contornada.
 */
export function recusarSeAprovado(catalogo: CatalogoDetalhe): void {
  if (catalogo.status === 'PUBLICADO') {
    throw new BadRequestException(
      'Catálogo aprovado — desfaça a aprovação para montar, ajustar ou enviar outra versão.',
    );
  }
}

/**
 * APROVAR O CATÁLOGO — 17/09/2026.
 *
 * Pedido do Lucas: um botão "Aprovar catálogo", e a capa da versão aprovada
 * passa a ser a capa do card e do cabeçalho. Decisões dele, no mesmo dia:
 *
 *   - aprova-se SÓ a versão atual (a mais recente);
 *   - aprovado vira PUBLICADO e trava montar, ajustar e enviar; desfazer volta
 *     a COLETANDO;
 *   - a capa é a ARTE da capa do PDF, sem o título (`.capa.jpg` do plano);
 *   - sem arte (catálogo sem tema, ou PDF do marketing), a foto da primeira
 *     peça.
 *
 * Ver a migração 59.
 */
@Injectable()
export class AprovarCatalogoUseCase {
  private readonly logger = new Logger(AprovarCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * @param finalId a versão que a pessoa estava vendo. Se já não é a atual
   *   (alguém montou de novo noutra aba), recusa: aprovar o que não se viu é
   *   exatamente o erro que a aprovação existe para evitar.
   */
  async aprovar(
    catalogoId: string,
    finalId: string,
    quem: { userId: string | null; email: string | null },
  ): Promise<CatalogoDetalhe> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    if (catalogo.status === 'PUBLICADO') {
      throw new BadRequestException('Este catálogo já está aprovado.');
    }

    const atual = catalogo.finais[0];
    if (!atual) {
      throw new BadRequestException(
        'Monte ou envie o catálogo antes de aprovar.',
      );
    }
    if (atual.id !== finalId) {
      throw new ConflictException(
        'Há uma versão mais nova do que a que você viu. Recarregue a página e confira antes de aprovar.',
      );
    }

    // O nome cadastrado, senão o e-mail do token — mesmo caminho de quem criou.
    const nome = quem.userId
      ? await this.repositorio.buscarNomeUsuario(quem.userId)
      : null;

    return this.repositorio.registrarAprovacao(catalogoId, {
      finalId,
      capaArquivoId: await this.capaDaVersao(catalogo, atual),
      aprovadoPor: nome?.trim() || quem.email?.trim() || 'Equipe',
    });
  }

  async desfazer(catalogoId: string): Promise<CatalogoDetalhe> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');
    if (catalogo.status !== 'PUBLICADO') {
      throw new BadRequestException('Este catálogo não está aprovado.');
    }
    return this.repositorio.registrarAprovacao(catalogoId, null);
  }

  /**
   * A imagem que vira capa: a arte do plano; senão a primeira peça DO PDF
   * (o plano sabe quais ficaram, depois de um "tira o colar"); senão a
   * primeira peça aprovada. `null` só sem peça nenhuma.
   *
   * PLANO ILEGÍVEL NÃO IMPEDE APROVAR: a aprovação é decisão de gente, e a
   * capa é conveniência. Cai na primeira peça, e fica o aviso no log.
   */
  private async capaDaVersao(
    catalogo: CatalogoDetalhe,
    versao: FinalItem,
  ): Promise<string | null> {
    const aprovadas = catalogo.fotos.filter(
      (f) => f.status === 'APROVADA' && f.arquivoId,
    );
    let ordem = aprovadas;

    if (versao.origem === 'IA') {
      const plano = await this.lerPlano(versao);
      if (plano?.arquivos.capa) return plano.arquivos.capa;
      if (plano) {
        const noPdf = fotosDoPlano(plano);
        ordem = noPdf
          .map((id) => aprovadas.find((f) => f.id === id))
          .filter((f): f is (typeof aprovadas)[number] => Boolean(f));
      }
    }

    return (ordem[0] ?? aprovadas[0])?.arquivoId ?? null;
  }

  private async lerPlano(versao: FinalItem): Promise<PlanoDaMontagem | null> {
    try {
      const lido = await this.armazenamento.ler(chaveDoPlano(versao.arquivoId));
      return lido
        ? (JSON.parse(lido.conteudo.toString('utf8')) as PlanoDaMontagem)
        : null;
    } catch (e) {
      this.logger.warn(
        `Plano da versao ${versao.id} ilegivel — capa cai na primeira peca: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
