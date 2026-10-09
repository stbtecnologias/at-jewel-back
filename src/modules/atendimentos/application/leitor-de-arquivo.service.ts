import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AnexoDaConversa } from '../../agentes/domain/ports/llm-client.port';

/**
 * O ARQUIVO QUE A GESTORA MANDA, VIRANDO ALGO QUE O MODELO LE — 08/10/2026.
 * RF9.
 *
 * ==========================================================================
 * "PERMITIR ENVIAR DOCUMENTOS, IMAGENS, PDFS E PLANILHAS PARA ANALISE
 * FINANCEIRA" — alinhamento interno de 07/10.
 *
 * Medido em 08/10: o webhook extrai IMAGEM e AUDIO, e mais nada. Documento
 * chega e e DESCARTADO na borda, de proposito ("documento, sticker e evento
 * de status caem aqui, e continuam ignorados"). Nao e que a agente nao
 * entenda planilha: o arquivo nao passava da porta.
 * ==========================================================================
 *
 * ==========================================================================
 * TRES CAMINHOS, E A ESCOLHA DE CADA UM TEM MOTIVO.
 *
 *   PDF     -> vai INTEIRO ao modelo, como bloco de documento.
 *   IMAGEM  -> idem, como bloco de imagem.
 *   PLANILHA-> e CONVERTIDA em tabela de texto aqui.
 *
 * O PDF NAO PASSA POR PARSER, e essa foi a decisao mais importante. Um
 * `pdf-parse` devolveria texto corrido — e um relatorio de Posicao de
 * estoque sem COLUNA nao se analisa: "AN24084 37.900 1" e "AN24084 1 37.900"
 * viram a mesma linha, e o markup sai errado sem ninguem perceber. O modelo
 * le PDF nativamente, com a tabela em pe. De quebra, zero dependencia.
 *
 * (O `pdfkit` que existe no projeto so ESCREVE — e o montador de catalogo,
 *  em producao. Ler e outra coisa.)
 *
 * A PLANILHA PRECISA DE BIBLIOTECA porque `.xlsx` e um zip de XML, que o
 * modelo nao abre. Escolhido o `exceljs` e nao o `xlsx` da SheetJS: a
 * SheetJS saiu do npm e a ultima versao publicada la e de 2022, com CVE de
 * prototype pollution.
 * ==========================================================================
 */

/**
 * O TETO E POR TIPO, E CADA NUMERO VEM DE UM LIMITE DA API — 09/10/2026.
 *
 * ==========================================================================
 * ERA UM SO, DE 12 MB, E ESTAVA ERRADO PARA IMAGEM.
 *
 * A API aceita no maximo 10 MB POR IMAGEM **ja em base64**, e base64 infla um
 * terco: 12 MB de arquivo viram 16 MB. Uma foto entre 7,5 e 12 MB passava
 * nesta checagem e era RECUSADA la, com `invalid_request_error` — e, para
 * quem mandou, isso virava "nao consegui" generico, sem dizer que o problema
 * era o tamanho. Teto que nao se anuncia e o pior tipo de teto.
 *
 * Achado em 09/10 ao conferir os limites reais, depois de a gestora mandar um
 * PDF de 143 MB. Esse nao cabe de jeito nenhum — mas o caso da imagem cabia,
 * e ninguem saberia.
 * ==========================================================================
 *
 *   PDF      32 MB e o teto da REQUISICAO INTEIRA. Em base64, 20 MB de
 *            arquivo viram ~26,7 MB e sobram ~5 MB para prompt, ferramentas
 *            e historico — que sao texto, na casa dos KB.
 *
 *   IMAGEM   10 MB em base64, POR IMAGEM. Entao 7 MB de arquivo (~9,3 MB
 *            codificados), com folga.
 *
 *   PLANILHA Nao vai ao modelo como anexo: vira TEXTO aqui, e quem segura o
 *            tamanho e o `MAXIMO_LINHAS`. O teto aqui e so para nao carregar
 *            um arquivo absurdo na memoria antes de descobrir isso.
 */
const MAXIMO_PDF = 20 * 1024 * 1024;
const MAXIMO_IMAGEM = 7 * 1024 * 1024;
const MAXIMO_OUTROS = 20 * 1024 * 1024;

/** Qual teto vale para este arquivo, e o rotulo que entra na frase. */
function tetoDoTipo(mime: string): { bytes: number; oQue: string } {
  if (mime === 'application/pdf') return { bytes: MAXIMO_PDF, oQue: 'PDF' };
  if (IMAGENS.includes(mime)) return { bytes: MAXIMO_IMAGEM, oQue: 'imagem' };
  return { bytes: MAXIMO_OUTROS, oQue: 'arquivo' };
}

