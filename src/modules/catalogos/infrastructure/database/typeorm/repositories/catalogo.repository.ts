import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import type {
  AtualizarCatalogoData,
  AtualizarFotoData,
  CatalogoAberto,
  CatalogoDetalhe,
  CatalogoItem,
  CriarCatalogoData,
  CriarFotoData,
  CriarReferenciaData,
  FiltroCatalogo,
  FotoItem,
  ICatalogoRepository,
  ListaCatalogos,
  ReferenciaItem,
} from '../../../../domain/ports/repositories/catalogo-repository.port';
import { CatalogoFotoOrmEntity } from '../entities/catalogo-foto.orm-entity';
import { CatalogoReferenciaOrmEntity } from '../entities/catalogo-referencia.orm-entity';
import { CatalogoOrmEntity } from '../entities/catalogo.orm-entity';

@Injectable()
export class CatalogoRepository implements ICatalogoRepository {
  constructor(
    @InjectRepository(CatalogoOrmEntity)
    private readonly repo: Repository<CatalogoOrmEntity>,
    @InjectRepository(CatalogoReferenciaOrmEntity)
    private readonly repoReferencias: Repository<CatalogoReferenciaOrmEntity>,
    @InjectRepository(CatalogoFotoOrmEntity)
    private readonly repoFotos: Repository<CatalogoFotoOrmEntity>,
  ) {}

  async criar(dados: CriarCatalogoData): Promise<CatalogoDetalhe> {
    const criado = await this.repo.save(
      this.repo.create({
        nome: dados.nome,
        tema: dados.tema,
        formato: dados.formato,
        status: 'RASCUNHO',
        criadoPorUserId: dados.criadoPorUserId,
        criadoPorNome: dados.criadoPorNome,
      }),
    );

    // Releitura obrigatoria: `numero` vem do DEFAULT da coluna (sequence), e
    // por isso nao volta no objeto do save.
    const detalhe = await this.buscarPorId(criado.id);
    if (!detalhe)
      throw new NotFoundException('Catálogo não encontrado após criação');
    return detalhe;
  }

