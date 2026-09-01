import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
// PRESO NO 7, E NAO POR PREGUICA DE ATUALIZAR: o `archiver@8` e ESM puro
// (`"type": "module"`, sem a funcao-fabrica) e este projeto compila para
// CommonJS. Do 8 em diante so daria para carrega-lo com `await import()` no
// meio do fluxo. Subir de versao aqui exige antes decidir sobre o modulo do
// projeto inteiro.
import archiver from 'archiver';
import type { Readable } from 'node:stream';
import type { IArmazenamento } from '../../domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type {
  FotoItem,
  ICatalogoRepository,
  ReferenciaItem,
} from '../../domain/ports/repositories/catalogo-repository.port';

/**
 * O parcelado a partir do a vista.
 *
 * ==========================================================================
 * ESTA REGRA TEM UM GEMEO NO FRONT (`esboco.tsx`, `parcelaDe`), e os dois
 * precisam mudar juntos. Nao ha pacote compartilhado entre os repositorios,
 * entao a duplicacao e consciente — e este comentario e o unico aviso.
 *
 * Verificada em 25 de 25 pecas no levantamento de 20/08/2026: o total
 * parcelado e o a vista dividido por 0,80 (10X) ou por 0,90 (6X). Por isso o
 * sistema guarda UM preco e calcula o outro; nao existem dois campos.
 * ==========================================================================
 */
function parcelaDe(precoAVista: number, parcelas: number): number {
  const fator = parcelas === 6 ? 0.9 : 0.8;
  return precoAVista / fator / parcelas;
}

/**
 * O separador do CSV e `;`, e nao `,`.
 *
 * O Excel em portugues usa a virgula como separador DECIMAL, entao um CSV
 * separado por virgula abre com tudo na primeira coluna. Quem recebe isto e o
 * marketing, num Windows em pt-BR — o arquivo tem de abrir clicando.
 */
const SEPARADOR = ';';

/**
 * BOM de UTF-8. Sem ele o Excel le o arquivo como Latin-1 e "BRINCO DIAMANTE"
 * chega correto, mas "RUBI E OURO AMARELO 18K · Á VISTA" vira mojibake em
 * qualquer acento. Tres bytes que decidem se o arquivo parece profissional.
 */
const BOM = '﻿';

const COLUNAS = [
  'Ordem',
  'Arquivo',
  'Código',
  'Descrição',
  'Preço à vista',
  'Parcelas',
  'Valor da parcela',
];

export interface Exportacao {
  nomeArquivo: string;
  arquivo: Readable;
}

/**
 * As fotos do catalogo empacotadas para o marketing montar a peca fora.
 *
 * ==========================================================================
 * POR QUE ISTO EXISTE, se a IA vai montar o catalogo.
 *
 * Sao os DOIS CAMINHOS previstos desde a migracao 42: ou a IA monta a peca
 * final, ou o marketing monta no InDesign e devolve o arquivo pronto. O
 * segundo nao e plano B — e o caminho de quem ja tem identidade visual e
 * ferramenta, e nao vai trocar isso por um gerador.
 * ==========================================================================
 *
 * O DESCRITIVO VAI JUNTO, E E METADE DO VALOR DISTO. Mandar so as imagens
 * obrigaria alguem a redigitar codigo, preco e parcelamento de trinta pecas
 * olhando outra tela — e digitacao de preco e exatamente onde o erro custa
 * dinheiro. O CSV sai do mesmo dado que a tela mostra.
 *
 * SO ENTRA O QUE FOI APROVADO. Uma foto ainda em aprovacao nao e catalogo, e
 * mandar para o marketing seria publicar pela porta dos fundos o que ninguem
 * aprovou. REPROVADA tambem fica de fora: a curadoria ja disse que ela nao
 * entra nesta edicao.
 */
