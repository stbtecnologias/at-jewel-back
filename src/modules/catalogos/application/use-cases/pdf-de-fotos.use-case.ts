import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ARMAZENAMENTO, CATALOGO_REPOSITORY } from '../../domain/ports/injection-tokens';
import {
  PASTA_FINAIS,
  pastaDoCatalogo,
} from '../../domain/ports/armazenamento.port';
import type { IArmazenamento } from '../../domain/ports/armazenamento.port';
import type {
  CatalogoDetalhe,
  FotoItem,
  ICatalogoRepository,
} from '../../domain/ports/repositories/catalogo-repository.port';

/** Teto de páginas. Um PDF de 60 fotos ninguém abre no celular. */
const MAX_PAGINAS = 40;

export interface PdfDeFotos {
  conteudo: Buffer;
  nome: string;
  /** Quantas entraram e quantas ficaram de fora do teto. */
  paginas: number;
  cortadas: number;
  /**
   * O que foi para a capa — volta para quem chama poder DIZER.
   *
   * A capa é escolhida por padrão, e escolha calada é escolha que ninguém
   * revisa: a agente conta qual peça abriu e o que ficou escrito, e aí ela
   * corrige numa frase se não era isso.
   */
  capa: {
    codigo: string | null;
    texto: string;
    /**
     * A capa veio de uma IMAGEM DE CAPA, e não de uma peça do catálogo —
     * RF47, 23/10/2026. Quem chama precisa saber para DIZER qual é: "a capa
     * é a imagem que você mandou" e "a capa é a foto da AN2630" são frases
     * diferentes, e só uma delas convida a trocar a peça.
     */
    enviada: boolean;
  } | null;
}

/**
 * O CATÁLOGO EM PDF, UMA FOTO POR PÁGINA — RF47, 22/10/2026.
 *
 * ==========================================================================
 * É O QUE ELA FAZ HOJE NO CHATGPT, e a descrição do Lucas é a especificação
 * inteira:
 *
 *   *"As fotos já são a página inteira, e os preços já estão nas fotos. O que
 *   falta é pegar a foto e colocar no PDF inteiro. E a capa ela diz qual
 *   seria."*
 *
 * ENTÃO AQUI NÃO SE DESENHA NADA. Sem cartão de preço, sem grade, sem fundo
 * gerado, sem texto por cima: a imagem que o marketing produziu já tem a
 * joia, o preço e o parcelamento marcados nela. Qualquer coisa que este
 * código escrevesse por cima competiria com o que já está lá.
 *
 * E É POR ISSO QUE ELE NÃO É O `MontarCatalogoUseCase`. Aquele monta a peça
 * de arte — direção, capa gerada, grade de oito, preço lido do banco a cada
 * desenho. Este aqui empilha fotos. São dois produtos diferentes com o mesmo
 * nome, e misturá-los faria o simples carregar a complexidade do outro.
 * ==========================================================================
 *
 * A PÁGINA TEM O TAMANHO DA IMAGEM, e não o contrário. Encaixar uma foto 9:16
 * numa folha A4 deixaria tarja branca em cima e embaixo — e o que ela manda
 * para a cliente é a imagem, não uma folha com a imagem dentro.
 */
