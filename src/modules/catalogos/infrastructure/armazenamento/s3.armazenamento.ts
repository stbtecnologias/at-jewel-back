import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

export interface ArquivoLido {
  corpo: Readable;
  mime: string;
  tamanho?: number;
}

/**
 * Armazenamento no S3. Mesma porta do disco — o que muda e so de onde o byte
 * vem, e por isso nenhuma linha ja gravada precisa ser reescrita: o banco
 * guarda a CHAVE (`catalogo/0331/fotos/uuid.jpg`), que vale nos dois mundos.
 *
 * O BUCKET E PRIVADO, E O BACK SERVE AS IMAGENS.
 *
 * `caminhoPublico` continua devolvendo `/midia/<chave>`, e um controller busca
 * o objeto e devolve. Custa banda no back — pouca, para foto de joia — e paga
 * com duas coisas: o controle de acesso continua no CRM, e uma URL que vaze nao
 * vale para sempre, porque nao existe URL do S3 exposta.
 *
 * CREDENCIAL: se `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` nao estiverem no
 * ambiente, o SDK procura sozinho a IAM Role da instancia — que e o caminho
 * preferivel em EC2, porque a credencial e temporaria e rotacionada, e nao ha
 * segredo em arquivo nenhum. O codigo e o mesmo nos dois casos.
 */
@Injectable()
export class S3Armazenamento implements IArmazenamento {
  private readonly logger = new Logger(S3Armazenamento.name);
  private readonly cliente: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.cliente = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'us-east-1',
      // Sem chave explicita, o SDK cai na cadeia padrao (IAM Role, perfil,
      // variaveis do ambiente). Passar `undefined` aqui QUEBRARIA essa cadeia,
      // por isso o objeto so entra quando as duas existem.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async guardar(arquivo: ArquivoParaGuardar, pasta: string): Promise<string> {
    const extensao =
      EXTENSAO_POR_MIME[arquivo.mime] ??
      extname(arquivo.nomeOriginal).toLowerCase() ??
      '';
    const chave = `${pasta}/${randomUUID()}${extensao}`;

    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: arquivo.conteudo,
        ContentType: arquivo.mime,
        // Um ano: a chave tem UUID, entao o conteudo de uma chave nunca muda.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return chave;
  }

  async remover(chave: string): Promise<void> {
    try {
      await this.cliente.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }),
      );
    } catch (err) {
      // Remover e idempotente: a linha do banco ja foi apagada, e falhar aqui
      // por causa de um arquivo que ja nao existe deixaria a base inconsistente.
      this.logger.debug(`Falha ao remover ${chave} (ignorada): ${String(err)}`);
    }
  }

  async mover(chave: string, novaPasta: string): Promise<string> {
    const nome = chave.split('/').pop();
    if (!nome) return chave;

    const novaChave = `${novaPasta}/${nome}`;
    if (novaChave === chave) return chave;

    try {
      await this.cliente.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          // `CopySource` inclui o bucket e precisa vir com escape — nome de
          // arquivo com caractere especial quebraria a chamada em silencio.
          CopySource: encodeURI(`${this.bucket}/${chave}`),
          Key: novaChave,
        }),
      );
      await this.cliente.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }),
      );
      return novaChave;
    } catch (err) {
      // Origem sumiu ou a copia falhou: devolve a chave ORIGINAL. Quem chama
      // grava essa chave no banco, e uma linha apontando para o lugar antigo e
      // melhor que uma apontando para lugar nenhum.
      this.logger.error(
        `Falha ao mover ${chave} -> ${novaChave}: ${String(err)}`,
      );
      return chave;
    }
  }

  async ler(chave: string): Promise<{ conteudo: Buffer; mime: string } | null> {
    try {
      const lido = await this.lerStream(chave);
      const partes: Buffer[] = [];
      for await (const c of lido.corpo) partes.push(c as Buffer);
      return { conteudo: Buffer.concat(partes), mime: lido.mime };
    } catch {
      return null;
    }
  }

  caminhoPublico(chave: string): string {
    return `/midia/${chave}`;
  }

  /**
   * Le o objeto para o controller de `/midia` devolver ao navegador.
   *
   * Fora da porta `IArmazenamento` de proposito: o adaptador de disco nao
   * precisa disso — la o `serveStatic` do Express resolve.
   */
  async lerStream(chave: string): Promise<ArquivoLido> {
    try {
      const saida = await this.cliente.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: chave }),
      );
      if (!saida.Body) throw new Error('objeto sem corpo');

      return {
        corpo: saida.Body as Readable,
        mime: saida.ContentType ?? 'application/octet-stream',
        tamanho: saida.ContentLength,
      };
    } catch (err) {
      this.logger.debug(
        `Arquivo nao encontrado no S3: ${chave} (${String(err)})`,
      );
      throw new NotFoundException('Arquivo nao encontrado');
    }
  }
}
