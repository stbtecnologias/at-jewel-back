import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  pastaDoCatalogo,
  PASTA_FINAIS,
  type IArmazenamento,
} from '../../domain/ports/armazenamento.port';
import type { DirecaoDeArte } from '../../domain/ports/estilo-catalogo.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
  TRATAMENTO_IMAGEM,
} from '../../domain/ports/injection-tokens';
import { valorDaParcela } from '../../domain/ports/repositories/catalogo-repository.port';
import type {
  CatalogoDetalhe,
  FotoItem,
  ICatalogoRepository,
} from '../../domain/ports/repositories/catalogo-repository.port';
import type {
  ITratamentoImagem,
  Orientacao,
} from '../../domain/ports/tratamento-imagem.port';
import { EstiloDoCatalogoService } from '../estilo-do-catalogo.service';
import {
  chaveDaImagem,
  chaveDoPlano,
  fotosDoPlano,
  nomeDaModelo,
  paginasDoPdf,
  repartir,
  type PaginaDoPlano,
  type PlanoDaMontagem,
} from '../plano-da-montagem';
import { recusarSeAprovado } from './aprovar-catalogo.use-case';

/**
 * A página, em pontos de PDF (1 pt = 1/72 pol).
 *
 * 720 x 1280 é 9:16 exato — a proporção do story. O 16:9 é o mesmo par
 * invertido. Números redondos na razão certa importam mais que o tamanho
 * absoluto: o PDF é vetorial, e quem imprimir escala sem perder nada.
 */
const PAGINA = { curto: 720, longo: 1280 };

/** Respiro nas bordas. Generoso de propósito: catálogo de joia é branco. */
const MARGEM = 48;

/** Espaço entre as células da grade. */
const GAP = 18;

/** Respiro da foto e do texto dentro do cartão branco, na página com tema. */
const RESPIRO_CARTAO = 10;

/**
 * Fração da altura da célula que a foto PODE ocupar. O resto é do texto.
 *
 * Constante e não cálculo automático porque o equilíbrio é editorial — quem
 * ajustar isto está mexendo no visual da casa.
 */
const FATIA_DA_FOTO = 0.62;

/** Até quantas colunas e linhas a grade vai, por formato — o "New In". */
const GRADE_MAXIMA = {
  retrato: { colunas: 2, linhas: 4 },
  paisagem: { colunas: 4, linhas: 2 },
};

/**
 * A altura do descritivo na escala 1 (código, descrição em até duas linhas e
 * as duas linhas de valor), com folga. Cresce com a escala.
 */
const ALTURA_TEXTO = 60;

/** O texto acompanha a foto grande, até o dobro — e nunca encolhe. */
const FOTO_NA_ESCALA_1 = 170;
const ESCALA_MAXIMA = 2;

/**
 * O cartão não fica mais largo que isto em relação à foto. Com uma peça só
 * em paisagem a célula tem a folha inteira, e um cartão de 1.184 pt com uma
 * foto de 387 no meio é uma faixa branca, não um cartão.
 */
const CARTAO_POR_FOTO = 1.8;

/**
 * Como UMA página de grade se arruma para N peças.
 *
 * ==========================================================================
 * O TAMANHO SEGUE A QUANTIDADE — decisão do Lucas em 16/09/2026: "se for uma,
 * duas, cinco ou dez, dimensiona na página".
 *
 * Testa cada número de colunas que o formato admite e fica com o que deixa a
 * FOTO MAIOR; no empate, o que deixa menos buraco. Assim uma peça vira
 * destaque, duas dividem a folha, e oito voltam à grade da casa.
 * ==========================================================================
 */
