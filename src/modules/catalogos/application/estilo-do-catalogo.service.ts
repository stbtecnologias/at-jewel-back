import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ARMAZENAMENTO,
  ESTILO_CATALOGO,
} from '../domain/ports/injection-tokens';
import type { IArmazenamento } from '../domain/ports/armazenamento.port';
import {
  QUEM_USA_PADRAO,
  PALETA_DA_CASA,
  type DirecaoDeArte,
  type IEstiloCatalogo,
} from '../domain/ports/estilo-catalogo.port';
import type { ReferenciaItem } from '../domain/ports/repositories/catalogo-repository.port';
import type { ImagemDeEntrada } from '../domain/ports/tratamento-imagem.port';

/**
 * A direcao de arte do catalogo, lida UMA VEZ e reaproveitada.
 *
 * ==========================================================================
 * SEM OBSERVACAO, NAO HA TEMA — decisao do Lucas em 16/09/2026.
 *
 *   "sem observacao voce deixa branco mesmo."
 *
 * O tema nasce do que o marketing ESCREVEU: as referencias do tipo
 * OBSERVACAO e a observacao anotada em cada pagina de referencia. As paginas
 * sozinhas nao ligam o tema — elas refinam cor e clima de um tema que alguem
 * pediu. Sem texto, `direcao` devolve `null` e o catalogo sai como sempre
 * saiu: branco, grade de oito.
 * ==========================================================================
 *
 * POR QUE UM CACHE: montar de novo o mesmo catalogo nao muda as observacoes,
 * e a resposta seria a mesma. A CHAVE INCLUI A IMPRESSAO DAS REFERENCIAS —
 * trocar a pagina ou o texto no painel tem de invalidar o que foi lido.
 *
 * VIVE EM RAM. Reiniciar perde o cache e custa uma leitura barata.
 */

/** Teto de catalogos lembrados. Sao poucos abertos por vez; o teto e do caso patologico. */
const MAX_CATALOGOS = 50;

/** So imagem entra na leitura: PDF de referencia vira cartao na tela, nao pagina aqui. */
const MIMES_LEGIVEIS = ['image/jpeg', 'image/png', 'image/webp'];

interface Lido {
  impressao: string;
  direcao: DirecaoDeArte;
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
   * O que o marketing escreveu de tema, numa linha — ou `null` quando nao
   * escreveu nada.
   */
  static observacoes(referencias: ReferenciaItem[]): string | null {
    const textos = referencias
      .map((r) => (r.tipo === 'OBSERVACAO' ? r.valor : r.observacao))
      .map((t) => t?.trim())
      .filter((t): t is string => Boolean(t));
    return textos.length ? textos.join('; ') : null;
  }

  /**
   * A direcao de arte deste catalogo, ou `null` quando ele NAO TEM TEMA.
   *
   * NUNCA LANCA, e com observacao nunca devolve `null`: se a leitura falhar
   * ou nao estiver disponivel, a direcao sai do proprio texto — a cena e o
   * que foi escrito, a paleta e a da casa. O tema pedido continua valendo.
   */
  async direcao(
    catalogoId: string,
    referencias: ReferenciaItem[],
  ): Promise<DirecaoDeArte | null> {
    const observacoes = EstiloDoCatalogoService.observacoes(referencias);
    if (!observacoes) return null;

    const paginas = referencias.filter(
      (r) =>
        r.tipo === 'IMAGEM' &&
        r.arquivoId &&
        MIMES_LEGIVEIS.includes(r.mime ?? ''),
    );

    const impressao = this.impressaoDe(paginas, observacoes);
    const lembrado = this.cache.get(catalogoId);
    if (lembrado?.impressao === impressao) return lembrado.direcao;

    const soDoTexto: DirecaoDeArte = {
      cena: observacoes,
      modelo: QUEM_USA_PADRAO,
      paleta: { ...PALETA_DA_CASA },
      frase: null,
    };
    if (!this.leitor.disponivel()) return soDoTexto;

    const lida = await this.leitor.ler(
      await this.carregar(paginas),
      observacoes,
    );
    // FALHA NAO VAI PARA O CACHE: a proxima montagem tenta ler de novo.
    if (!lida) return soDoTexto;

    this.guardar(catalogoId, { impressao, direcao: lida });
    this.logger.log(`Direcao de arte do catalogo ${catalogoId} lida.`);
    return lida;
  }

  /** Esquece o que foi lido — usado quando a referencia muda pela tela. */
  esquecer(catalogoId: string): void {
    this.cache.delete(catalogoId);
  }

  /**
   * A impressao das referencias: o que muda quando o marketing troca uma
   * pagina ou um texto. Ids bastam para o arquivo — o armazenamento nunca
   * sobrescreve uma chave.
   */
  private impressaoDe(paginas: ReferenciaItem[], observacoes: string): string {
    return [...paginas.map((p) => p.arquivoId).sort(), observacoes].join('|');
  }

  private async carregar(
    paginas: ReferenciaItem[],
  ): Promise<ImagemDeEntrada[]> {
    const lidas: ImagemDeEntrada[] = [];
    for (const pagina of paginas) {
      const arquivo = await this.armazenamento.ler(pagina.arquivoId!);
      // Referencia sem arquivo nao e erro: o registro pode ter sobrevivido a
      // uma limpeza do bucket. Segue com as que existem.
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
