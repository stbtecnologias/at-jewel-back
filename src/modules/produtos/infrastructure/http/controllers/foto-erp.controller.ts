import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FotoErpService } from '../../foto-erp/foto-erp.service';

/**
 * Serve a foto do produto que mora no servidor do ERP.
 *
 * ROTA PUBLICA, de proposito e sem constrangimento: `<img src>` nao manda
 * cabecalho de autenticacao, entao exigir JWT aqui simplesmente quebraria a
 * miniatura. E nao ha o que proteger — a mesma imagem ja esta aberta em HTTP no
 * servidor da Conexa, para quem souber o codigo. Este proxy nao expoe nada que
 * ja nao estivesse exposto; ele existe porque o navegador BLOQUEIA a versao
 * HTTP dentro de uma pagina HTTPS.
 *
 * Vive num controller separado justamente por isso: o `ProdutosController` e
 * todo guardado, e uma rota aberta no meio dele passaria despercebida.
 */
@Controller('produtos')
export class FotoErpController {
  constructor(private readonly fotoErp: FotoErpService) {}

  @Get(':codigo/foto-erp')
  async servir(@Param('codigo') codigo: string, @Res() res: Response) {
    const foto = await this.fotoErp.buscar(codigo);

    if (!foto) {
      // 404 COM CACHE CURTO. Sem o cabecalho, o navegador repete o pedido a
      // cada renderizacao da tabela para as 448 pecas que nao tem imagem.
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(404).end();
      return;
    }

    res.setHeader('Content-Type', foto.mime);
    res.setHeader('Content-Length', String(foto.conteudo.length));
    // UM DIA, e nao um ano: ao contrario da chave com UUID do `/midia`, esta
    // URL e derivada do codigo, e o conteudo dela PODE mudar — o ERP troca a
    // foto da peca sem trocar o codigo.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(foto.conteudo);
  }
}
