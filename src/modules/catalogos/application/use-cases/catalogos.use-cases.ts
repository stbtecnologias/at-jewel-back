import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  FormatoCatalogo,
  StatusCatalogo,
  StatusFoto,
  TipoReferencia,
} from '../../domain/entities/enums';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  PASTA_REFERENCIAS,
  pastaDoCatalogo,
  type IArmazenamento,
} from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type {
  CatalogoDetalhe,
  FiltroCatalogo,
  FotoItem,
  ICatalogoRepository,
  ListaCatalogos,
  ReferenciaItem,
} from '../../domain/ports/repositories/catalogo-repository.port';

// ---------------------------------------------------------------------------
// Casos de uso do catalogo.
//
// Reunidos num arquivo so, ao contrario das demandas: aqui sao operacoes de
// CRUD curtas sobre um agregado unico, e cada uma caberia em oito linhas. Um
// arquivo por caso de uso daria seis arquivos de cabecalho e pouco corpo.
// Quando a geracao por IA entrar (rodada 3), ela nasce em arquivo proprio —
// ali ha regra de verdade.
// ---------------------------------------------------------------------------

@Injectable()
export class ListarCatalogosUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  execute(filtro: FiltroCatalogo): Promise<ListaCatalogos> {
    return this.repositorio.listar(filtro);
  }
}

@Injectable()
export class BuscarCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  /**
   * Aceita o UUID ou o NUMERO visivel ('0042'). A tela navega por numero — e o
   * que a pessoa ve e digita — e o UUID continua valendo para chamada interna.
   */
  async execute(idOuNumero: string): Promise<CatalogoDetalhe> {
    const ehUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOuNumero,
      );

    const encontrado = ehUuid
      ? await this.repositorio.buscarPorId(idOuNumero)
      : await this.repositorio.buscarPorNumero(idOuNumero);

    if (!encontrado) throw new NotFoundException('Catálogo não encontrado');
    return encontrado;
  }
}

export interface CriarCatalogoInput {
  nome: string;
  tema?: string | null;
  formato?: FormatoCatalogo;
  criadoPorUserId: string | null;
  /**
   * Rótulo usado quando a pessoa não tem nome cadastrado — na prática, o e-mail
   * do token. O nome cadastrado tem prioridade.
   */
  criadoPorNomeFallback?: string | null;
}

@Injectable()
export class CriarCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  /**
   * O catalogo nasce em RASCUNHO e vazio — so nome e, logo depois, as
   * referencias. Nascer ja em COLETANDO o colocaria na lista que a agente
   * oferece no WhatsApp antes de existir referencia nenhuma, e a primeira foto
   * seria gerada sem padrao algum.
   */
  async execute(input: CriarCatalogoInput): Promise<CatalogoDetalhe> {
    // O JWT só carrega `sub` e e-mail. O nome cadastrado é buscado aqui para a
    // tela mostrar "Faby" e não "faby@…"; o e-mail fica de reserva, e o rótulo
    // genérico existe para nunca violar o NOT NULL de `criado_por_nome`.
    const nomeCadastrado = input.criadoPorUserId
      ? await this.repositorio.buscarNomeUsuario(input.criadoPorUserId)
      : null;

    return this.repositorio.criar({
      nome: input.nome,
      tema: input.tema ?? null,
      formato: input.formato ?? '9:16',
      criadoPorUserId: input.criadoPorUserId,
      criadoPorNome:
        nomeCadastrado?.trim() ||
        input.criadoPorNomeFallback?.trim() ||
        'Equipe',
    });
  }
}

export interface AtualizarCatalogoInput {
  nome?: string;
  tema?: string | null;
  formato?: FormatoCatalogo;
  status?: StatusCatalogo;
}

