import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ARMAZENAMENTO,
  ESTILO_CATALOGO,
} from '../domain/ports/injection-tokens';
import type { IArmazenamento } from '../domain/ports/armazenamento.port';
import type { IEstiloCatalogo } from '../domain/ports/estilo-catalogo.port';
import type { ReferenciaItem } from '../domain/ports/repositories/catalogo-repository.port';
import type { ImagemDeEntrada } from '../domain/ports/tratamento-imagem.port';

/**
 * O estilo do catalogo, lido UMA VEZ e reaproveitado.
 *
 * ==========================================================================
 * POR QUE UM CACHE, E NAO UMA LEITURA POR FOTO.
 *
 * Quem fotografa manda 20 pecas do mesmo catalogo numa tarde. As paginas de
 * referencia sao as mesmas nas 20, e a resposta tambem seria — pagar 20
 * leituras para receber 20 vezes "fundo bege claro, luz quente, titulo
 * serifado" e desperdicio pinto.
 *
 * A CHAVE INCLUI A IMPRESSAO DAS REFERENCIAS, e nao so o id do catalogo:
 * trocar a pagina de referencia no painel tem de invalidar o que foi lido.
 * Sem isso, o marketing trocaria a referencia e o sistema continuaria usando
 * a antiga ate alguem reiniciar o processo.
 *
 * VIVE EM RAM, como a sessao do catalogo e a memoria dos agentes. Reiniciar
 * perde o cache e custa uma leitura barata — nunca trabalho.
 * ==========================================================================
 */

/** Teto de catalogos lembrados. Sao poucos abertos por vez; o teto e do caso patologico. */
const MAX_CATALOGOS = 50;

/** So imagem entra na leitura: PDF de referencia vira cartao na tela, nao pagina aqui. */
const MIMES_LEGIVEIS = ['image/jpeg', 'image/png', 'image/webp'];

interface Lido {
  impressao: string;
  estilo: string | null;
}

@Injectable()
export class EstiloDoCatalogoService {
  private readonly logger = new Logger(EstiloDoCatalogoService.name);
  private readonly cache = new Map<string, Lido>();

  constructor(
    @Inject(ESTILO_CATALOGO)
    private readonly leitor: IEstiloCatalogo,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
  ) {}

  /**
   * O estilo escrito deste catalogo, ou `null` quando nao ha referencia de
   * imagem, o provedor falhou ou a leitura nao esta disponivel.
   *
   * NUNCA LANCA. Estilo e enfeite: sem ele o tratamento segue com os textos
   * das referencias, que e o comportamento de antes.
   */
  async ler(
    catalogoId: string,
    referencias: ReferenciaItem[],
    textos: string | null,
  ): Promise<string | null> {
    const paginas = referencias.filter(
      (r) =>
        r.tipo === 'IMAGEM' &&
        r.arquivoId &&
        MIMES_LEGIVEIS.includes(r.mime ?? ''),
    );
    if (paginas.length === 0 || !this.leitor.disponivel()) return null;

    const impressao = this.impressaoDe(paginas, textos);
    const lembrado = this.cache.get(catalogoId);
    if (lembrado?.impressao === impressao) return lembrado.estilo;

    const carregadas = await this.carregar(paginas);
    if (carregadas.length === 0) return null;

    const estilo = await this.leitor.ler(carregadas, textos);
    this.guardar(catalogoId, { impressao, estilo });
    if (estilo) {
      this.logger.log(`Estilo do catalogo ${catalogoId} lido das referencias.`);
    }
    return estilo;
  }

  /** Esquece o que foi lido — usado quando a referencia muda pela tela. */
  esquecer(catalogoId: string): void {
    this.cache.delete(catalogoId);
  }

  /**
   * A impressao das referencias: o que muda quando o marketing troca uma
   * pagina. Ids e textos bastam — o conteudo do arquivo de uma chave nao muda
   * sem a chave mudar, porque o armazenamento nunca sobrescreve.
   */
  private impressaoDe(
    paginas: ReferenciaItem[],
    textos: string | null,
  ): string {
    return [...paginas.map((p) => p.arquivoId).sort(), textos ?? ''].join('|');
  }

  private async carregar(
    paginas: ReferenciaItem[],
  ): Promise<ImagemDeEntrada[]> {
    const lidas: ImagemDeEntrada[] = [];
    for (const pagina of paginas) {
      const arquivo = await this.armazenamento.ler(pagina.arquivoId!);
      // Referencia sem arquivo nao e erro: o registro pode ter sobrevivido a
      // uma limpeza de disco. Segue com as que existem.
      if (arquivo) {
        lidas.push({ conteudo: arquivo.conteudo, mime: arquivo.mime });
      }
    }
    return lidas;
  }

  private guardar(catalogoId: string, lido: Lido): void {
    if (this.cache.size >= MAX_CATALOGOS && !this.cache.has(catalogoId)) {
      const maisAntigo = this.cache.keys().next();
      if (!maisAntigo.done) this.cache.delete(maisAntigo.value);
    }
    this.cache.set(catalogoId, lido);
  }
}
