import { Injectable } from '@nestjs/common';
import { nomeDoArquivo, type Relatorio } from '../domain/relatorio';
import { RelatorioPdfService } from '../infrastructure/relatorio-pdf.service';
import { RelatorioXlsxService } from '../infrastructure/relatorio-xlsx.service';
import { UltimoRelatorioService } from './ultimo-relatorio.service';

export type FormatoDeArquivo = 'PDF' | 'PLANILHA';

/** O que viaja até o webhook, pronto para o `enviarArquivo`. */
export interface ArquivoDoAgente {
  conteudo: Buffer;
  mime: string;
  nome: string;
  legenda: string;
}

/**
 * TRANSFORMA A ÚLTIMA RESPOSTA EM ARQUIVO — RF36 e RF37, 21/10/2026.
 *
 * ==========================================================================
 * O PASSO 3 DA CONCEPÇÃO DE 24/09.
 *
 * O modelo chama isto quando ela diz "manda em PDF" ou "me manda a planilha".
 * Ele escolhe **o formato** e, quando quiser, **o título** — e mais nada. Os
 * números vêm do que a ferramenta guardou, sem passar por ele.
 *
 * Vale nos DOIS canais, e isso foi pedido com estas palavras: *"tanto a
 * gestão com a Anastasia como a Helena"*. Por isso ele mora aqui, e não
 * dentro de um dos dois serviços de ferramenta.
 * ==========================================================================
 *
 * SEM NADA GUARDADO, NÃO INVENTA: devolve `null`, e quem chama diz que não há
 * o que mandar. É a diferença entre "não tenho isso" e um PDF vazio — e PDF
 * vazio é pior que nenhum, porque parece resposta.
 */
@Injectable()
export class MontarArquivoUseCase {
  constructor(
    private readonly ultimo: UltimoRelatorioService,
    private readonly pdf: RelatorioPdfService,
    private readonly xlsx: RelatorioXlsxService,
  ) {}

  async execute(
    chave: string | null | undefined,
    formato: FormatoDeArquivo,
    opcoes?: { titulo?: string | null; geradoPor?: string | null },
  ): Promise<ArquivoDoAgente | null> {
    const guardado = this.ultimo.pegar(chave);
    if (!guardado) return null;

    // O TÍTULO DO MODELO É ACEITO, o resto não.
    //
    // Deixá-lo nomear o papel é útil ("Vendas da Camila em outubro") e é
    // seguro: título errado se lê e se corrige, número errado não. Em branco,
    // fica o que a ferramenta já tinha posto.
    const relatorio: Relatorio = {
      ...guardado,
      titulo: opcoes?.titulo?.trim() || guardado.titulo,
      geradoPor: opcoes?.geradoPor ?? guardado.geradoPor,
    };

    const emPdf = formato === 'PDF';
    const conteudo = emPdf
      ? await this.pdf.gerar(relatorio)
      : await this.xlsx.gerar(relatorio);

    return {
      conteudo,
      mime: emPdf ? this.pdf.mime : this.xlsx.mime,
      nome: nomeDoArquivo(relatorio.titulo, emPdf ? 'pdf' : 'xlsx'),
      // A LEGENDA DIZ O QUE É E QUANTAS LINHAS TEM. Chega um ícone de arquivo
      // na conversa; sem uma frase, ela precisa abrir para saber se é o que
      // pediu — e no celular isso é um download e um aplicativo.
      legenda:
        `${relatorio.titulo} — ${relatorio.linhas.length} ` +
        `${relatorio.linhas.length === 1 ? 'linha' : 'linhas'}`,
    };
  }
}
