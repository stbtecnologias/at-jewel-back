import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IArmazenamento } from '../../catalogos/domain/ports/armazenamento.port';
import { ARMAZENAMENTO } from '../../catalogos/domain/ports/injection-tokens';

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
  /**
   * A CHAVE DA NOSSA FOTO, no armazenamento — RF33, 20/10/2026.
   *
   * Quando existe, ela GANHA da `url`: e a foto que a loja subiu, e ela nao
   * da 404. Vem de `produtos.fotoArquivoId`, que desde o RF33 carrega a CAPA
   * de `produto_fotos`.
   */
  chave?: string | null;
  /** A URL da Conexa. So vale quando nao ha foto nossa. */
  url: string | null;
  legenda: string;
}

/** A peca tem de onde tirar imagem? A nossa primeiro. */
function temDeOndeTirar(p: PedidoDeFoto): boolean {
  return !!p.chave || !!p.url;
}

/**
 * Teto de imagens por resposta, e ele DEPENDE DO PEDIDO — 07/10/2026.
 *
 * Cinco numa busca comum: dez fotos de 156 KB viram dez mensagens no
 * WhatsApp de quem só queria uma tabela.
 *
 * Mas quando ela pede *"as que tiverem foto"*, cortar pela metade contraria
 * o próprio pedido — a lista inteira tem foto, e é para vê-las que ela
 * filtrou. Aí o teto é o da página.
 *
 * Pergunta do Lucas que descobriu isso: *"pq as 5 primeiras?"*.
 */
const TETO_DE_FOTOS = 5;
const TETO_QUANDO_ELA_PEDIU = 10;

/** Acima disto a imagem não vale a espera nem o tráfego. */
const SEGUNDOS_DE_ESPERA = 8;

/** Quantas baixar ao mesmo tempo. */
const EM_PARALELO = 4;

/** Quantas CONFERIR ao mesmo tempo. Só cabeçalho, então cabe mais. */
const CONFERINDO_EM_PARALELO = 8;

/**
 * Teto de peças conferidas numa pergunta.
 *
 * "Peças até 50 mil que tenham foto" tem 169 candidatas com URL, e conferir
 * todas leva 4,3s. O teto existe para a pergunta mais aberta não virar uma
 * espera de meio minuto — e, quando ele corta, quem chama DIZ que cortou.
 */
const TETO_DE_CONFERENCIA = 250;

/**
 * Por quanto tempo a resposta da Conexa vale.
 *
 * Foto nova é cadastro, não é evento de minuto — e sem memória a mesma
 * pergunta repetida conferiria as mesmas 169 URLs de novo, de graça.
 */