/**
 * Teto de linhas da planilha.
 *
 * ==========================================================================
 * O TETO EXISTE, E ELE SE ANUNCIA.
 *
 * Planilha de estoque passa de mil linhas facil, e tudo isso em texto estoura
 * o contexto da conversa — a chamada volta sem resposta ou cortada pelo meio.
 *
 * Mas cortar em silencio e o defeito que a leva de 07/10 inteira existe para
 * nao cometer: a agente diria "o markup medio e 2,1" olhando um terco da
 * planilha, com a mesma confianca de quem viu tudo. Entao o corte vem com a
 * frase, e a frase e o resultado — nao um detalhe do log.
 * ==========================================================================
 */
const MAXIMO_LINHAS = 400;

/** Teto de colunas, pelo mesmo motivo — planilha larga tem coluna vazia a direita. */
const MAXIMO_COLUNAS = 30;

/** Imagens que o modelo aceita. Qualquer outra vira recusa explicada. */
const IMAGENS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const PLANILHAS = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const TEXTOS = ['text/csv', 'text/plain', 'application/csv'];

export interface ArquivoRecebido {
  bytes: Buffer;
  mime: string;
  nome?: string;
}

export interface ArquivoLido {
  /** Quando o modelo le o arquivo direto (PDF, imagem). */
  anexo?: AnexoDaConversa;
  /** Quando o arquivo foi convertido aqui (planilha, CSV). */
  texto?: string;
  /**
   * O que a usuaria tem de ouvir sobre a leitura: o tipo que nao da para
   * ler, o arquivo grande demais, o corte de linhas.
   *
   * NAO E LOG. Vai para a resposta: "li as 400 primeiras de 1.238 linhas" e
   * informacao dela, nao nossa.
   */
  aviso?: string;
}

@Injectable()
export class LeitorDeArquivoService {
  private readonly logger = new Logger(LeitorDeArquivoService.name);

  /**
   * Le o arquivo, ou explica por que nao leu. NUNCA LANCA.
   *
   * Arquivo ilegivel nao pode derrubar a conversa: quem mandou planilha
   * continua esperando resposta, e "nao consegui abrir seu arquivo" e uma
   * resposta. Silencio e que nao e — foi o defeito do audio em 21/08, quem
   * mandava nao recebia nada e nem sabia por que.
   */
  async ler(arquivo: ArquivoRecebido): Promise<ArquivoLido> {
    const nome = arquivo.nome?.trim() || undefined;
    const mime = (arquivo.mime || '').toLowerCase().split(';')[0].trim();

    const teto = tetoDoTipo(mime);
    if (arquivo.bytes.length > teto.bytes) {
      const mb = (arquivo.bytes.length / 1024 / 1024).toFixed(1);
      // A FRASE DIZ O TIPO porque os tetos sao diferentes: sem isso, quem
      // ouviu "o limite e 7 MB" para uma foto acha que vale para a planilha.
      return {
        aviso:
          `Esse ${teto.oQue} tem ${mb} MB e o limite de leitura para ` +
          `${teto.oQue} e ${teto.bytes / 1024 / 1024} MB. Nao consegui abrir.`,
      };
    }

    if (mime === 'application/pdf') {
      return {
        anexo: {
          tipo: 'pdf',
          mime: 'application/pdf',
          base64: arquivo.bytes.toString('base64'),
          nome,
        },
      };
    }

    if (IMAGENS.includes(mime)) {
      return {
        anexo: {
          tipo: 'imagem',
          mime,
          base64: arquivo.bytes.toString('base64'),
          nome,
        },
      };
    }

    if (PLANILHAS.includes(mime) || this.pareceExcel(nome)) {
      return this.lerPlanilha(arquivo.bytes, nome);
    }

    if (TEXTOS.includes(mime) || this.pareceTexto(nome)) {
      return this.lerTexto(arquivo.bytes, nome);
    }

    // DIZ O TIPO. "Nao consigo ler esse arquivo" manda ela tentar de novo com
    // o mesmo formato; dizer qual chegou permite escolher outro.
    return {
      aviso:
        `Esse arquivo chegou como ${mime || 'tipo desconhecido'} e eu nao ` +
        'consigo ler. Eu leio PDF, imagem, planilha do Excel e CSV.',
    };
  }

  /** `.xlsx` sem mime confiavel — o WhatsApp as vezes manda octet-stream. */
  private pareceExcel(nome?: string): boolean {
    return /\.(xlsx|xlsm|xls)$/i.test(nome ?? '');
  }

