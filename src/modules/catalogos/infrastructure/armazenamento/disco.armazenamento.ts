import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ArquivoParaGuardar,
  IArmazenamento,
} from '../../domain/ports/armazenamento.port';

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Armazenamento em disco — o adaptador de hoje.
 *
 * ==========================================================================
 * POR QUE DISCO, E POR QUE ISSO NAO E DIVIDA.
 *
 * O destino combinado e o S3, e o bucket esta sendo providenciado. Escrever
 * primeiro em disco nao adia a decisao: a porta ja e a definitiva, a chave
 * gravada no banco ja e a que o S3 vai usar, e o adaptador de S3 entra ao lado
 * deste sem tocar em use case, controller ou linha ja gravada.
 * ==========================================================================
 *
 * A CHAVE E UM UUID, e nao o nome que veio do upload. Dois motivos, e o
 * segundo importa mais: nome de arquivo do usuario carrega acento, espaco e
 * `../`, e os arquivos sao servidos por rota estatica — quem adivinhar o nome
 * ve a imagem. UUID nao se adivinha.
 *
 * O diretorio e configuravel por `ARMAZENAMENTO_DIR`; o padrao fica dentro do
 * projeto, que e o que o ambiente local precisa.
 */
@Injectable()
export class DiscoArmazenamento implements IArmazenamento {
  private readonly logger = new Logger(DiscoArmazenamento.name);
  private readonly raiz: string;

  constructor(private readonly config: ConfigService) {
    this.raiz = resolve(
      this.config.get<string>('ARMAZENAMENTO_DIR') ??
        join(process.cwd(), 'armazenamento'),
    );
  }

  async guardar(arquivo: ArquivoParaGuardar, pasta: string): Promise<string> {
    const extensao =
      EXTENSAO_POR_MIME[arquivo.mime] ??
      extname(arquivo.nomeOriginal).toLowerCase() ??
      '';
    const chave = `${pasta}/${randomUUID()}${extensao}`;
    const destino = this.caminhoAbsoluto(chave);

    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, arquivo.conteudo);

    return chave;
  }

  async remover(chave: string): Promise<void> {
    try {
      await unlink(this.caminhoAbsoluto(chave));
    } catch {
      // Arquivo ausente nao e erro: remover e idempotente, e a linha do banco
      // ja foi apagada. Falhar aqui deixaria a base inconsistente por causa de
      // um arquivo que ja nao existe.
      this.logger.debug(`Arquivo ja ausente ao remover: ${chave}`);
    }
  }

  async mover(chave: string, novaPasta: string): Promise<string> {
    const nome = chave.split('/').pop();
    if (!nome) return chave;

    const novaChave = `${novaPasta}/${nome}`;
    if (novaChave === chave) return chave;

    try {
      const destino = this.caminhoAbsoluto(novaChave);
      await mkdir(dirname(destino), { recursive: true });
      await rename(this.caminhoAbsoluto(chave), destino);
      return novaChave;
    } catch (err) {
      // Devolve a chave ORIGINAL: quem chama grava o que vier no banco, e uma
      // linha apontando para o lugar antigo e melhor que uma apontando para
      // lugar nenhum.
      this.logger.error(
        `Falha ao mover ${chave} -> ${novaChave}: ${String(err)}`,
      );
      return chave;
    }
  }

  caminhoPublico(chave: string): string {
    return `/midia/${chave}`;
  }

  /**
   * Resolve a chave dentro da raiz e RECUSA qualquer coisa que escape dela.
   * As chaves sao geradas aqui, entao na pratica nunca escapam — a checagem
   * existe para o dia em que alguem passar uma chave vinda de fora.
   */
  private caminhoAbsoluto(chave: string): string {
    const destino = resolve(this.raiz, chave);
    if (destino !== this.raiz && !destino.startsWith(this.raiz + sep)) {
      throw new Error('Chave de arquivo fora do diretorio de armazenamento');
    }
    return destino;
  }
}
