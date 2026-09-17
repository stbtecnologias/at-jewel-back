import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { IArmazenamento } from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
  INTERPRETADOR_AJUSTE,
  TRATAMENTO_IMAGEM,
} from '../../domain/ports/injection-tokens';
import type { IInterpretadorDeAjuste } from '../../domain/ports/interpretador-ajuste.port';
import type {
  CatalogoDetalhe,
  FinalItem,
  ICatalogoRepository,
} from '../../domain/ports/repositories/catalogo-repository.port';
import type {
  ITratamentoImagem,
  Orientacao,
} from '../../domain/ports/tratamento-imagem.port';
import {
  aplicarNoPlano,
  conferir,
  resumoDoPdf,
  traduzir,
  type AcaoComDescricao,
  type ContextoDoAjuste,
} from '../ajustes-do-catalogo';
import {
  chaveDoPlano,
  fotosDoPlano,
  nomeDaModelo,
  paginasDoPdf,
  type PlanoDaMontagem,
} from '../plano-da-montagem';
import {
  MontarCatalogoUseCase,
  ondeVai,
  type ImagensGeradas,
} from './montar-catalogo.use-case';
import { recusarSeAprovado } from './aprovar-catalogo.use-case';

export interface Interpretacao {
  /** A versão sobre a qual o pedido foi lido — é ela que `aplicar` recebe. */
  finalId: string;
  acoes: AcaoComDescricao[];
  naoEntendi: string[];
}

/** O que se carrega de uma versão montada para ajustá-la. */
interface Versao {
  catalogo: CatalogoDetalhe;
  final: FinalItem;
  plano: PlanoDaMontagem;
  ctx: ContextoDoAjuste;
}

/**
 * O AJUSTE DO CATÁLOGO MONTADO, PÁGINA POR PÁGINA — 16/09/2026.
 *
 * Nasceu da apresentação do PDF: "se a pessoa quiser falar 'na página 4
 * ajuste isso, na página 5 deixe assim', dá certo?". E o Lucas quis o ajuste
 * na tela do catálogo, junto do "Montar".
 *
 * EM DOIS PASSOS, E O SEGUNDO SÓ COM CONFIRMAÇÃO:
 *   1. `interpretar` lê o pedido contra a versão que a pessoa viu e devolve o
 *      que entendeu — nada é gerado nem gravado;
 *   2. `aplicar` recebe as ações que a pessoa confirmou, refaz só o que foi
 *      pedido e grava uma VERSÃO NOVA. A que ela viu continua lá.
 *
 * Geração é paga e lenta; mostrar antes o que vai ser feito é o que impede um
 * "tira o colar" mal entendido de virar uma versão errada.
 */
@Injectable()
export class AjustarCatalogoUseCase {
  private readonly logger = new Logger(AjustarCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(TRATAMENTO_IMAGEM)
    private readonly ia: ITratamentoImagem,
    @Inject(INTERPRETADOR_AJUSTE)
    private readonly interpretador: IInterpretadorDeAjuste,
    private readonly montar: MontarCatalogoUseCase,
  ) {}

  /** Passo 1: o que foi entendido do pedido. Não gera nem grava nada. */
  async interpretar(
    catalogoId: string,
    texto: string,
    finalId?: string,
  ): Promise<Interpretacao> {
    const v = await this.carregarVersao(catalogoId, finalId);

    if (!this.interpretador.disponivel()) {
      throw new ServiceUnavailableException(
        'A leitura do pedido não está configurada neste ambiente.',
      );
    }

    const resumo = resumoDoPdf(v.ctx, {
      nome: v.catalogo.nome,
      tema: v.catalogo.tema,
      frase: v.plano.direcao?.frase ?? null,
    });
    const bruto = await this.interpretador.interpretar(resumo, texto.trim());
    if (bruto === null) {
      throw new ServiceUnavailableException(
        'Não consegui ler o pedido agora. Tenta de novo em instantes.',
      );
    }

    return { finalId: v.final.id, ...traduzir(bruto, v.ctx) };
  }