  private pareceTexto(nome?: string): boolean {
    return /\.(csv|txt|tsv)$/i.test(nome ?? '');
  }

  /**
   * A planilha virando tabela de texto.
   *
   * TODAS AS ABAS, e nao so a primeira: o relatorio do Safira sai com a
   * posicao numa aba e o resumo noutra, e analisar so a primeira responderia
   * sobre metade.
   */
  private async lerPlanilha(
    bytes: Buffer,
    nome?: string,
  ): Promise<ArquivoLido> {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(bytes as unknown as ArrayBuffer);

      const partes: string[] = [];
      const cortes: string[] = [];

      wb.eachSheet((aba) => {
        const linhas: string[] = [];
        const total = aba.actualRowCount;
        let lidas = 0;

        aba.eachRow((linha) => {
          if (lidas >= MAXIMO_LINHAS) return;
          const celulas: string[] = [];
          for (let c = 1; c <= Math.min(aba.actualColumnCount, MAXIMO_COLUNAS); c++) {
            celulas.push(this.celulaEmTexto(linha.getCell(c).value));
          }
          // Linha inteiramente vazia nao vale uma linha do teto.
          if (celulas.some((v) => v !== '')) {
            linhas.push(celulas.join(' | '));
            lidas += 1;
          }
        });

        if (linhas.length === 0) return;

        partes.push(`### Aba "${aba.name}"\n${linhas.join('\n')}`);
        if (total > lidas) {
          cortes.push(`"${aba.name}": li ${lidas} de ${total} linhas`);
        }
      });

      if (partes.length === 0) {
        return { aviso: 'Abri a planilha e ela esta vazia — nao ha linha nenhuma.' };
      }

      return {
        texto: partes.join('\n\n'),
        aviso: cortes.length
          ? `A planilha e maior do que eu consigo ler de uma vez — ${cortes.join('; ')}.`
          : undefined,
      };
    } catch (err) {
      // SEM O NOME DO ARQUIVO NO LOG: nome de relatorio carrega cliente,
      // periodo e as vezes o nome da vendedora.
      this.logger.warn(
        `Falha ao abrir planilha (${bytes.length} bytes): ${err instanceof Error ? err.message : String(err)}`,
      );
      void nome;
      return {
        aviso:
          'Nao consegui abrir essa planilha. Se ela estiver protegida por ' +
          'senha ou num formato antigo, me manda em CSV ou PDF.',
      };
    }
  }

  /**
   * CSV e texto puro — nao precisa de biblioteca nenhuma, e o teto de linhas
   * vale igual.
   */
  private lerTexto(bytes: Buffer, nome?: string): ArquivoLido {
    const todas = bytes.toString('utf8').split(/\r?\n/);
    const cheias = todas.filter((l) => l.trim() !== '');
    const lidas = cheias.slice(0, MAXIMO_LINHAS);

    if (lidas.length === 0) {
      return { aviso: 'O arquivo chegou vazio.' };
    }

    return {
      texto: nome ? `### ${nome}\n${lidas.join('\n')}` : lidas.join('\n'),
      aviso:
        cheias.length > lidas.length
          ? `O arquivo e maior do que eu consigo ler de uma vez — li ` +
            `${lidas.length} de ${cheias.length} linhas.`
          : undefined,
    };
  }

  /**
   * Uma celula virando texto.
   *
   * O EXCELJS DEVOLVE OBJETO para formula, hyperlink, texto rico e erro — e
   * `String(valor)` neles vira "[object Object]", que destroi a coluna
   * inteira em silencio. Cada forma tem de ser aberta.
   *
   * DATA SAI EM ISO CURTO. `new Date().toString()` traz fuso e dia da semana
   * em ingles, e uma coluna de datas assim fica ilegivel na tabela.
   */
  private celulaEmTexto(valor: ExcelJS.CellValue): string {
    if (valor === null || valor === undefined) return '';
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    if (typeof valor === 'object') {
      const v = valor as unknown as Record<string, unknown>;
      // Formula: o que interessa e o RESULTADO, nao a formula.
      if ('result' in v) return this.celulaEmTexto(v.result as ExcelJS.CellValue);
      if ('text' in v) return String(v.text ?? '');
      // Texto rico: pedacos com formatacao diferente, que se concatenam.
      if ('richText' in v && Array.isArray(v.richText)) {
        return v.richText.map((p: { text?: string }) => p.text ?? '').join('');
      }
      if ('error' in v) return String(v.error ?? '');
      if ('hyperlink' in v) return String(v.hyperlink ?? '');
      return '';
    }
    return String(valor);
  }
}
