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
  LIMITE_PDF_BYTES,
  MIMES_REFERENCIA,
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
    // PUBLICADO TEM PORTA PRÓPRIA — a aprovação (migração 59). Pelo PATCH, o
    // status mudaria sem versão aprovada nem capa; e sair de PUBLICADO por aqui
    // deixaria a aprovação gravada num catálogo que já não está aprovado.
    if (input.status !== undefined) {
      if (input.status === 'PUBLICADO') {
        throw new BadRequestException(
          'Para publicar, use "Aprovar catálogo" na versão atual.',
        );
      }
      const atual = await this.repositorio.buscarPorId(id);
      if (atual?.status === 'PUBLICADO') {
        throw new BadRequestException(
          'Catálogo aprovado — desfaça a aprovação antes de mudar o status.',
        );
      }
    }

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

    // VALIDA TODOS ANTES DE GRAVAR QUALQUER UM.
    //
    // Validar dentro do laco parecia igual e nao era: com cinco arquivos e o
    // quarto recusado, tres ja tinham sido gravados e a pessoa recebia um erro
    // com metade do trabalho feito — sem saber qual metade. Aconteceu em
    // 04/09/2026 na criacao de catalogo, e o efeito foi pior ainda porque o
    // front so mandava as referencias de TEXTO depois destas: uma recusa aqui
    // levava junto o que a pessoa tinha digitado.
    //
    // Duas passadas custam nada — a lista tem no maximo 20 itens em memoria.
    for (const arquivo of arquivos) this.validar(arquivo);

    const criadas: ReferenciaItem[] = [];
    // Em serie, e nao em paralelo: a ordem das referencias e a ordem em que
    // foram enviadas, e `criarReferencia` calcula MAX(ordem)+1.
    for (const arquivo of arquivos) {
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
      !MIMES_REFERENCIA.includes(
        arquivo.mimetype as (typeof MIMES_REFERENCIA)[number],
      )
    ) {
      throw new BadRequestException(
        `"${arquivo.originalname}" não é um formato aceito (${arquivo.mimetype}). Envie JPEG, PNG, WebP ou PDF.`,
      );
    }
    // O TETO DEPENDE DO TIPO. PDF de catalogo fechado nao cabe no limite
    // pensado para foto de celular — ver `LIMITE_PDF_BYTES`.
    const teto =
      arquivo.mimetype === 'application/pdf' ? LIMITE_PDF_BYTES : LIMITE_BYTES;
    if (arquivo.size > teto) {
      throw new BadRequestException(
        `"${arquivo.originalname}" tem ${Math.round(arquivo.size / 1024 / 1024)} MB — o limite é ${Math.round(teto / 1024 / 1024)} MB.`,
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

/**
 * Escolher a capa entre as referencias que ja foram anexadas.
 *
 * NAO E UPLOAD: a capa e sempre uma imagem que ja esta no catalogo. Foi o que
 * o Lucas pediu em 04/09/2026 — "a pessoa poderia escolher uma capa das
 * referencias que enviou".
 */
@Injectable()
export class DefinirCapaUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  async execute(
    catalogoId: string,
    referenciaId: string | null,
  ): Promise<CatalogoDetalhe> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    // `null` volta ao automatico — a primeira imagem. Sai antes das checagens
    // porque nao ha o que checar.
    if (referenciaId === null) {
      return this.repositorio.definirCapa(catalogoId, null);
    }

    // A REFERENCIA PRECISA SER DESTE CATALOGO. Sem isto, um id valido de outra
    // colecao seria aceito, e o card passaria a mostrar a imagem dela — o
    // banco nao impede, porque a chave estrangeira so exige que a referencia
    // exista.
    const referencia = catalogo.referencias.find((r) => r.id === referenciaId);
    if (!referencia) {
      throw new BadRequestException(
        'Essa referência não pertence a este catálogo',
      );
    }

    if (!referencia.arquivoId || (referencia.mime ?? '').includes('pdf')) {
      throw new BadRequestException(
        'A capa precisa ser uma imagem — texto e PDF não servem',
      );
    }

    return this.repositorio.definirCapa(catalogoId, referenciaId);
  }
}

/** Limite da nota. Frase curta, nao briefing — o briefing e a referencia de texto. */
const MAX_OBSERVACAO = 500;