  async listar(filtro: FiltroCatalogo): Promise<ListaCatalogos> {
    const qb = this.repo.createQueryBuilder('c');

    if (filtro.status) {
      qb.andWhere('c.status = :status', { status: filtro.status });
    }

    if (filtro.busca?.trim()) {
      const termo = `%${filtro.busca.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(c.nome) LIKE :termo', { termo })
            .orWhere("LOWER(COALESCE(c.tema, '')) LIKE :termo", { termo })
            .orWhere('c.numero LIKE :termo', { termo });
        }),
      );
    }

    const [linhas, total] = await qb
      .orderBy('c.created_at', 'DESC')
      .take(filtro.limit)
      .skip(filtro.offset)
      .getManyAndCount();

    // Contagem numa consulta separada, e nao por JOIN + GROUP BY: com o join, o
    // `take` limitaria LINHAS e nao catalogos, e uma colecao de 30 fotos comeria
    // a pagina inteira sozinha.
    const contagem = await this.contarFotos(linhas.map((l) => l.id));

    return {
      itens: linhas.map((l) => this.paraItem(l, contagem.get(l.id) ?? 0)),
      total,
    };
  }

  private async contarFotos(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();

    const linhas = await this.repoFotos
      .createQueryBuilder('f')
      .select('f.catalogo_id', 'catalogoId')
      .addSelect('COUNT(*)', 'total')
      .where('f.catalogo_id IN (:...ids)', { ids })
      .groupBy('f.catalogo_id')
      .getRawMany<{ catalogoId: string; total: string }>();

    return new Map(linhas.map((l) => [l.catalogoId, Number(l.total)]));
  }

  async buscarPorId(id: string): Promise<CatalogoDetalhe | null> {
    const linha = await this.repo.findOne({ where: { id } });
    return linha ? this.montarDetalhe(linha) : null;
  }

  async buscarPorNumero(numero: string): Promise<CatalogoDetalhe | null> {
    const linha = await this.repo.findOne({ where: { numero } });
    return linha ? this.montarDetalhe(linha) : null;
  }

  async atualizar(
    id: string,
    dados: AtualizarCatalogoData,
  ): Promise<CatalogoDetalhe> {
    const linha = await this.repo.findOne({ where: { id } });
    if (!linha) throw new NotFoundException('Catálogo não encontrado');

    // Atribuicao campo a campo, e nao spread: `undefined` no spread apagaria
    // um valor existente ao serializar para o UPDATE.
    if (dados.nome !== undefined) linha.nome = dados.nome;
    if (dados.tema !== undefined) linha.tema = dados.tema;
    if (dados.formato !== undefined) linha.formato = dados.formato;
    if (dados.status !== undefined) linha.status = dados.status;

    await this.repo.save(linha);
    const detalhe = await this.buscarPorId(id);
    if (!detalhe) throw new NotFoundException('Catálogo não encontrado');
    return detalhe;
  }

  async remover(id: string): Promise<void> {
    const resultado = await this.repo.delete({ id });
    if (!resultado.affected)
      throw new NotFoundException('Catálogo não encontrado');
  }

  async listarAbertos(): Promise<CatalogoAberto[]> {
    const linhas = await this.repo.find({
      where: { status: 'COLETANDO' },
      order: { createdAt: 'DESC' },
    });
    return linhas.map((l) => ({ id: l.id, numero: l.numero, nome: l.nome }));
  }

  async criarFoto(dados: CriarFotoData): Promise<FotoItem> {
    // Posicao e o fim da fila. Diferente das referencias, aqui HA concorrencia
    // — duas fotos podem chegar do WhatsApp no mesmo segundo. Empate em
    // `posicao` nao quebra nada: a ordenacao so fica arbitraria entre as duas,
    // e quem monta o catalogo reordena. Serializar por causa disso custaria
    // mais do que o problema vale.
    const linha = await this.repoFotos
      .createQueryBuilder('f')
      .select('COALESCE(MAX(f.posicao), 0)', 'max')
      .where('f.catalogo_id = :id', { id: dados.catalogoId })
      .getRawOne<{ max: string }>();

    const criada = await this.repoFotos.save(
      this.repoFotos.create({
        catalogoId: dados.catalogoId,
        posicao: Number(linha?.max ?? 0) + 1,
        codigoErp: dados.codigoErp,
        descricao: dados.descricao,
        precoAVista:
          dados.precoAVista === null ? null : String(dados.precoAVista),
        parcelas: dados.parcelas,
        origem: dados.origem,
        remetente: dados.remetente,
        arquivoOriginalId: dados.arquivoOriginalId,
        arquivoId: dados.arquivoId,
        mime: dados.mime,
        status: dados.status,
        // ZERO, e nao um: `versoes` conta GERACOES DA IA, e nada que passa por
        // aqui foi tratado ainda — venha do WhatsApp ou de upload.
        //
        // Nasceu em 1 e custou duas coisas: o selo da tela dizia "2 geracoes"
        // depois de uma so, e o teto de `MAX_GERACOES = 3` batia na SEGUNDA
        // tentativa (1 + 1 + 1 = 3), entregando duas das tres.
        versoes: 0,
      }),
    );

    return this.paraFoto(criada);
  }

  async atualizarFoto(id: string, dados: AtualizarFotoData): Promise<FotoItem> {
    const linha = await this.repoFotos.findOne({ where: { id } });
    if (!linha) throw new NotFoundException('Foto não encontrada');

    // `undefined` nao mexe; `null` grava null. A distincao importa em
    // `aprovadoPor`: reprovar precisa LIMPAR a aprovacao anterior, e um
    // `if (dados.aprovadoPor)` engoliria isso.
    if (dados.arquivoId !== undefined) linha.arquivoId = dados.arquivoId;
    if (dados.mime !== undefined) linha.mime = dados.mime;
    if (dados.status !== undefined) linha.status = dados.status;
    if (dados.versoes !== undefined) linha.versoes = dados.versoes;
    if (dados.aprovadoPor !== undefined) linha.aprovadoPor = dados.aprovadoPor;
    if (dados.aprovadoEm !== undefined) linha.aprovadoEm = dados.aprovadoEm;

    return this.paraFoto(await this.repoFotos.save(linha));
  }

  async buscarFotoPorId(id: string): Promise<FotoItem | null> {
    const linha = await this.repoFotos.findOne({ where: { id } });
    return linha ? this.paraFoto(linha) : null;
  }

  async listarEmAprovacao(remetente: string): Promise<FotoItem[]> {
    // Remetente vazio nao filtra nada: seria "todas as fotos sem dono", e um
    // "aprovo" carimbaria a fila alheia. Melhor devolver nada.
    if (!remetente.trim()) return [];

    const linhas = await this.repoFotos.find({
      where: { status: 'EM_APROVACAO', remetente },
      order: { updatedAt: 'ASC' },
    });
    return linhas.map((l) => this.paraFoto(l));
  }

  async buscarNomeUsuario(userId: string): Promise<string | null> {
    const linhas = await this.repo.manager.query<{ nome: string | null }[]>(
      `SELECT nome FROM admin_users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return linhas[0]?.nome ?? null;
  }

  async criarReferencia(dados: CriarReferenciaData): Promise<ReferenciaItem> {
    // A ordem e o fim da fila. MAX+1 basta: referencia entra por acao humana
    // numa tela, nao por concorrencia de webhook.
    const { max } = (await this.repoReferencias
      .createQueryBuilder('r')
      .select('COALESCE(MAX(r.ordem), -1)', 'max')
      .where('r.catalogo_id = :id', { id: dados.catalogoId })
      .getRawOne<{ max: string }>()) ?? { max: '-1' };

    const criada = await this.repoReferencias.save(
      this.repoReferencias.create({
        catalogoId: dados.catalogoId,
        tipo: dados.tipo,
        valor: dados.valor,
        arquivoId: dados.arquivoId ?? null,
        mime: dados.mime ?? null,
        ordem: Number(max) + 1,
      }),
    );

    return this.paraReferencia(criada);
  }

  async removerReferencia(
    catalogoId: string,
    referenciaId: string,
  ): Promise<string | null> {
    const linha = await this.repoReferencias.findOne({
      where: { id: referenciaId, catalogoId },
    });
    if (!linha) throw new NotFoundException('Referência não encontrada');

    await this.repoReferencias.delete({ id: referenciaId });
    return linha.arquivoId;
  }

  // -------------------------------------------------------------------------
  // Mapeamento
  // -------------------------------------------------------------------------

  private async montarDetalhe(
    linha: CatalogoOrmEntity,
  ): Promise<CatalogoDetalhe> {
    const [referencias, fotos] = await Promise.all([
      this.repoReferencias.find({
        where: { catalogoId: linha.id },
        order: { ordem: 'ASC' },
      }),
      this.repoFotos.find({
        where: { catalogoId: linha.id },
        order: { posicao: 'ASC' },
      }),
    ]);

    return {
      ...this.paraItem(linha, fotos.length),
      referencias: referencias.map((r) => this.paraReferencia(r)),
      fotos: fotos.map((f) => this.paraFoto(f)),
      finalArquivoId: linha.finalArquivoId,
      finalNomeArquivo: linha.finalNomeArquivo,
      finalEntregueEm: linha.finalEntregueEm,
    };
  }

  private paraItem(linha: CatalogoOrmEntity, totalFotos: number): CatalogoItem {
    return {
      id: linha.id,
      numero: linha.numero,
      nome: linha.nome,
      tema: linha.tema,
      formato: linha.formato,
      status: linha.status,
      criadoPorNome: linha.criadoPorNome,
      totalFotos,
      finalOrigem: linha.finalOrigem,
      createdAt: linha.createdAt,
    };
  }

  private paraReferencia(linha: CatalogoReferenciaOrmEntity): ReferenciaItem {
    return {
      id: linha.id,
      tipo: linha.tipo,
      valor: linha.valor,
      arquivoId: linha.arquivoId,
      ordem: linha.ordem,
    };
  }

  private paraFoto(linha: CatalogoFotoOrmEntity): FotoItem {
    return {
      id: linha.id,
      catalogoId: linha.catalogoId,
      posicao: linha.posicao,
      codigoErp: linha.codigoErp,
      descricao: linha.descricao,
      // NUMERIC volta como string do driver — convertido aqui, e nao na
      // entidade, como em produtos.valor_venda.
      precoAVista:
        linha.precoAVista === null ? null : Number(linha.precoAVista),
      parcelas: linha.parcelas,
      origem: linha.origem,
      remetente: linha.remetente,
      arquivoOriginalId: linha.arquivoOriginalId,
      arquivoId: linha.arquivoId,
      status: linha.status,
      versoes: linha.versoes,
      aprovadoPor: linha.aprovadoPor,
      aprovadoEm: linha.aprovadoEm,
    };
  }
}