  /**
   * Passo 2: aplica as ações confirmadas e grava uma versão nova.
   *
   * SE UMA GERAÇÃO FALHAR, NADA É GRAVADO. A pessoa pediu aquela mudança; uma
   * versão "quase" — com a capa nova e sem a modelo nova — pareceria pronta e
   * não seria o que ela confirmou.
   */
  async aplicar(
    catalogoId: string,
    finalId: string,
    brutas: unknown[],
  ): Promise<CatalogoDetalhe> {
    const v = await this.carregarVersao(catalogoId, finalId);

    const { acoes, erros } = conferir(brutas, v.ctx);
    if (erros.length > 0) throw new BadRequestException(erros.join(' '));
    if (acoes.length === 0) {
      throw new BadRequestException('Nenhum ajuste para aplicar.');
    }

    const { plano, gerar, removidas } = aplicarNoPlano(v.plano, acoes, v.ctx);

    // As imagens da versão que a pessoa viu — as que não forem refeitas
    // entram na versão nova como estão.
    const imagens: ImagensGeradas = new Map();
    for (const [nome, chave] of Object.entries(v.plano.arquivos)) {
      if (removidas.includes(nome)) continue;
      const lida = await this.armazenamento.ler(chave);
      if (lida) imagens.set(nome, lida);
    }

    const fotos = v.catalogo.fotos.filter((f) =>
      fotosDoPlano(plano).includes(f.id),
    );
    const pecas = await this.montar.carregarPecas(fotos);

    const direcao = plano.direcao;
    if (gerar.length > 0 && direcao) {
      const orientacao: Orientacao =
        v.catalogo.formato === '9:16' ? 'retrato' : 'paisagem';
      const cores = [
        direcao.paleta.fundo,
        direcao.paleta.destaque,
        direcao.paleta.texto,
      ];

      const resultados = await Promise.all(
        gerar.map(async (g) => {
          if (g.tipo === 'modelo') {
            const peca = pecas.find((p) => p.foto.id === g.fotoId);
            if (!peca) return false;
            const r = await this.ia.ambientar({
              peca: { conteudo: peca.imagem, mime: peca.mime },
              cena: direcao.cena,
              modelo: direcao.modelo,
              onde: ondeVai(peca.foto.descricao),
              orientacao: 'retrato',
              pedido: g.instrucao,
            });
            if (r) imagens.set(nomeDaModelo(g.fotoId), r);
            return Boolean(r);
          }
          const r = await this.ia.gerarArte({
            tipo: g.tipo,
            cena: direcao.cena,
            cores,
            orientacao,
            pedido: g.instrucao,
          });
          if (r) imagens.set(g.tipo, r);
          return Boolean(r);
        }),
      );

      if (resultados.some((ok) => !ok)) {
        throw new ServiceUnavailableException(
          'Não consegui gerar uma das imagens agora. Nada foi alterado — tenta de novo em instantes.',
        );
      }
    }

    this.logger.log(
      `Ajuste no catalogo ${v.catalogo.numero}: ${acoes.map((a) => a.tipo).join(', ')}.`,
    );
    return this.montar.montarDoPlano(v.catalogo, plano, pecas, imagens);
  }

  /**
   * A versão a ajustar, com o plano dela.
   *
   * Sem `finalId`, a mais nova montada pelo sistema — é a que a tela mostra.
   * Versão enviada pelo marketing não tem plano: foi montada fora.
   */
  private async carregarVersao(
    catalogoId: string,
    finalId?: string,
  ): Promise<Versao> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');
    recusarSeAprovado(catalogo);

    const final = finalId
      ? catalogo.finais.find((f) => f.id === finalId)
      : catalogo.finais.find((f) => f.origem === 'IA');
    if (!final) {
      throw new BadRequestException('Monte o catálogo antes de pedir ajustes.');
    }
    if (final.origem !== 'IA') {
      throw new BadRequestException(
        'Esta versão foi montada fora do sistema — não dá para ajustar por aqui.',
      );
    }

    const lido = await this.armazenamento.ler(chaveDoPlano(final.arquivoId));
    let plano: PlanoDaMontagem | null = null;
    try {
      plano = lido
        ? (JSON.parse(lido.conteudo.toString('utf8')) as PlanoDaMontagem)
        : null;
    } catch {
      plano = null;
    }
    if (!plano || plano.versao !== 1) {
      throw new BadRequestException(
        'Esta versão foi montada antes do ajuste por página. Monte de novo para poder ajustar.',
      );
    }

    // As peças que estão no PDF: aprovadas, com arquivo, e presentes no plano.
    const noPlano = new Set(fotosDoPlano(plano));
    const aprovadas = catalogo.fotos.filter(
      (f) => f.status === 'APROVADA' && f.arquivoId && noPlano.has(f.id),
    );
    const pecas = new Map(
      aprovadas.map((f) => [
        f.id,
        { codigo: f.codigoErp, descricao: f.descricao },
      ]),
    );

    const ctx: ContextoDoAjuste = {
      paginas: paginasDoPdf(
        plano,
        (id) => pecas.has(id),
        (nome) => nome in plano.arquivos,
      ),
      temTema: plano.direcao !== null,
      pecas,
    };

    return { catalogo, final, plano, ctx };
  }
}