@Injectable()
export class PdfDeFotosUseCase {
  private readonly logger = new Logger(PdfDeFotosUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * @param capaDita qual foto abre o PDF — o CÓDIGO da peça ("AN26369") ou o
   *   id da foto. **Ausente, vale a imagem de capa do catálogo** (ver
   *   `capaDeReferencia`) e, se não houver nenhuma, a primeira foto: a capa é
   *   padrão, e não um extra que ela precise pedir.
   * @param textoDaCapa o que vai escrito sobre ela. Ausente, vale o NOME do
   *   catálogo — mas no vídeo ela troca o texto sem trocar a coleção
   *   (*"tirar o Under 25k e colocar News"*), e por isso ele é um parâmetro
   *   e não uma leitura do cadastro.
   */
  async execute(
    catalogoId: string,
    capaDita?: string | null,
    textoDaCapa?: string | null,
  ): Promise<PdfDeFotos> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    // ====================================================================
    // A PEÇA TIRADA DA EDIÇÃO NÃO ENTRA NO PDF — 23/10/2026.
    //
    // "Tirar" grava `REPROVADA`: a linha fica, a imagem fica, e dá para
    // devolver — é assim no painel desde 16/09, e agora também pela conversa.
    // Só que este PDF lia `catalogo.fotos` INTEIRO: a peça que ela tirou
    // continuava saindo no arquivo que vai para a cliente, e tirar de novo não
    // resolveria, porque o status já era esse.
    //
    // OS OUTROS STATUS ENTRAM, e é de propósito: a foto que ainda espera
    // código é `RECEBIDA`, e é página legítima — o preço está na imagem, não
    // numa coluna nossa.
    // ====================================================================
    const naOrdem = [...catalogo.fotos]
      .filter((f) => f.status !== 'REPROVADA')
      .sort((a, b) => a.posicao - b.posicao);
    // ====================================================================
    // O CÓDIGO OU O ID — e o código é o que ela diz — 22/10/2026.
    //
    // A primeira versão comparava só com o id da foto (um uuid), e a
    // ferramenta pede à agente o CÓDIGO DA PEÇA. Nunca casava, e a capa era
    // ignorada EM SILÊNCIO: o PDF saía na ordem normal e ninguém sabia por
    // quê. Defeito que não quebra nada é o que mais demora a aparecer.
    // ====================================================================
    const procurado = String(capaDita ?? '')
      .trim()
      .toUpperCase();
    const escolhida = procurado
      ? naOrdem.find(
          (f) =>
            f.id.toUpperCase() === procurado ||
            (f.codigoErp ?? '').toUpperCase() === procurado,
        )
      : undefined;

    // ====================================================================
    // A CAPA É PADRÃO, E ELA SE REPETE — decisão dele em 22/10:
    //
    //   *"Deixa padrão: no gerar PDF, pega uma foto enviada e coloca o nome
    //   A.T Jewel e o nome do catálogo. Se ela quiser outra, ela fala."*
    //
    // E REPETIR NÃO É DEFEITO AQUI — era o que eu achava, e o vídeo mostrou
    // o contrário: o GPT fez *"uma capa usando uma das fotos que você
    // enviou, SEGUIDA DE TODAS as fotos originais"*. As duas páginas não são
    // iguais: a primeira tem a marca e o nome escritos por cima; a outra é a
    // peça limpa, com o preço dela. Tirar a peça do meio custaria a página
    // que a vende.
    //
    // E A CAPA QUE NÃO É PEÇA NÃO SE REPETE — RF47, 23/10/2026.
    //
    // Quando o catálogo tem uma IMAGEM DE CAPA escolhida — a que ela manda
    // pela Helena dizendo *"essa é a capa do 0042"*, ou a que escolheu no
    // painel —, é essa que abre o PDF, e aparece UMA VEZ SÓ: não é peça, não
    // tem preço na imagem, e uma segunda página com ela limpa não venderia
    // nada. Era o que faltava do RF47: até aqui toda capa era uma das peças.
    //
    // A PEÇA DITA GANHA DE TUDO. Se ela nomeia o código, a escolha é de
    // agora, e escolha dita vence padrão guardado.
    // ====================================================================
    const capaEnviada = escolhida ? null : capaDeReferencia(catalogo);
    const capaPeca = escolhida ?? (capaEnviada ? null : naOrdem[0]);

    const chaveDa = (f: FotoItem) => f.arquivoId ?? f.arquivoOriginalId;
    const fila: string[] = [];
    if (capaEnviada?.arquivoId) fila.push(capaEnviada.arquivoId);
    else if (capaPeca && chaveDa(capaPeca)) fila.push(chaveDa(capaPeca)!);
    for (const foto of naOrdem) {
      const chave = chaveDa(foto);
      if (chave) fila.push(chave);
    }

    const cabem = fila.slice(0, MAX_PAGINAS);
    const cortadas = fila.length - cabem.length;

    // AS IMAGENS SAEM DO ARMAZENAMENTO ANTES DE DESENHAR. Ler no meio do
    // desenho misturaria IO com a montagem do documento, e uma falha no meio
    // deixaria um PDF pela metade — que é pior que nenhum.
    //
    // E CADA ARQUIVO SE LÊ UMA VEZ: a foto da capa aparece duas na fila, e
    // baixar 3 MB de novo para desenhar a mesma imagem seria pagar dobrado
    // por página.
    const lidas = new Map<string, Buffer>();
    const imagens: Buffer[] = [];
    for (const chave of cabem) {
      let conteudo = lidas.get(chave);
      if (!conteudo) {
        const arquivo = await this.armazenamento.ler(chave);
        // LINHA SEM OBJETO É INCONSISTÊNCIA NOSSA, e não caminho feliz: a
        // foto some do PDF, o resto continua, e o log diz qual foi.
        if (!arquivo || arquivo.conteudo.length === 0) {
          this.logger.warn(
            `Arquivo ${chave} do catálogo ${catalogo.numero} está na base e não no armazenamento.`,
          );
          continue;
        }
        conteudo = arquivo.conteudo;
        lidas.set(chave, conteudo);
      }
      imagens.push(conteudo);
    }

    if (imagens.length === 0) {
      throw new NotFoundException(
        'Este catálogo não tem nenhuma foto para montar o PDF',
      );
    }

    // O TEXTO DA CAPA: o que ela pediu, ou o nome do catálogo.
    const titulo = (String(textoDaCapa ?? '').trim() || catalogo.nome).slice(
      0,
      40,
    );
    const desenhado = await this.desenhar(imagens, titulo);
    const conteudo = desenhado.conteudo;
    const nome = `catalogo-${catalogo.numero}-${semAcento(catalogo.nome)}.pdf`;

    // ====================================================================
    // O PDF TAMBÉM FICA NO PAINEL — 22/10/2026, achado no primeiro teste em
    // produção: *"o pdf criado não foi para o painel"*.
    //
    // E é justo: ela gerou pela conversa, mas quem revisa, aprova e manda
    // para a cliente trabalha na tela. Um arquivo que só existe no WhatsApp
    // some no primeiro "limpar conversa" — e o painel continuaria dizendo
    // "ainda não montado" sobre um catálogo que ela já mandou.
    //
    // ACRESCENTA UMA VERSÃO, não substitui — a mesma regra do "Montar" do
    // painel, desde a migração 44. Gerar de novo depois de trocar a capa
    // deixa as duas à vista.
    //
    // `origem: 'IA'` porque é o valor que a tela lê como "Montado pelo
    // sistema" — e foi o sistema. 'MARKETING' é o arquivo que uma pessoa
    // subiu, e seria mentira.
    // ====================================================================
    const arquivoId = await this.armazenamento.guardar(
      { conteudo, mime: 'application/pdf', nomeOriginal: nome },
      pastaDoCatalogo(catalogo.numero, PASTA_FINAIS),
    );
    await this.repositorio.registrarFinal(catalogo.id, {
      origem: 'IA',
      arquivoId,
      nomeArquivo: nome,
      mime: 'application/pdf',
      tamanhoBytes: conteudo.length,
      // Nulo: quem montou foi o sistema, e não uma pessoa subindo arquivo.
      enviadoPor: null,
    });

    return {
      conteudo,
      nome,
      paginas: desenhado.paginas,
      cortadas,
      // SÓ DIZ QUE TEM CAPA SE A CAPA SAIU. A primeira página pode ter sido
      // pulada por formato que o PDF não abre — e aí a frase "a capa é a
      // foto da AN2630" seria sobre uma página que não existe.
      capa: desenhado.capaSaiu
        ? {
            codigo: capaEnviada ? null : (capaPeca?.codigoErp ?? null),
            texto: titulo,
            enviada: Boolean(capaEnviada),
          }
        : null,
    };
  }