@Injectable()
export class AtualizarCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  async execute(
    id: string,
    input: AtualizarCatalogoInput,
  ): Promise<CatalogoDetalhe> {
    // Liberar para COLETANDO significa entrar na lista que a agente oferece no
    // WhatsApp. Sem referencia, a IA nao tem o que seguir — e a foto volta
    // tratada em qualquer estilo. Barrado aqui, e nao na tela: a tela pode ser
    // contornada, o caso de uso nao.
    if (input.status === 'COLETANDO') {
      const atual = await this.repositorio.buscarPorId(id);
      if (!atual) throw new NotFoundException('Catálogo não encontrado');
      if (atual.referencias.length === 0) {
        throw new BadRequestException(
          'Cadastre ao menos uma referência antes de liberar o catálogo para receber fotos',
        );
      }
    }

    return this.repositorio.atualizar(id, input);
  }
}

@Injectable()
export class RemoverCatalogoUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * O ON DELETE CASCADE limpa as LINHAS; os arquivos ficariam orfaos no disco.
   * Por isso as chaves sao coletadas antes e apagadas depois — nesta ordem: se
   * o delete falhar, nao apagamos arquivo de um catalogo que continua de pe.
   */
  async execute(id: string): Promise<void> {
    const catalogo = await this.repositorio.buscarPorId(id);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    const chaves = [
      ...catalogo.referencias.map((r) => r.arquivoId),
      ...catalogo.fotos.map((f) => f.arquivoId),
      catalogo.finalArquivoId,
    ].filter((c): c is string => Boolean(c));

    await this.repositorio.remover(id);
    await Promise.all(chaves.map((c) => this.armazenamento.remover(c)));
  }
}

export interface ArquivoRecebido {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class AnexarReferenciaUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /** Referencia de texto: fonte, composicao ou observacao livre. */
  async texto(
    catalogoId: string,
    tipo: TipoReferencia,
    valor: string,
  ): Promise<ReferenciaItem> {
    if (tipo === 'IMAGEM') {
      throw new BadRequestException(
        'Referência de imagem exige upload de arquivo',
      );
    }
    await this.exigirCatalogo(catalogoId);
    return this.repositorio.criarReferencia({ catalogoId, tipo, valor });
  }

  /** Referencia de imagem: pagina de um catalogo anterior, editorial, capa. */
  async imagens(
    catalogoId: string,
    arquivos: ArquivoRecebido[],
  ): Promise<ReferenciaItem[]> {
    if (arquivos.length === 0)
      throw new BadRequestException('Nenhum arquivo enviado');
    const catalogo = await this.exigirCatalogo(catalogoId);

    const criadas: ReferenciaItem[] = [];
    // Em serie, e nao em paralelo: a ordem das referencias e a ordem em que
    // foram enviadas, e `criarReferencia` calcula MAX(ordem)+1.
    for (const arquivo of arquivos) {
      this.validar(arquivo);
      const chave = await this.armazenamento.guardar(
        {
          conteudo: arquivo.buffer,
          mime: arquivo.mimetype,
          nomeOriginal: arquivo.originalname,
        },
        pastaDoCatalogo(catalogo.numero, PASTA_REFERENCIAS),
      );
      criadas.push(
        await this.repositorio.criarReferencia({
          catalogoId,
          tipo: 'IMAGEM',
          valor: arquivo.originalname,
          arquivoId: chave,
          mime: arquivo.mimetype,
        }),
      );
    }
    return criadas;
  }

  private validar(arquivo: ArquivoRecebido): void {
    if (
      !MIMES_IMAGEM.includes(arquivo.mimetype as (typeof MIMES_IMAGEM)[number])
    ) {
      throw new BadRequestException(
        `Formato não aceito (${arquivo.mimetype}). Envie JPEG, PNG ou WebP.`,
      );
    }
    if (arquivo.size > LIMITE_BYTES) {
      throw new BadRequestException(
        `Arquivo acima de ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB`,
      );
    }
  }