@Injectable()
export class ExportarCatalogoUseCase {
  private readonly logger = new Logger(ExportarCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly repositorio: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  async execute(catalogoId: string): Promise<Exportacao> {
    const catalogo = await this.repositorio.buscarPorId(catalogoId);
    if (!catalogo) throw new NotFoundException('Catálogo não encontrado');

    const fotos = catalogo.fotos.filter((f) => f.status === 'APROVADA');
    if (fotos.length === 0) {
      // 400 com o motivo, e nao um zip vazio: zip de 22 bytes chegando no
      // e-mail do marketing parece falha de download, e a pessoa tenta de novo
      // em vez de ir aprovar as fotos.
      throw new BadRequestException(
        'Nenhuma foto aprovada neste catálogo. Aprove as fotos na conversa do WhatsApp antes de exportar.',
      );
    }

    const zip = archiver('zip', { zlib: { level: 6 } });

    // JPEG e PNG ja sao comprimidos: nivel 9 gastaria CPU para ganhar quase
    // nada. O 6 e o padrao e existe aqui so para a escolha ser visivel.

    zip.on('warning', (err) => {
      // ENOENT em `warning` e arquivo que faltou, nao falha do zip. Logamos e
      // seguimos: melhor entregar 29 fotos do que nenhuma.
      this.logger.warn(`Aviso ao montar o zip: ${err.message}`);
    });
    zip.on('error', (err) => {
      this.logger.error(`Falha ao montar o zip: ${err.message}`);
    });

    // AS IMAGENS PRIMEIRO, E O CSV DEPOIS — nesta ordem por necessidade, e nao
    // por gosto: o nome de cada arquivo depende do mime, que so se conhece ao
    // LER do armazenamento. Montando o CSV antes, a coluna "Arquivo" diria
    // `.png` para uma foto que e `.jpg`, e quem monta procuraria um arquivo
    // que nao existe.
    //
    // A leitura e EM SERIE de proposito: trinta leituras simultaneas no S3
    // subiriam o pico para trinta imagens de uma vez; em serie o zip vai
    // escrevendo enquanto lemos, e a memoria fica constante.
    const empacotadas: { foto: FotoItem; nome: string }[] = [];

    for (const foto of fotos) {
      if (!foto.arquivoId) continue;
      const lida = await this.armazenamento.ler(foto.arquivoId);
      if (!lida) {
        // Segue em frente: entregar 29 fotos e melhor que falhar as 30. O
        // CSV vai listar so as que entraram, entao ele nunca promete arquivo
        // que nao esta no zip.
        this.logger.warn(`Foto ${foto.id} sem arquivo no armazenamento.`);
        continue;
      }
      const nome = this.nomeDaFoto(foto, empacotadas.length, lida.mime);
      zip.append(lida.conteudo, { name: nome });
      empacotadas.push({ foto, nome });
    }

    zip.append(BOM + this.montarCsv(empacotadas), { name: 'descritivo.csv' });

    await this.anexarReferencias(zip, catalogo.referencias);

    // NAO PODE TER `await`: `finalize` so termina quando alguem consome o
    // stream, e quem consome e o controller. Esperar aqui travaria a
    // requisicao para sempre.
    void zip.finalize();

    return {
      nomeArquivo: `catalogo-${catalogo.numero}-${this.semAcento(catalogo.nome)}.zip`,
      arquivo: zip,
    };
  }

  /**
   * As páginas de catálogos anteriores, numa pasta à parte.
   *
   * ==========================================================================
   * VAI JUNTO PORQUE QUEM MONTA PRECISA DO PADRÃO, e não só das peças. Fonte,
   * composição, respiro entre foto e texto — nada disso está nas imagens das
   * peças nem no CSV; está nas páginas antigas, que são justamente o material
   * que o marketing cadastrou aqui para servir de referência.
   *
   * EM PASTA SEPARADA, e este é o ponto delicado: solta na raiz, uma página de
   * catálogo antigo ficaria lado a lado com as peças novas e poderia acabar
   * publicada como se fosse uma delas. A pasta é o que diz "isto é apoio".
   * ==========================================================================
   *
   * As referências de TEXTO (fonte, composição, observação) não entram — elas
   * são uma linha de instrução cada, e virariam um arquivo com três frases.
   * Quem quiser vê-las tem a tela.
   */
  private async anexarReferencias(
    zip: archiver.Archiver,
    referencias: ReferenciaItem[],
  ): Promise<void> {
    const imagens = referencias.filter((r) => r.tipo === 'IMAGEM' && r.arquivoId);

    for (const [i, ref] of imagens.entries()) {
      const lida = await this.armazenamento.ler(ref.arquivoId!);
      if (!lida) {
        this.logger.warn(`Referência ${ref.id} sem arquivo no armazenamento.`);
        continue;
      }
      const ordem = String(i + 1).padStart(2, '0');
      const base = this.semAcento(ref.valor.replace(/\.[^.]+$/, '')) || 'pagina';
      const extensao =
        lida.mime === 'image/jpeg' ? 'jpg' : lida.mime.split('/')[1] || 'png';
      zip.append(lida.conteudo, {
        name: `referencias/${ordem}-${base}.${extensao}`,
      });
    }
  }

  /**
   * `01-BR26252.png`.
   *
   * A ORDEM VAI NO NOME porque e informacao: e a sequencia em que as pecas
   * entram no catalogo, e o explorador de arquivos ordena por nome. Sem o
   * prefixo, quem monta receberia trinta arquivos em ordem alfabetica de
   * codigo — que nao e ordem nenhuma.
   *
   * Zero a esquerda para 10 nao vir antes de 2.
   */
  private nomeDaFoto(foto: FotoItem, indice: number, mime: string): string {
    const ordem = String(indice + 1).padStart(2, '0');
    const codigo = foto.codigoErp ?? 'sem-codigo';
    const extensao = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
    return `${ordem}-${codigo}.${extensao}`;
  }

  private montarCsv(itens: { foto: FotoItem; nome: string }[]): string {
    const linhas = [COLUNAS.join(SEPARADOR)];

    for (const [i, { foto, nome }] of itens.entries()) {
      const temPreco = foto.precoAVista !== null && foto.parcelas !== null;
      linhas.push(
        [
          String(i + 1),
          nome,
          foto.codigoErp ?? '',
          foto.descricao ?? '',
          temPreco ? this.emReais(foto.precoAVista!) : '',
          foto.parcelas !== null ? String(foto.parcelas) : '',
          temPreco
            ? this.emReais(parcelaDe(foto.precoAVista!, foto.parcelas!))
            : '',
        ]
          .map((c) => this.escapar(c))
          .join(SEPARADOR),
      );
    }

    // CRLF: e o que o Excel espera, e o que sobrevive a abrir no Bloco de Notas.
    return linhas.join('\r\n');
  }

  /**
   * Campo com `;`, aspas ou quebra de linha vai entre aspas, e as aspas de
   * dentro dobram. E a regra do RFC 4180 — e ela existe porque uma descricao
   * como `BRINCO 18K; 5,80G` quebraria a linha em duas colunas sem isto.
   */
  private escapar(campo: string): string {
    if (!/[;"\r\n]/.test(campo)) return campo;
    return `"${campo.replace(/"/g, '""')}"`;
  }

  /** `44.900,00` — sem o símbolo, que atrapalha a soma na planilha. */
  private emReais(valor: number): string {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** Nome de arquivo sem acento e sem espaço: alguns clientes de e-mail e o
   *  Windows mais antigo ainda tropeçam neles. */
  private semAcento(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }
}