/**
 * A observacao DE UM arquivo — "desta aqui, quero o fundo branco".
 *
 * NAO VAI PARA A IA, e isso e deliberado: nenhuma referencia visual vai (ver o
 * `tratar-foto.use-case.ts`). A nota existe para quem monta o catalogo, e por
 * isso acompanha o arquivo na exportacao.
 */
@Injectable()
export class AnotarReferenciaUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  async execute(
    catalogoId: string,
    referenciaId: string,
    observacao: string | null,
  ): Promise<ReferenciaItem> {
    const limpo = observacao?.trim() ?? '';
    if (limpo.length > MAX_OBSERVACAO) {
      throw new BadRequestException(
        `A observação passa de ${MAX_OBSERVACAO} caracteres`,
      );
    }

    // VAZIO VIRA NULL, e nao string vazia: as duas coisas significam "sem
    // observacao", e guardar as duas faria a tela ter que tratar os dois casos
    // para sempre.
    const anotada = await this.repositorio.anotarReferencia(
      catalogoId,
      referenciaId,
      limpo || null,
    );
    if (!anotada) throw new NotFoundException('Referência não encontrada');
    return anotada;
  }
}

/** Teto de parcelas. Acima disso e erro de digitacao, nao condicao de venda. */
const MAX_PARCELAS = 24;
/** Teto de juro. 300% e absurdo; serve so para barrar o dedo escorregando. */
const MAX_JUROS = 300;

/**
 * CORRIGIR O PARCELAMENTO DE UMA PECA JA NO CATALOGO.
 *
 * Ate 04/09/2026 parcelas e juro entravam SO pela legenda do WhatsApp. Digitar
 * `12x` quando era `10x` nao tinha conserto: a saida era tirar a peca do
 * catalogo e mandar a foto de novo, gastando uma geracao de imagem para
 * arrumar um numero.
 *
 * Isso pesa mais desde que se sabe que o leitor de legenda erra: uma peca em
 * sete tem o codigo mal reconhecido, e a legenda inteira e reinterpretada a
 * partir dai.
 *
 * O PRECO A VISTA NAO ENTRA AQUI, de proposito: ele vem do ERP e e a unica
 * coisa nesta tela com dono de fora. Deixar edita-lo criaria uma segunda
 * verdade que a proxima sincronizacao nao saberia resolver.
 */
@Injectable()
export class CorrigirParcelamentoUseCase {
  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
  ) {}

  async execute(
    catalogoId: string,
    fotoId: string,
    dados: { parcelas?: number | null; jurosPercentual?: number | null },
  ): Promise<FotoItem> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    // A FOTO PRECISA SER DESTE CATALOGO. `atualizarFoto` grava por id e nao
    // olha a colecao — sem esta checagem, um id valido de outro catalogo seria
    // aceito e o preco mudaria na coleccao errada.
    const foto = catalogo.fotos.find((f) => f.id === fotoId);
    if (!foto)
      throw new NotFoundException('Foto não encontrada neste catálogo');

    if (dados.parcelas !== undefined && dados.parcelas !== null) {
      if (!Number.isInteger(dados.parcelas) || dados.parcelas < 1) {
        throw new BadRequestException(
          'Parcelas precisa ser um número inteiro a partir de 1',
        );
      }
      if (dados.parcelas > MAX_PARCELAS) {
        throw new BadRequestException(`No máximo ${MAX_PARCELAS} parcelas`);
      }
    }

    if (dados.jurosPercentual !== undefined && dados.jurosPercentual !== null) {
      if (dados.jurosPercentual < 0 || dados.jurosPercentual > MAX_JUROS) {
        throw new BadRequestException(
          `O juro precisa ficar entre 0 e ${MAX_JUROS}%`,
        );
      }
    }

    // `null` no juro NAO e a mesma coisa que 0 no registro, ainda que a conta
    // de o mesmo numero: um e "ninguem informou", o outro e "foi conferido e
    // nao tem". Por isso os dois chegam ate aqui sem serem confundidos.
    return this.repositorio.atualizarFoto(fotoId, {
      ...(dados.parcelas !== undefined ? { parcelas: dados.parcelas } : {}),
      ...(dados.jurosPercentual !== undefined
        ? { jurosPercentual: dados.jurosPercentual }
        : {}),
    });
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
