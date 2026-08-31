import {
  CopyObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import {
  pastaDoCatalogo,
  PASTA_FOTOS,
} from '../../domain/ports/armazenamento.port';
import { S3Armazenamento } from './s3.armazenamento';

/** Guarda o que foi enviado ao S3, para inspecionar depois. */
function makeConfig(valores: Record<string, string | undefined>) {
  return {
    get: (chave: string) => valores[chave],
    getOrThrow: (chave: string) => {
      const v = valores[chave];
      if (v === undefined) throw new Error(`faltou ${chave}`);
      return v;
    },
  } as unknown as ConfigService;
}

describe('S3Armazenamento', () => {
  let armazenamento: S3Armazenamento;
  let enviados: unknown[];

  beforeEach(() => {
    armazenamento = new S3Armazenamento(
      makeConfig({
        AWS_S3_BUCKET: 'atjewel-midia',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'chave',
        AWS_SECRET_ACCESS_KEY: 'segredo',
      }),
    );

    enviados = [];
    // @ts-expect-error — trocando o cliente real por um espiao.
    armazenamento.cliente = {
      send: jest.fn((cmd: unknown) => {
        enviados.push(cmd);
        return Promise.resolve({});
      }),
    };
  });

  describe('guardar', () => {
    it('grava sob a pasta do catalogo, com extensao vinda do MIME', async () => {
      const chave = await armazenamento.guardar(
        {
          conteudo: Buffer.from('x'),
          mime: 'image/jpeg',
          nomeOriginal: 'whatsapp',
        },
        pastaDoCatalogo('0331', PASTA_FOTOS),
      );

      expect(chave).toMatch(/^catalogo\/0331\/fotos\/[0-9a-f-]{36}\.jpg$/);
      expect(enviados[0]).toBeInstanceOf(PutObjectCommand);
    });

    it('o nome do arquivo e um UUID — nao vaza o nome original', async () => {
      const chave = await armazenamento.guardar(
        {
          conteudo: Buffer.from('x'),
          mime: 'image/png',
          nomeOriginal: 'orcamento-cliente-maria.png',
        },
        'catalogo/0331/referencias',
      );

      expect(chave).not.toContain('maria');
      expect(chave).toMatch(/\.png$/);
    });
  });

  describe('mover', () => {
    it('copia para a pasta nova e apaga a antiga, preservando o nome', async () => {
      const nova = await armazenamento.mover(
        'catalogo/pendentes/abc.jpg',
        'catalogo/0331/fotos',
      );

      expect(nova).toBe('catalogo/0331/fotos/abc.jpg');
      expect(enviados[0]).toBeInstanceOf(CopyObjectCommand);
      expect(enviados[1]).toBeInstanceOf(DeleteObjectCommand);
    });

    it('nao faz nada quando a pasta ja e a de destino', async () => {
      const nova = await armazenamento.mover(
        'catalogo/0331/fotos/abc.jpg',
        'catalogo/0331/fotos',
      );

      expect(nova).toBe('catalogo/0331/fotos/abc.jpg');
      expect(enviados).toHaveLength(0);
    });

    it('falhando, devolve a chave ORIGINAL em vez de estourar', async () => {
      // @ts-expect-error — o espiao passa a falhar.
      armazenamento.cliente = {
        send: jest.fn(() => Promise.reject(new Error('NoSuchKey'))),
      };

      const nova = await armazenamento.mover(
        'catalogo/pendentes/abc.jpg',
        'catalogo/0331/fotos',
      );

      // Quem chama grava isto no banco: uma linha apontando para a area de
      // espera e melhor que uma apontando para lugar nenhum.
      expect(nova).toBe('catalogo/pendentes/abc.jpg');
    });
  });

  describe('remover', () => {
    it('engole a falha — remover e idempotente', async () => {
      // @ts-expect-error
      armazenamento.cliente = {
        send: jest.fn(() => Promise.reject(new Error('NoSuchKey'))),
      };

      await expect(
        armazenamento.remover('catalogo/0331/fotos/x.jpg'),
      ).resolves.toBeUndefined();
    });
  });

  describe('caminhoPublico', () => {
    it('devolve caminho RELATIVO, e nao a URL do bucket', async () => {
      // O bucket e privado; quem serve a imagem e o back. Devolver URL do S3
      // aqui exporia o bucket e amarraria o front ao endereco dele.
      expect(armazenamento.caminhoPublico('catalogo/0331/fotos/x.jpg')).toBe(
        '/midia/catalogo/0331/fotos/x.jpg',
      );
    });
  });

  describe('credenciais', () => {
    it('sem chave explicita, deixa o SDK usar a cadeia padrao (IAM Role)', () => {
      // Passar `credentials: undefined` QUEBRARIA a cadeia — em EC2 com role,
      // o SDK precisa que o campo simplesmente nao exista.
      const semChave = new S3Armazenamento(
        makeConfig({ AWS_S3_BUCKET: 'atjewel-midia', AWS_REGION: 'us-east-1' }),
      );

      // @ts-expect-error — lendo a config interna do cliente.
      expect(semChave.cliente.config.credentials).toBeDefined();
    });
  });
});