  /**
   * Devolve o catalogo em vez de so validar: o NUMERO dele entra na chave do
   * arquivo (`catalogo/0331/referencias/...`), e ja o tinhamos em maos aqui.
   */
  private async exigirCatalogo(id: string) {
    const existe = await this.repositorio.buscarPorId(id);
    if (!existe) throw new NotFoundException('Catálogo não encontrado');
    return existe;
  }
}

@Injectable()
export class RemoverReferenciaUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  async execute(catalogoId: string, referenciaId: string): Promise<void> {
    const chave = await this.repositorio.removerReferencia(
      catalogoId,
      referenciaId,
    );
    if (chave) await this.armazenamento.remover(chave);
  }
}

/**
 * A CURADORIA DA FOTO — e por que ela nao e "aprovar de novo".
 *
 * ==========================================================================
 * SAO DUAS DECISOES, DE DUAS PESSOAS, EM DOIS LUGARES.
 *
 *   a foto ficou boa?       -> quem fotografou, na conversa do WhatsApp
 *   esta peca entra AGORA?  -> quem monta o catalogo, nesta tela
 *
 * A primeira e sobre a IMAGEM: enquadramento, luz, se a peca certa foi
 * fotografada. Quem julga e quem estava com a peca na mao, e por isso a
 * aprovacao mora na conversa — la ela esta olhando a imagem que acabou de
 * chegar. ESTA TELA NAO APROVA, deliberadamente.
 *
 * A segunda e COMERCIAL: a peca pode estar bem fotografada e mesmo assim nao
 * entrar nesta campanha. Tirar do catalogo nao diz nada sobre a foto.
 * ==========================================================================
 *
 * E TIRAR NAO APAGA. A linha continua na tabela e o arquivo continua no
 * armazenamento — REPROVADA e exatamente o que a migracao 42 descreve, "fica
 * no historico, fora do catalogo". Decidindo depois que a peca entra,
 * `devolver` a traz de volta sem ninguem fotografar de novo.
 */
@Injectable()
export class CurarFotoUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  /** Tira a peca desta edicao do catalogo. Reversivel por `devolver`. */
  async tirar(catalogoId: string, fotoId: string): Promise<FotoItem> {
    const foto = await this.exigirFoto(catalogoId, fotoId);
    if (foto.status === 'REPROVADA') return foto;
    return this.repositorio.atualizarFoto(fotoId, { status: 'REPROVADA' });
  }

  /**
   * Traz de volta ao catalogo.
   *
   * O ESTADO ANTERIOR E DEDUZIDO, e nao guardado. Uma coluna `status_anterior`
   * seria um segundo lugar para a verdade morar, e desincronizaria na primeira
   * vez que o status mudasse por outro caminho. Os carimbos que ja existem
   * contam a historia inteira:
   *
   *   tem `aprovadoEm`             -> alguem ja disse que a foto ficou boa
   *   a tratada difere da original -> a IA rodou, faltava o sim
   *   nenhum dos dois              -> chegou e parou ali
   */
  async devolver(catalogoId: string, fotoId: string): Promise<FotoItem> {
    const foto = await this.exigirFoto(catalogoId, fotoId);
    if (foto.status !== 'REPROVADA') return foto;

    const status: StatusFoto = foto.aprovadoEm
      ? 'APROVADA'
      : foto.arquivoId && foto.arquivoId !== foto.arquivoOriginalId
        ? 'EM_APROVACAO'
        : 'RECEBIDA';

    return this.repositorio.atualizarFoto(fotoId, { status });
  }

  /**
   * A foto tem de ser DESTE catalogo. Sem a conferencia, o id da rota seria
   * decorativo: um fotoId valido de outra colecao passaria.
   */
  private async exigirFoto(
    catalogoId: string,
    fotoId: string,
  ): Promise<FotoItem> {
    const foto = await this.repositorio.buscarFotoPorId(fotoId);
    if (!foto || foto.catalogoId !== catalogoId) {
      throw new NotFoundException('Foto não encontrada neste catálogo');
    }
    return foto;
  }
}
