import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ARMAZENAMENTO } from '../../../domain/ports/injection-tokens';
import type { IArmazenamento } from '../../../domain/ports/armazenamento.port';
import { S3Armazenamento } from '../../armazenamento/s3.armazenamento';

/**
 * Serve as imagens do catalogo quando o armazenamento e o S3.
 *
 * POR QUE O BACK NO MEIO, E NAO O S3 DIRETO
 *
 * O bucket e PRIVADO. As alternativas seriam deixa-lo publico — e ai uma URL
 * que vaze vale para sempre — ou usar URL pre-assinada, que expira e obrigaria
 * `caminhoPublico` a virar assincrono, mudando a porta e todos os chamadores.
 *
 * Com o proxy, o controle de acesso continua onde ja estava (no CRM), o banco
 * segue guardando so a CHAVE, e o front nao muda uma linha: ele pede
 * `/api/midia/...` como sempre pediu.
 *
 * O custo e banda passando por aqui. Para foto de joia, com o cache de um ano
 * que o `Cache-Control` estabelece, o segundo acesso nem chega.
 *
 * ROTA PUBLICA de proposito. A chave tem UUID, entao nao ha o que adivinhar, e
 * exigir JWT quebraria `<img src>` — o navegador nao manda header em imagem.
 */
@Controller('midia')
export class MidiaController {
  constructor(
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * `*chave` porque a chave tem barras (`catalogo/0331/fotos/uuid.jpg`) e um
   * `:param` comum pararia na primeira.
   */
  @Get('*chave')
  async servir(@Param('chave') partes: string[], @Res() res: Response) {
    // Com disco, o `serveStatic` do main.ts responde antes de chegar aqui.
    if (!(this.armazenamento instanceof S3Armazenamento)) {
      res.status(404).end();
      return;
    }

    const chave = Array.isArray(partes) ? partes.join('/') : String(partes);
    const arquivo = await this.armazenamento.ler(chave);

    res.setHeader('Content-Type', arquivo.mime);
    if (arquivo.tamanho)
      res.setHeader('Content-Length', String(arquivo.tamanho));
    // A chave carrega UUID: o conteudo de uma chave nunca muda, entao o cache
    // pode ser longo e imutavel.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    arquivo.corpo.pipe(res);
  }
}
