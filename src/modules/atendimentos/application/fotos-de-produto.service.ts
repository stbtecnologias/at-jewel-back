import { Injectable, Logger } from '@nestjs/common';

/**
 * A FOTO DA PEÇA, BAIXADA DA CONEXA — 07/10/2026.
 *
 * ==========================================================================
 * A URL EXISTE; A FOTO, QUASE NUNCA.
 *
 * A reunião de 06/10 pediu "as fotos corretas dos produtos **ou avisar
 * quando estiverem indisponíveis**". A segunda metade do pedido é a que
 * importa, e só medindo dá para entender por quê.
 *
 * Baixei em 07/10 as 546 peças com saldo, uma a uma:
 *
 *            tem foto   404   sem URL
 *   JEWEL        55     192      73      (17%)
 *   HOME        138      44      28      (66%)
 *   total       196     245     105      (36%)
 *
 * E na joia a cobertura cai com o preço: das peças até 5 mil, três têm foto.
 * Como a tabela por faixa vem do mais barato para o mais caro, as primeiras
 * da lista são justamente as sem foto.
 *
 * ENTÃO O 404 É CAMINHO FELIZ, e não erro: é o caso comum. Nada aqui lança,
 * nada aqui falha a resposta — a peça sem foto sai com o texto, e o texto
 * diz quantas vieram.
 * ==========================================================================
 */

export interface FotoDeProduto {
  codigo: string;
  legenda: string;
  conteudo: Buffer;
  mime: string;
}

export interface PedidoDeFoto {
  codigo: string;
  url: string | null;
  legenda: string;
}

/**
 * Teto de imagens por resposta.
 *
 * Dez fotos de 156 KB viram dez mensagens no WhatsApp de quem só queria uma
 * tabela. Cinco é o que cabe sem virar enxurrada — e, quando o teto corta, o
 * texto DIZ que cortou: a lição do dia inteiro.
 */
const TETO_DE_FOTOS = 5;

/** Acima disto a imagem não vale a espera nem o tráfego. */
const SEGUNDOS_DE_ESPERA = 8;

/** Quantas baixar ao mesmo tempo. */
const EM_PARALELO = 4;

@Injectable()
export class FotosDeProdutoService {
  private readonly logger = new Logger(FotosDeProdutoService.name);

  /**
   * Devolve só as fotos que EXISTEM de verdade, na ordem dos pedidos.
   *
   * `tinhamUrl` conta quantas peças sequer têm URL cadastrada — é o que
   * separa "a Conexa não respondeu" de "ninguém fotografou", e as duas coisas
   * viram item diferente na lista do integrador.
   */
  async buscar(pedidos: PedidoDeFoto[]): Promise<{
    fotos: FotoDeProduto[];
    tinhamUrl: number;
    cortadas: number;
  }> {
    const comUrl = pedidos.filter((p) => !!p.url);
    const fila = comUrl.slice(0, TETO_DE_FOTOS);
    const cortadas = comUrl.length - fila.length;

    const achadas: FotoDeProduto[] = [];
    const pendentes = [...fila];
    const trabalhador = async () => {
      for (;;) {
        const pedido = pendentes.shift();
        if (!pedido) return;
        const foto = await this.uma(pedido);
        if (foto) achadas.push(foto);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(EM_PARALELO, fila.length) }, trabalhador),
    );

    // A ordem da lista, e não a de quem chegou primeiro: a legenda da foto
    // tem de casar com a ordem do texto que a agente acabou de escrever.
    const posicao = new Map(fila.map((p, i) => [p.codigo, i]));
    achadas.sort(
      (a, b) => (posicao.get(a.codigo) ?? 0) - (posicao.get(b.codigo) ?? 0),
    );

    return { fotos: achadas, tinhamUrl: comUrl.length, cortadas };
  }

  private async uma(pedido: PedidoDeFoto): Promise<FotoDeProduto | null> {
    try {
      const resp = await fetch(pedido.url!, {
        signal: AbortSignal.timeout(SEGUNDOS_DE_ESPERA * 1000),
      });
      const mime = resp.headers.get('content-type') ?? '';
      // O 404 da Conexa vem com PÁGINA HTML e status 404 — mandar isso como
      // imagem entregaria lixo ao WhatsApp. Confere o status E o tipo.
      if (!resp.ok || !mime.startsWith('image/')) return null;

      const conteudo = Buffer.from(await resp.arrayBuffer());
      if (conteudo.length === 0) return null;

      return {
        codigo: pedido.codigo,
        legenda: pedido.legenda,
        conteudo,
        mime,
      };
    } catch (e) {
      // Rede caída ou lentidão da Conexa não podem derrubar a resposta: a
      // peça sai sem foto, como as outras duas de cada três.
      this.logger.warn(
        `Foto de ${pedido.codigo} nao veio: ${(e as Error).message}`,
      );
      return null;
    }
  }
}