  /**
   * Uma página por imagem, do tamanho dela.
   *
   * `autoFirstPage: false` porque a primeira página também tem de nascer com
   * o tamanho da primeira imagem — com a padrão, o PDF abriria com uma folha
   * A4 em branco antes da capa.
   *
   * ========================================================================
   * IMAGEM QUE O PDF NÃO ABRE PERDE A PÁGINA DELA, E SÓ ELA — 23/10/2026.
   *
   * O pdfkit embute JPEG e PNG, e mais nada. Uma imagem WebP — que o canal
   * aceita, e que é o que chega quando alguém manda um sticker ou reencaminha
   * de certos aparelhos — fazia o `openImage` lançar, e o `catch` de fora
   * derrubava **o PDF inteiro**: dez fotos boas não viravam arquivo por causa
   * de uma.
   *
   * Agora cada página é tentada por si. A que falha sai do documento com um
   * aviso no log, as outras continuam, e `paginas` conta o que de fato
   * ficou — quem chama precisa do número verdadeiro para dizer à vendedora.
   * ========================================================================
   */
  private desenhar(
    imagens: Buffer[],
    tituloDaCapa: string | null,
  ): Promise<{ conteudo: Buffer; paginas: number; capaSaiu: boolean }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
      const pedacos: Buffer[] = [];
      let paginas = 0;
      let capaSaiu = false;
      doc.on('data', (p: Buffer) => pedacos.push(p));
      doc.on('end', () =>
        resolve({ conteudo: Buffer.concat(pedacos), paginas, capaSaiu }),
      );
      doc.on('error', reject);