const VALIDADE_DA_CONFERENCIA_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class FotosDeProdutoService {
  private readonly logger = new Logger(FotosDeProdutoService.name);

  constructor(
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /** O que a Conexa já respondeu: `url -> existe?`, com validade. */
  private readonly conhecidas = new Map<string, { existe: boolean; em: number }>();

  /**
   * Devolve só as fotos que EXISTEM de verdade, na ordem dos pedidos.
   *
   * `tinhamUrl` conta quantas peças sequer têm URL cadastrada — é o que
   * separa "a Conexa não respondeu" de "ninguém fotografou", e as duas coisas
   * viram item diferente na lista do integrador.
   */
  async buscar(
    pedidos: PedidoDeFoto[],
    elaPediuAsFotos = false,
  ): Promise<{
    fotos: FotoDeProduto[];
    tinhamUrl: number;
    cortadas: number;
  }> {
    const comUrl = pedidos.filter(temDeOndeTirar);
    const teto = elaPediuAsFotos ? TETO_QUANDO_ELA_PEDIU : TETO_DE_FOTOS;
    const fila = comUrl.slice(0, teto);
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

  /**
   * QUAIS DELAS TÊM FOTO DE VERDADE — 07/10/2026.
   *
   * Nasceu do pedido do Lucas: *"monta uma tabela de peças até 50 mil, as que
   * tiverem fotos"*. A agente não tinha como atender: a existência da foto
   * não está no banco, está na Conexa.
   *
   * CONFERE COM `HEAD`, e é isso que torna o filtro viável: o servidor
   * responde status e tipo sem mandar a imagem. Medido em 07/10 — das 200
   * joias com saldo até 50 mil, 169 têm URL e **41 têm foto**; conferir as
   * 169 leva 4,3s, e não os 26 MB que o GET traria.
   */
  async quaisTemFoto(
    pedidos: PedidoDeFoto[],
  ): Promise<{ comFoto: PedidoDeFoto[]; conferidas: number; cortadas: number }> {
    const comUrl = pedidos.filter(temDeOndeTirar);
    const fila = comUrl.slice(0, TETO_DE_CONFERENCIA);
    const cortadas = comUrl.length - fila.length;

    const pendentes = [...fila];
    const achados = new Set<string>();
    const trabalhador = async () => {
      for (;;) {
        const pedido = pendentes.shift();
        if (!pedido) return;
        // A NOSSA NAO PRECISA DE CONFERENCIA: a linha em `produto_fotos` so
        // existe porque o upload terminou, e o DELETE apaga as duas coisas
        // juntas. Conferir seria baixar o objeto para saber o que o banco ja
        // diz — e a conferencia existe por causa do 404 da Conexa, que e de
        // quem nao controla o arquivo.
        if (pedido.chave) {
          achados.add(pedido.codigo);
          continue;
        }
        if (await this.existe(pedido.url!)) achados.add(pedido.codigo);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(CONFERINDO_EM_PARALELO, fila.length) },
        trabalhador,
      ),
    );

    return {
      // A ORDEM DA LISTA, de novo: quem conferiu em paralelo nao decide a
      // ordem da tabela — o preco decide.
      comFoto: fila.filter((p) => achados.has(p.codigo)),
      conferidas: fila.length,
      cortadas,
    };
  }

  /** A Conexa tem essa imagem? Só o cabeçalho, e com memória de seis horas. */
  private async existe(url: string): Promise<boolean> {
    const lembrada = this.conhecidas.get(url);
    if (lembrada && Date.now() - lembrada.em < VALIDADE_DA_CONFERENCIA_MS) {
      return lembrada.existe;
    }
    let existe = false;
    try {
      const resp = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(SEGUNDOS_DE_ESPERA * 1000),
      });
      const mime = resp.headers.get('content-type') ?? '';
      existe = resp.ok && mime.startsWith('image/');
    } catch {
      // Rede ruim nao e "nao tem foto" — mas tambem nao pode travar a
      // resposta. Vale como "nao" NESTA pergunta, e nao fica lembrado.
      return false;
    }
    this.conhecidas.set(url, { existe, em: Date.now() });
    return existe;
  }

  private async uma(pedido: PedidoDeFoto): Promise<FotoDeProduto | null> {
    // ======================================================================
    // A NOSSA FOTO GANHA — RF33, 20/10/2026.
    //
    // Ela vem do armazenamento, e nao da rede: nada de 404, nada de timeout,
    // nada de pagina HTML chegando no lugar de imagem. Medido em 20/10: das
    // 320 joias com saldo, 247 tem URL da Conexa e so 55 respondem.
    // ======================================================================
    if (pedido.chave) {
      try {
        const nossa = await this.armazenamento.ler(pedido.chave);
        if (nossa && nossa.conteudo.length > 0) {
          return {
            codigo: pedido.codigo,
            legenda: pedido.legenda,
            conteudo: nossa.conteudo,
            mime: nossa.mime,
          };
        }
        // Linha sem objeto e inconsistencia nossa, nao caminho feliz: merece
        // log, e a peca ainda tenta a do ERP em vez de ficar sem nenhuma.
        this.logger.warn(
          `Foto de ${pedido.codigo} esta na base e nao no armazenamento: ${pedido.chave}`,
        );
      } catch (e) {
        this.logger.warn(
          `Nao consegui ler a foto de ${pedido.codigo}: ${(e as Error).message}`,
        );
      }
      if (!pedido.url) return null;
    }

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