export function disposicaoDaGrade(
  quantidade: number,
  retrato: boolean,
  largura: number,
  altura: number,
  respiro: number,
) {
  const maxima = retrato ? GRADE_MAXIMA.retrato : GRADE_MAXIMA.paisagem;
  const util = largura - MARGEM * 2;
  const utilAltura = altura - MARGEM * 2;

  let melhor: {
    colunas: number;
    linhas: number;
    larguraCelula: number;
    alturaCelula: number;
    foto: number;
    buracos: number;
  } | null = null;

  for (
    let colunas = 1;
    colunas <= Math.min(maxima.colunas, quantidade);
    colunas++
  ) {
    const linhas = Math.ceil(quantidade / colunas);
    if (linhas > maxima.linhas) continue;

    const larguraCelula = (util - GAP * (colunas - 1)) / colunas;
    const alturaCelula = (utilAltura - GAP * (linhas - 1)) / linhas;
    const foto = Math.min(
      larguraCelula - respiro * 2,
      alturaCelula * FATIA_DA_FOTO,
    );
    const buracos = colunas * linhas - quantidade;

    if (
      !melhor ||
      foto > melhor.foto + 1 ||
      (Math.abs(foto - melhor.foto) <= 1 && buracos < melhor.buracos)
    ) {
      melhor = { colunas, linhas, larguraCelula, alturaCelula, foto, buracos };
    }
  }

  // Não acontece com até POR_PAGINA peças; a guarda é do tipo.
  if (!melhor) throw new Error(`Grade sem disposição para ${quantidade} peças`);

  const escala = Math.min(
    ESCALA_MAXIMA,
    Math.max(1, melhor.foto / FOTO_NA_ESCALA_1),
  );
  return {
    colunas: melhor.colunas,
    linhas: melhor.linhas,
    larguraCelula: melhor.larguraCelula,
    foto: melhor.foto,
    escala,
    larguraCartao: Math.min(
      melhor.larguraCelula,
      melhor.foto * CARTAO_POR_FOTO + respiro * 2,
    ),
    alturaCartao: Math.min(
      melhor.alturaCelula,
      respiro * 2 + melhor.foto + (10 + ALTURA_TEXTO) * escala,
    ),
  };
}

// A repartição mora com o plano — o desenho e o ajuste contam as páginas pela
// mesma regra. Reexportada aqui porque é daqui que ela sempre foi importada.
export { repartir };

/**
 * O DESCRITIVO NÃO É PRETO no catálogo da casa — é um azul-petróleo escuro, e
 * só as linhas de valor são pretas. Conferido nas páginas do "New In".
 */
const COR_DESCRITIVO = '#1f3a5f';
const COR_VALOR = '#111111';

/**
 * A peça sem preço tem frase própria, e ela É IMPRESSA.
 *
 * Aparece em cinco peças do catálogo real. Antes daqui, peça sem preço saía com
 * um vazio embaixo do código — e o leitor não sabe se o preço foi esquecido ou
 * se é sob consulta.
 */
const SOB_CONSULTA = '*PREÇO SOB CONSULTA';

/**
 * UMA PEÇA NA MODELO A CADA NOVE — a 1ª, a 10ª, a 19ª.
 *
 * Decisão do Lucas em 16/09/2026: "com o tema você vai seguindo, página com
 * uma modelo e outras sem, apenas as joias, vai mesclando". Nove é a página
 * da modelo mais uma grade cheia de oito: o ritmo fica modelo, grade, modelo,
 * grade.
 */
const UMA_NA_MODELO_A_CADA = 9;

/**
 * GERAÇÕES AO MESMO TEMPO.
 *
 * Em fila, um catálogo de 30 peças (4 modelos + capa + fundo) levaria uns
 * três minutos. Tudo de uma vez esbarra no limite de imagens por minuto da
 * conta da OpenAI, e a geração que estoura vira peça sem modelo. Três é o
 * meio: pouco mais de um minuto, e dentro do limite.
 */
const GERACOES_SIMULTANEAS = 3;

/** A foto na modelo diz o que é — ver `PedidoDeAmbientacao`. */
const ILUSTRATIVA = 'Imagem ilustrativa';

export interface Peca {
  foto: FotoItem;
  imagem: Buffer;
  mime: string;
}

/**
 * O que a página com tema precisa para se desenhar. Arte que falhou é `null`,
 * e a página sai na cor da paleta.
 */
interface Tema {
  direcao: DirecaoDeArte;
  capa: Buffer | null;
  fundo: Buffer | null;
}

/** Imagem gerada, pelo nome lógico do plano (`capa`, `modelo:<fotoId>`…). */
export type ImagensGeradas = Map<string, { conteudo: Buffer; mime: string }>;

/**
 * Onde a peça vai no corpo, pela descrição do ERP. Vale para qualquer tema.
 *
 * A descrição é o único dado que diz o que a peça É — "COLAR OPALA OURO 18K".
 * Sem palavra conhecida, a IA escolhe o uso natural: é melhor que chutar um
 * pescoço para uma peça que talvez seja um broche.
 */