      try {
        // `openImage` EXISTE E NÃO ESTÁ NA TIPAGEM do @types/pdfkit. É a
        // mesma função que o `doc.image` usa por dentro para medir o arquivo;
        // sem ela, a única alternativa seria uma biblioteca nova só para ler
        // dois números do cabeçalho do JPEG.
        const medir = doc as unknown as {
          openImage(src: Buffer): { width: number; height: number };
        };

        imagens.forEach((imagem, i) => {
          let tamanho: { width: number; height: number };
          try {
            // A dimensão real do arquivo; é dela que sai o tamanho da página.
            tamanho = medir.openImage(imagem);
          } catch (e) {
            this.logger.warn(
              `Página ${i + 1} ficou de fora do PDF: o formato não entra num PDF (${
                e instanceof Error ? e.message : e
              }).`,
            );
            return;
          }
          const { width, height } = tamanho;
          doc.addPage({ size: [width, height], margin: 0 });
          doc.image(imagem, 0, 0, { width, height });
          paginas += 1;
          if (i === 0 && tituloDaCapa) {
            this.escreverNaCapa(doc, tituloDaCapa, width, height);
            capaSaiu = true;
          }
        });

        // DOCUMENTO SEM PÁGINA NENHUMA NÃO É PDF — é um arquivo que abre
        // vazio no celular da cliente. Melhor a agente dizer que não deu.
        if (paginas === 0) {
          doc.end();
          reject(
            new BadRequestException(
              'Nenhuma das fotos deste catálogo está num formato que entra em PDF — manda como JPEG ou PNG.',
            ),
          );
          return;
        }
        doc.end();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /**
   * O NOME DO CATÁLOGO ESCRITO SOBRE A FOTO DE CAPA — 22/10/2026.
   *
   * ========================================================================
   * ESCOLHA DELE, DEPOIS DE VER AS DUAS OPÇÕES: *"letra A"* — a foto dela
   * como capa e o texto escrito por nós, em vez de mandar a imagem ao modelo
   * para ele reescrever a palavra.
   *
   * A razão é dupla. **A letra sai exata** — modelo de imagem erra letra, e
   * "New Opala" pode voltar "New Opaia" num PDF que vai para cliente. E a
   * edição por IA daria ao modelo licença para redesenhar a joia que a
   * modelo está usando: foi o que aconteceu em 31/08, quando ele trocou um
   * brinco por outro recortado de uma referência.
   *
   * DESENHADO DUAS VEZES, escuro e depois claro, com 2pt de deslocamento: é
   * sombra de pobre, e é o que mantém o nome legível tanto sobre cabelo
   * claro quanto sobre fundo escuro. Sem isso, metade das capas some.
   * ========================================================================
   */
  private escreverNaCapa(
    doc: PDFKit.PDFDocument,
    titulo: string,
    largura: number,
    altura: number,
  ): void {
    const temFonte = this.carregarFontes(doc);
    const script = temFonte ? FONTE_NOME : 'Helvetica-Oblique';
    const sans = temFonte ? FONTE_MARCA : 'Helvetica';

    const margem = Math.round(largura * 0.08);
    const util = largura - margem * 2;

    // ====================================================================
    // O TEXTO É MEDIDO E ENCOLHIDO ATÉ CABER — e não é preciosismo.
    //
    // A primeira versão saiu com 7 PÁGINAS num catálogo de 3 fotos: o nome
    // em corpo proporcional à largura ficou mais largo que a página, o
    // pdfkit QUEBROU a linha — apesar do `lineBreak: false` — e cada pedaço
    // que passava da borda de baixo virava PÁGINA NOVA. "New Opala" saiu
    // repartido em duas folhas em branco.
    //
    // É a mesma armadilha de 21/10, no relatório: *"o `lineBreak:false` não
    // impede a quebra"*, e *"escrever na margem de baixo adiciona página"*.
    // A lição custou duas vezes, então agora ela é código: MEDE, ENCOLHE, e
    // desenha com `x` calculado — sem `width`, não há onde quebrar.
    // ====================================================================
    const corpoQueCabe = (
      texto: string,
      fonte: string,
      desejado: number,
      espaco = 0,
    ): number => {
      doc.font(fonte).fontSize(desejado);
      const largo =
        doc.widthOfString(texto) + espaco * Math.max(0, texto.length - 1);
      if (largo <= util) return desejado;
      return Math.max(8, Math.floor((desejado * util) / largo));
    };

    const escrever = (
      texto: string,
      y: number,
      tamanho: number,
      fonte: string,
      espaco = 0,
      cor = COR_TINTA,
      halo = COR_CLARA,
    ) => {
      doc.font(fonte).fontSize(tamanho);
      const largo =
        doc.widthOfString(texto) + espaco * Math.max(0, texto.length - 1);
      const x = (largura - largo) / 2;
      // SEM `width` E SEM `align`: com a posição calculada, não existe caixa
      // de texto para o pdfkit quebrar nem estourar. É o que impede a
      // página fantasma.
      const comum = { characterSpacing: espaco, lineBreak: false };
      const desloca = Math.max(1, tamanho * 0.025);

      // O HALO CLARO vem primeiro e a tinta por cima. Ao contrário da
      // sombra escura da primeira versão, ele funciona onde as fotos da
      // casa vivem: packshot em fundo branco. Creme sobre branco some.
      doc.fillColor(halo).opacity(0.75).text(texto, x + desloca, y + desloca, comum);
      doc.fillColor(cor).opacity(1).text(texto, x, y, comum);
    };

    // A MARCA EM CAIXA ALTA E ESPAÇADA, no alto — como na referência.
    const marca = corpoQueCabe(
      'A.T JEWEL',
      sans,
      Math.max(9, Math.round(largura * 0.026)),
      Math.round(largura * 0.012),
    );
    escrever(
      'A.T JEWEL',
      altura * 0.045,
      marca,
      sans,
      Math.round(largura * 0.012),
    );

    // O NOME EM MANUSCRITO. `titulo` NÃO vai em caixa alta: a Great Vibes é
    // desenhada para maiúscula só na inicial, e tudo em caixa vira um
    // emaranhado ilegível.
    //
    // O corpo nasce da MENOR dimensão: numa foto deitada, 22% da largura
    // seria mais alto que a página inteira.
    const nome = corpoQueCabe(
      titulo,
      script,
      Math.round(Math.min(largura * 0.2, altura * 0.12)),
    );
    doc.font(script).fontSize(nome);
    const alturaDoNome = doc.heightOfString(titulo, { lineBreak: false });

    // E O BLOCO INTEIRO TEM DE CABER NA FOLHA. O `min` é o que garante que
    // nem o filete nem o "SHOP NOW" encostem na borda de baixo — encostar é
    // o que criava a página nova.
    const chamada = Math.max(7, Math.round(largura * 0.02));
    const alturaDoBloco = alturaDoNome + chamada * 3.2;
    const yNome = Math.min(altura * 0.66, altura - margem - alturaDoBloco);

    escrever(titulo, yNome, nome, script);

    const yFilete = yNome + alturaDoNome + chamada * 0.6;
    doc
      .opacity(0.85)
      .moveTo(largura / 2 - chamada * 2.2, yFilete)
      .lineTo(largura / 2 + chamada * 2.2, yFilete)
      .lineWidth(Math.max(1, chamada * 0.09))
      .strokeColor(COR_TINTA)
      .stroke();

    escrever(
      'SHOP NOW',
      yFilete + chamada * 0.8,
      chamada,
      sans,
      Math.round(chamada * 0.5),
    );
    doc.opacity(1);
  }

  /**
   * AS FONTES DA MARCA, UMA VEZ POR DOCUMENTO.
   *
   * ========================================================================
   * VÊM DO `node_modules`, e não de um arquivo no repositório: os pacotes do
   * Fontsource trazem a fonte com a licença (OFL) junto, versionada no
   * `package.json`, e chegam ao servidor pelo mesmo `npm ci` que traz o
   * resto. Binário no git precisaria também de uma linha no Dockerfile para
   * sobreviver ao `dist` — e é a linha que alguém esquece.
   *
   * SE FALTAR, O PDF SAI COM HELVETICA. Capa com a fonte errada é um
   * problema de acabamento; capa que não sai é um problema de verdade.
   * ========================================================================
   */
  private carregarFontes(doc: PDFKit.PDFDocument): boolean {
    try {
      doc.registerFont(FONTE_NOME, caminhoDaFonte(ARQUIVO_NOME));
      doc.registerFont(FONTE_MARCA, caminhoDaFonte(ARQUIVO_MARCA));
      return true;
    } catch (e) {
      this.logger.warn(
        `Fontes da capa não carregaram, saindo em Helvetica: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }
}

/**
 * A TINTA E O HALO DA CAPA.
 *
 * A referência do marketing é creme sobre foto de modelo. As fotos DA CASA
 * são packshot em fundo branco — e creme sobre branco some, foi o que saiu no
 * primeiro teste. Então a tinta é escura, com um halo claro atrás: lê em
 * fundo branco, que é onde as nossas fotos vivem, e continua legível sobre
 * foto clara de modelo.
 */
const COR_TINTA = '#2b2b2b';
const COR_CLARA = '#ffffff';

const FONTE_NOME = 'capa-nome';
const FONTE_MARCA = 'capa-marca';

/** Manuscrita formal, a mais próxima do material que o marketing usa. */
const ARQUIVO_NOME =
  '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff';
/** Geométrica fina, para a marca em caixa alta espaçada. */
const ARQUIVO_MARCA = '@fontsource/jost/files/jost-latin-300-normal.woff';

/**
 * O caminho do arquivo da fonte, resolvido pelo Node.
 *
 * `require.resolve` acha o pacote onde quer que o `node_modules` esteja —
 * raiz, hoisted, dentro do container. Montar o caminho à mão com
 * `path.join(__dirname, '../../..')` quebraria no dia em que o `dist` mudasse
 * de profundidade.
 */
function caminhoDaFonte(arquivo: string): string {
  return require.resolve(arquivo);
}

/**
 * A IMAGEM DE CAPA ESCOLHIDA DO CATÁLOGO — e só a escolhida.
 *
 * ==========================================================================
 * `capaReferenciaId` existe desde a migração 48, para o cartão do painel: a
 * capa é uma das referências de imagem do catálogo, escolhida a dedo. O RF47
 * passa a usá-la como PRIMEIRA PÁGINA do PDF, e é o que resolve a capa que
 * não é peça — ela chega pela Helena, como referência daquele catálogo.
 *
 * O READ-MODEL TEM UM `capaArquivoId` JÁ RESOLVIDO, e ele não serve aqui: na
 * falta de escolha, ele cai na PRIMEIRA referência de imagem que existir. No
 * painel isso é um desenho razoável para um cartão; no PDF faria uma página
 * de catálogo antigo, anexada como material de consulta, abrir a coleção nova
 * sem ninguém ter pedido. Capa de PDF é escolha, nunca sobra.
 *
 * PDF NÃO VIRA CAPA. Referência aceita PDF (catálogo fechado de gráfica), e
 * `doc.image` não embute documento — a página sairia vazia.
 * ==========================================================================
 */
function capaDeReferencia(
  catalogo: CatalogoDetalhe,
): { arquivoId: string | null } | null {
  if (!catalogo.capaReferenciaId) return null;
  const r = catalogo.referencias.find(
    (x) => x.id === catalogo.capaReferenciaId,
  );
  if (!r || r.tipo !== 'IMAGEM' || !r.arquivoId) return null;
  if ((r.mime ?? '').includes('pdf')) return null;
  return { arquivoId: r.arquivoId };
}

/** O nome vira nome de arquivo: sem acento, sem espaço, sem surpresa. */
function semAcento(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'catalogo'
  );
}