export function ondeVai(descricao: string | null): string {
  const d = (descricao ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

  // SEM "DA MODELO" NO TEXTO: quem usa vem do tema (`DirecaoDeArte.modelo`),
  // e pode ser um homem no Dia dos Pais. Aqui mora só o lugar no corpo.
  if (/\b(ABOTOADURA)/.test(d)) {
    return 'no punho da camisa, com a mão em primeiro plano';
  }
  if (/\b(PRENDEDOR DE GRAVATA|ALFINETE DE GRAVATA)/.test(d)) {
    return 'na gravata';
  }
  if (/\b(COLAR|GARGANTILHA|PINGENTE|CORRENTE|CORDAO|CHOKER)/.test(d)) {
    return 'no pescoço, com o colo em evidência';
  }
  if (/\b(BRINCO|ARGOLA|EAR ?CUFF|PIERCING)/.test(d)) {
    return 'na orelha, com o cabelo preso para a peça aparecer';
  }
  if (/\b(ANEL|ALIANCA|SOLITARIO)/.test(d)) {
    return 'no dedo, com a mão em primeiro plano';
  }
  if (/\b(PULSEIRA|BRACELETE|RELOGIO)/.test(d)) {
    return 'no pulso, com o braço em primeiro plano';
  }
  if (/\bTORNOZELEIRA/.test(d)) {
    return 'no tornozelo';
  }
  if (/\bBROCHE/.test(d)) {
    return 'na roupa, na altura do peito';
  }
  return 'de forma natural para o tipo de peça';
}

/**
 * O catálogo montado em PDF: capa, páginas e contracapa.
 *
 * ==========================================================================
 * O TEXTO É NOSSO E DETERMINÍSTICO — NENHUM MODELO ESCREVE NESTA PÁGINA.
 *
 * Um modelo de imagem montando a página reproduziria de uma vez os três erros
 * medidos em 31/08/2026: inventaria pedra numa peça, escreveria
 * `R$ 44.800,00` onde é `44.900,00`, e embaralharia os códigos. Em catálogo,
 * dígito é dinheiro. Código, descrição e preço saem do banco, sempre.
 * ==========================================================================
 *
 * ==========================================================================
 * COM OBSERVAÇÃO, O CATÁLOGO GANHA TEMA — 16/09/2026.
 *
 * O Lucas: "quando digo estilo praiano nas observações, não é a imagem da
 * joia que vai ficar com fundo, mas o catálogo em si, com elementos
 * praianos, as joias montadas com modelos". E, sem observação, "deixa branco
 * mesmo".
 *
 * Com tema, a IA entra ONDE ERRAR NÃO CUSTA DINHEIRO:
 *   - a arte da CAPA e o FUNDO das páginas, sem peça e sem texto;
 *   - a peça NA MODELO, uma a cada nove, marcada "imagem ilustrativa".
 * As peças da grade continuam sendo o packshot aprovado, em cartão branco.
 *
 * AS IMAGENS NASCEM AQUI, NA HORA DE MONTAR — decisão do Lucas ("não precisa
 * de migração, você gera a foto e monta"). A foto na modelo não passa pela
 * aprovação do WhatsApp: quem aprova é quem abre o PDF.
 * ==========================================================================
 *
 * ==========================================================================
 * PLANEJAR, DESENHAR, GUARDAR O PLANO — 16/09/2026.
 *
 * Para o ajuste página a página ("na página 4, a modelo sorrindo"), a
 * montagem se divide: `planejar` decide as páginas e gera as imagens;
 * `desenhar` faz o PDF a partir do plano; e o plano fica guardado ao lado do
 * PDF, com as imagens. O ajuste parte dali e refaz só o que foi pedido. Ver
 * `plano-da-montagem.ts`.
 * ==========================================================================
 *
 * `final_origem` grava `'IA'` porque é o valor que a migração 42 reservou
 * para "montado pelo sistema", em oposição a `'MARKETING'`.
 */
@Injectable()
export class MontarCatalogoUseCase {
  private readonly logger = new Logger(MontarCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(TRATAMENTO_IMAGEM)
    private readonly ia: ITratamentoImagem,
    private readonly estilo: EstiloDoCatalogoService,
  ) {}

  async execute(catalogoId: string): Promise<CatalogoDetalhe> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');
    recusarSeAprovado(catalogo);

    const fotos = catalogo.fotos.filter((f) => f.status === 'APROVADA');
    if (fotos.length === 0) {
      throw new BadRequestException(
        'Nenhuma foto aprovada neste catálogo. Aprove as fotos na conversa do WhatsApp antes de montar.',
      );
    }

    const pecas = await this.carregarPecas(fotos);
    const { plano, imagens } = await this.planejar(catalogo, pecas);
    return this.montarDoPlano(catalogo, plano, pecas, imagens);
  }

  /**
   * Desenha o PDF a partir de um plano e grava como VERSÃO NOVA, com o plano
   * ao lado.
   *
   * Pública porque o AJUSTE termina aqui também: ele altera o plano da versão
   * que a pessoa viu e entrega o resultado para o mesmo desenho. Duas formas
   * de gravar versão divergiriam no primeiro detalhe.
   */
  async montarDoPlano(
    catalogo: CatalogoDetalhe,
    plano: PlanoDaMontagem,
    pecas: Peca[],
    imagens: ImagensGeradas,
  ): Promise<CatalogoDetalhe> {
    const catalogoId = catalogo.id;
    const pdf = await this.desenhar(
      catalogo,
      plano,
      new Map(pecas.map((p) => [p.foto.id, p])),
      imagens,
    );

    const nomeArquivo = `catalogo-${catalogo.numero}.pdf`;
    const arquivoId = await this.armazenamento.guardar(
      { conteudo: pdf, mime: 'application/pdf', nomeOriginal: nomeArquivo },
      pastaDoCatalogo(catalogo.numero, PASTA_FINAIS),
    );

    // ACRESCENTA UMA VERSÃO — não substitui. Montar deixou de apagar o que o
    // marketing tinha enviado. Ver a migração 44.
    await this.repositorio.registrarFinal(catalogoId, {
      origem: 'IA',
      arquivoId,
      nomeArquivo,
      mime: 'application/pdf',
      tamanhoBytes: pdf.length,
      // Nulo: quem montou foi o sistema, não uma pessoa.
      enviadoPor: null,
    });

    await this.guardarPlano(arquivoId, plano, imagens);

    const atualizado = await this.repositorio.buscarPorId(catalogoId);
    if (!atualizado) throw new NotFoundException('Catálogo não encontrado');
    return atualizado;
  }

  /**
   * AS IMAGENS SÃO LIDAS ANTES DE DESENHAR, e não durante: a paginação precisa
   * saber quantas peças de fato entraram. Lendo dentro do laço de desenho, uma
   * foto que sumisse deixaria um buraco no meio da página.
   */
  async carregarPecas(fotos: FotoItem[]): Promise<Peca[]> {
    const pecas: Peca[] = [];
    for (const foto of fotos) {
      if (!foto.arquivoId) continue;
      const lida = await this.armazenamento.ler(foto.arquivoId);
      if (!lida) {
        this.logger.warn(`Foto ${foto.id} sem arquivo — fora do PDF.`);
        continue;
      }
      pecas.push({ foto, imagem: lida.conteudo, mime: lida.mime });
    }
    return pecas;
  }

  /**
   * Decide as páginas e gera as imagens do tema.
   *
   * Sem observação não há direção de arte, nenhuma imagem é gerada, e o plano
   * é o catálogo de sempre: capa, grades e contracapa.
   *
   * NADA AQUI DERRUBA A MONTAGEM. Geração que falha vira página na cor da
   * paleta, ou peça de volta à grade. O pior caso de um provedor fora do ar
   * é um catálogo com tema e sem foto de modelo — nunca catálogo nenhum.
   */
  private async planejar(
    catalogo: CatalogoDetalhe,
    pecas: Peca[],
  ): Promise<{ plano: PlanoDaMontagem; imagens: ImagensGeradas }> {
    const direcao = await this.estilo.direcao(
      catalogo.id,
      catalogo.referencias,
    );
    const imagens: ImagensGeradas = new Map();

    if (direcao && pecas.length > 0) {
      const orientacao: Orientacao =
        catalogo.formato === '9:16' ? 'retrato' : 'paisagem';
      const { paleta, cena } = direcao;
      const cores = [paleta.fundo, paleta.destaque, paleta.texto];

      const tarefas: (() => Promise<void>)[] = [
        ...(['capa', 'fundo'] as const).map((tipo) => async () => {
          const r = await this.ia.gerarArte({ tipo, cena, cores, orientacao });
          if (r) imagens.set(tipo, r);
        }),
        ...pecas
          .filter((_, i) => i % UMA_NA_MODELO_A_CADA === 0)
          .map((peca) => async () => {
            const r = await this.ia.ambientar({
              peca: { conteudo: peca.imagem, mime: peca.mime },
              cena,
              modelo: direcao.modelo,
              onde: ondeVai(peca.foto.descricao),
              // A foto na modelo é SEMPRE retrato: em 9:16 ela preenche a
              // página; em 16:9 ocupa a coluna da esquerda. Corpo em paisagem
              // corta a peça ou encolhe a modelo.
              orientacao: 'retrato',
            });
            if (r) imagens.set(nomeDaModelo(peca.foto.id), r);
          }),
      ];

      await this.emParalelo(tarefas, GERACOES_SIMULTANEAS);

      const naModelo = [...imagens.keys()].filter((n) =>
        n.startsWith('modelo:'),
      ).length;
      this.logger.log(
        `Catalogo ${catalogo.numero} com tema: capa ${imagens.has('capa') ? 'ok' : 'sem arte'}, ` +
          `fundo ${imagens.has('fundo') ? 'ok' : 'sem arte'}, ${naModelo} na modelo.`,
      );
    }

    // O RITMO: a peça na modelo ganha página própria e fecha a grade que vinha
    // se formando. Sem tema não há foto na modelo, e tudo é grade — o
    // catálogo de sempre.
    const paginas: PaginaDoPlano[] = [{ tipo: 'capa' }];
    let grade: string[] = [];
    const fecharGrade = () => {
      let inicio = 0;
      for (const quantas of repartir(grade.length)) {
        paginas.push({
          tipo: 'grade',
          fotoIds: grade.slice(inicio, inicio + quantas),
        });
        inicio += quantas;
      }
      grade = [];
    };
    for (const { foto } of pecas) {
      if (imagens.has(nomeDaModelo(foto.id))) {
        fecharGrade();
        paginas.push({ tipo: 'modelo', fotoId: foto.id });
      } else {
        grade.push(foto.id);
      }
    }
    fecharGrade();
    paginas.push({ tipo: 'contracapa' });

    return {
      plano: {
        versao: 1,
        formato: catalogo.formato,
        direcao,
        paginas,
        arquivos: {},
      },
      imagens,
    };
  }

  /**
   * Grava as imagens geradas e o plano ao lado do PDF.
   *
   * NÃO DERRUBA A MONTAGEM: o PDF já está gravado e registrado. Sem o plano,
   * a única perda é esta versão não poder ser ajustada página a página —
   * montar de novo resolve.
   */
  private async guardarPlano(
    chaveDoPdf: string,
    plano: PlanoDaMontagem,
    imagens: ImagensGeradas,
  ): Promise<void> {
    try {
      for (const [nome, imagem] of imagens) {
        const chave = chaveDaImagem(chaveDoPdf, nome, imagem.mime);
        await this.armazenamento.guardarEm(chave, imagem.conteudo, imagem.mime);
        plano.arquivos[nome] = chave;
      }
      await this.armazenamento.guardarEm(
        chaveDoPlano(chaveDoPdf),
        Buffer.from(JSON.stringify(plano)),
        'application/json',
      );
    } catch (err) {
      this.logger.warn(
        `Plano da montagem ${chaveDoPdf} nao gravado — sem ajuste por pagina: ${String(err)}`,
      );
    }
  }

  /** Roda as tarefas com no máximo `limite` ao mesmo tempo. Nenhuma lança. */
  private async emParalelo(
    tarefas: (() => Promise<void>)[],
    limite: number,
  ): Promise<void> {
    let proxima = 0;
    const trabalhador = async () => {
      while (proxima < tarefas.length) {
        const tarefa = tarefas[proxima++];
        try {
          await tarefa();
        } catch (err) {
          this.logger.warn(`Geracao do tema falhou: ${String(err)}`);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador),
    );
  }

  /**
   * Monta o documento inteiro na memória.
   *
   * DIFERENTE DA EXPORTAÇÃO, que transmite o zip enquanto o escreve: aqui o
   * arquivo precisa existir inteiro para ser GRAVADO no armazenamento e
   * carimbado no banco.
   */
  private async desenhar(
    catalogo: CatalogoDetalhe,
    plano: PlanoDaMontagem,
    pecas: Map<string, Peca>,
    imagens: ImagensGeradas,
  ): Promise<Buffer> {
    const tema: Tema | null = plano.direcao
      ? {
          direcao: plano.direcao,
          capa: imagens.get('capa')?.conteudo ?? null,
          fundo: imagens.get('fundo')?.conteudo ?? null,
        }
      : null;
    const retrato = catalogo.formato === '9:16';
    const largura = retrato ? PAGINA.curto : PAGINA.longo;
    const altura = retrato ? PAGINA.longo : PAGINA.curto;

    const doc = new PDFDocument({
      size: [largura, altura],
      margin: MARGEM,
      autoFirstPage: false,
      info: {
        Title: `${catalogo.nome} — #${catalogo.numero}`,
        Author: 'A.T Jewel',
      },
    });

    const pedacos: Buffer[] = [];
    doc.on('data', (p: Buffer) => pedacos.push(p));
    const pronto = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(pedacos)));
    });

    const folha = { doc, retrato, largura, altura, tema };

    // A PEÇA QUE NÃO ESTÁ MAIS AQUI SAI SEM BURACO: o plano guarda ids, e uma
    // foto tirada do catálogo entre a montagem e um ajuste simplesmente não
    // é desenhada. A contagem da capa é das peças que de fato entram.
    const total = fotosDoPlano(plano).filter((id) => pecas.has(id)).length;

    // A NUMERAÇÃO É A DE `paginasDoPdf`, a mesma que o ajuste mostra à IA —
    // "na página 4" tem de ser esta página 4.
    const paginas = paginasDoPdf(
      plano,
      (id) => pecas.has(id),
      (nome) => imagens.has(nome),
    );
    for (const pagina of paginas) {
      switch (pagina.tipo) {
        case 'capa':
          this.capa(folha, catalogo, total);
          break;
        case 'modelo':
          this.paginaDaModelo(
            folha,
            pecas.get(pagina.fotoId)!,
            imagens.get(nomeDaModelo(pagina.fotoId))!.conteudo,
          );
          break;
        case 'grade':
          this.grade(
            folha,
            pagina.fotoIds.map((id) => pecas.get(id)!),
          );
          break;
        case 'contracapa':
          this.contracapa(folha);
          break;
      }
    }

    doc.end();
    return pronto;
  }

  /**
   * O fundo da página com tema: a cor da paleta e, por cima, a arte gerada.
   *
   * A COR VEM ANTES DA ARTE, e não no lugar dela: se a arte não cobrir a
   * página inteira por arredondamento, a borda que sobra é da paleta, e não
   * um fio branco.
   */
  private fundoTematico(folha: Folha, arte: Buffer | null): void {
    const { doc, largura, altura, tema } = folha;
    if (!tema) return;
    doc.rect(0, 0, largura, altura).fill(tema.direcao.paleta.fundo);
    if (arte) {
      doc.image(arte, 0, 0, {
        cover: [largura, altura],
        align: 'center',
        valign: 'center',
      });
    }
  }

  /**
   * A capa: nome, tema e o número.
   *
   * Com tema, a arte gerada ocupa a folha, e o texto vai numa faixa clara por
   * cima — sem a faixa, título escuro sobre foto de praia some.
   */
  private capa(folha: Folha, catalogo: CatalogoDetalhe, total: number): void {
    const { doc, largura, altura, tema } = folha;
    doc.addPage();
    const util = largura - MARGEM * 2;

    const contagem = `#${catalogo.numero}  ·  ${total} ${total === 1 ? 'peça' : 'peças'}`;

    if (!tema) {
      doc
        .fillColor('#1a1a1a')
        .font('Helvetica-Bold')
        .fontSize(38)
        .text(catalogo.nome.toUpperCase(), MARGEM, altura * 0.36, {
          width: util,
          align: 'center',
        });

      // Filete: o mesmo recurso da capa da tela, e a única marca gráfica aqui.
      const y = doc.y + 22;
      this.filete(doc, largura / 2, y, '#b8912f');

      if (catalogo.tema) {
        doc
          .font('Helvetica')
          .fontSize(13)
          .fillColor('#6b6b6b')
          .text(catalogo.tema, MARGEM, y + 22, {
            width: util,
            align: 'center',
          });
      }

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#9a9a9a')
        .text(contagem, MARGEM, altura - MARGEM - 20, {
          width: util,
          align: 'center',
        });
      return;
    }

    const { paleta, frase } = tema.direcao;
    this.fundoTematico(folha, tema.capa);

    const alturaFaixa = 240;
    const topo = altura / 2 - alturaFaixa / 2;
    doc.save();
    doc.fillOpacity(0.86).rect(0, topo, largura, alturaFaixa).fill('#ffffff');
    doc.restore();

    doc
      .fillColor(paleta.texto)
      .font('Helvetica-Bold')
      .fontSize(36)
      .text(catalogo.nome.toUpperCase(), MARGEM, topo + 42, {
        width: util,
        align: 'center',
      });

    const y = doc.y + 18;
    this.filete(doc, largura / 2, y, paleta.destaque);

    const subtitulo = [catalogo.tema, frase].filter(Boolean).join('  ·  ');
    if (subtitulo) {
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor(paleta.texto)
        .text(subtitulo, MARGEM, y + 18, { width: util, align: 'center' });
    }

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#6b6b6b')
      .text(contagem, MARGEM, topo + alturaFaixa - 32, {
        width: util,
        align: 'center',
      });
  }

  private filete(
    doc: PDFKit.PDFDocument,
    centro: number,
    y: number,
    cor: string,
  ): void {
    doc
      .moveTo(centro - 40, y)
      .lineTo(centro + 40, y)
      .lineWidth(1)
      .strokeColor(cor)
      .stroke();
  }

  /**
   * Uma página de grade: até oito peças, packshot com o descritivo embaixo.
   *
   * QUATRO COLUNAS EM PAISAGEM, DUAS EM RETRATO. A densidade é a mesma; o que
   * muda é a forma da folha.
   *
   * COM TEMA, CADA PEÇA VAI NUM CARTÃO BRANCO sobre o fundo decorado. O
   * packshot é branco, e colado direto na página de cor ele viraria um
   * quadrado recortado; no cartão, o branco da foto é o branco do cartão.
   *
   * O TAMANHO SEGUE A QUANTIDADE, E O BLOCO FICA NO MEIO — 16/09/2026. Com
   * uma peça só ela ficava no canto de cima, pequena, com a folha vazia. Agora
   * a disposição sai de `disposicaoDaGrade`, o bloco vai para o meio da
   * página e a linha incompleta para o meio da linha.
   */
  private grade(folha: Folha, pecas: Peca[]): void {
    const { doc, retrato, largura, altura, tema } = folha;
    doc.addPage();
    this.fundoTematico(folha, tema?.fundo ?? null);

    const respiro = tema ? RESPIRO_CARTAO : 0;
    const d = disposicaoDaGrade(
      pecas.length,
      retrato,
      largura,
      altura,
      respiro,
    );

    const alturaBloco = d.linhas * d.alturaCartao + (d.linhas - 1) * GAP;
    const topo = (altura - alturaBloco) / 2;

    for (const [i, { foto, imagem }] of pecas.entries()) {
      const coluna = i % d.colunas;
      const linha = Math.floor(i / d.colunas);
      const naLinha = Math.min(d.colunas, pecas.length - linha * d.colunas);
      const larguraLinha = naLinha * d.larguraCelula + (naLinha - 1) * GAP;
      const celula =
        (largura - larguraLinha) / 2 + coluna * (d.larguraCelula + GAP);
      const x = celula + (d.larguraCelula - d.larguraCartao) / 2;
      const y = topo + linha * (d.alturaCartao + GAP);

      if (tema) {
        doc
          .roundedRect(x, y, d.larguraCartao, d.alturaCartao, 10)
          .fill('#ffffff');
      }

      // `fit` preserva a proporção e centraliza: a foto NUNCA é distorcida para
      // preencher. Packshot esticado passa no desenvolvimento e salta aos olhos
      // no impresso.
      doc.image(imagem, x + (d.larguraCartao - d.foto) / 2, y + respiro, {
        fit: [d.foto, d.foto],
        align: 'center',
        valign: 'center',
      });

      this.descritivo(
        doc,
        foto,
        x + respiro,
        y + respiro + d.foto + 10 * d.escala,
        d.larguraCartao - respiro * 2,
        d.escala,
      );
    }
  }

  /**
   * A página da peça na modelo.
   *
   * EM RETRATO, a foto preenche a folha e o descritivo vai num painel claro
   * embaixo. EM PAISAGEM, a foto ocupa a coluna da esquerda na proporção dela
   * (2:3), e o descritivo fica grande, à direita, sobre o fundo do tema.
   *
   * O PREÇO É O MESMO DO PACKSHOT, do mesmo bloco — a IA gerou a foto, não o
   * texto.
   */
  private paginaDaModelo(folha: Folha, peca: Peca, naModelo: Buffer): void {
    const { doc, retrato, largura, altura, tema } = folha;
    doc.addPage();
    this.fundoTematico(folha, tema?.fundo ?? null);

    if (retrato) {
      doc.image(naModelo, 0, 0, {
        cover: [largura, altura],
        align: 'center',
        valign: 'center',
      });

      const alturaPainel = 150;
      const topo = altura - MARGEM - alturaPainel;
      doc.save();
      doc
        .fillOpacity(0.9)
        .roundedRect(MARGEM, topo, largura - MARGEM * 2, alturaPainel, 14)
        .fill('#ffffff');
      doc.restore();

      this.descritivo(
        doc,
        peca.foto,
        MARGEM + 24,
        topo + 28,
        largura - MARGEM * 2 - 48,
        1.7,
      );
      this.ilustrativa(
        doc,
        MARGEM,
        topo + alturaPainel - 22,
        largura - MARGEM * 2,
      );
      return;
    }

    const larguraFoto = Math.round((altura * 2) / 3);
    doc.save();
    doc.rect(0, 0, larguraFoto, altura).clip();
    doc.image(naModelo, 0, 0, {
      cover: [larguraFoto, altura],
      align: 'center',
      valign: 'center',
    });
    doc.restore();

    const x = larguraFoto + MARGEM;
    const larguraCartao = largura - larguraFoto - MARGEM * 2;
    const alturaCartao = 240;
    const topo = altura / 2 - alturaCartao / 2;
    doc.roundedRect(x, topo, larguraCartao, alturaCartao, 14).fill('#ffffff');

    this.descritivo(doc, peca.foto, x + 32, topo + 56, larguraCartao - 64, 2);
    this.ilustrativa(doc, x, topo + alturaCartao - 30, larguraCartao);
  }

  private ilustrativa(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    largura: number,
  ): void {
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#8a8a8a')
      .text(ILUSTRATIVA, x, y, { width: largura, align: 'center' });
  }

  /**
   * O bloco de texto de uma peça, no padrão impresso.
   *
   *     BR26243 • BRINCO DIAMANTE, TURQUESA,
   *     MALAQUITA E OURO AMARELO 18K
   *
   *     R$71.120,00 a vista
   *     10 X R$8.890,00
   *
   * Código e descrição numa linha separados por `•`, descrição em caixa alta e
   * na cor do descritivo; valores em negrito e pretos. É o mesmo bloco que o
   * `Descritivo` do front desenha em HTML — levantado nas páginas do "New In".
   *
   * @param escala o bloco maior da página da modelo. As proporções entre as
   *   linhas não mudam.
   */
  private descritivo(
    doc: PDFKit.PDFDocument,
    foto: FotoItem,
    x: number,
    y: number,
    largura: number,
    escala = 1,
  ): void {
    const texto = foto.descricao
      ? `${foto.codigoErp ?? '—'} • ${foto.descricao.toUpperCase()}`
      : (foto.codigoErp ?? '');

    doc
      .fillColor(COR_DESCRITIVO)
      .font('Helvetica-Bold')
      .fontSize(7.5 * escala)
      .text(texto, x, y, { width: largura, align: 'center', lineGap: 1 });

    doc.fillColor(COR_VALOR).fontSize(8.5 * escala);

    // SEM PREÇO TEM FRASE, e não vazio. Ver `SOB_CONSULTA`.
    if (foto.precoAVista === null || foto.parcelas === null) {
      doc.text(SOB_CONSULTA, x, doc.y + 6 * escala, {
        width: largura,
        align: 'center',
      });
      return;
    }

    doc.text(
      `${this.emReais(foto.precoAVista)} a vista`,
      x,
      doc.y + 6 * escala,
      {
        width: largura,
        align: 'center',
      },
    );

    doc
      .fontSize(8 * escala)
      .text(
        `${foto.parcelas} X ${this.emReais(
          valorDaParcela(foto.precoAVista, foto.parcelas, foto.jurosPercentual),
        )}`,
        x,
        doc.y + 2 * escala,
        { width: largura, align: 'center' },
      );
  }

  /**
   * A última página: só a marca, centralizada.
   *
   * É o que o catálogo real faz — a contracapa não vende, fecha. Com tema, a
   * marca vai sobre o fundo decorado, na cor de título da paleta.
   */
  private contracapa(folha: Folha): void {
    const { doc, largura, altura, tema } = folha;
    doc.addPage();
    this.fundoTematico(folha, tema?.fundo ?? null);
    doc
      .fillColor(tema?.direcao.paleta.texto ?? '#1a1a1a')
      .font('Helvetica')
      .fontSize(30)
      .text('A.T JEWEL', MARGEM, altura * 0.46, {
        width: largura - MARGEM * 2,
        align: 'center',
        characterSpacing: 3,
      });
  }

  /** `R$44.900,00` — colado, como no catálogo impresso. */
  private emReais(valor: number): string {
    const numero = valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$${numero}`;
  }
}

/** O que toda página precisa saber para se desenhar. */
interface Folha {
  doc: PDFKit.PDFDocument;
  retrato: boolean;
  largura: number;
  altura: number;
  tema: Tema | null;
}
