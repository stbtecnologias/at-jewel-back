import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * A foto do produto no servidor do ERP — e por que ela precisa passar por nos.
 *
 * O endereco e DERIVAVEL DO CODIGO:
 *
 *   http://www.conexatecnologia.com/clientes/ATJewel/<codigo_erp>.png
 *
 * Verificado contra producao em 03/09/2026: responde 200 com PNG de 11 KB a
 * 143 KB. E **HTTPS nao responde nada** — a conexao simplesmente falha.
 *
 * O PAINEL RODA EM HTTPS. Um `<img src="http://...">` ali e conteudo misto: o
 * navegador tenta promover para HTTPS, a Conexa nao atende, e a imagem e
 * bloqueada. Nao existe caminho de "so exibir" — ou o back busca e serve, ou
 * nao ha miniatura.
 *
 * O CACHE NAO E LUXO. A tabela de produtos mostra dezenas de linhas por tela e
 * remonta a cada filtro; sem cache, cada rolagem viraria dezenas de requisicoes
 * a um servidor de terceiro que nao e nosso e nao pediu esse transito.
 *
 * E O CACHE NEGATIVO IMPORTA TANTO QUANTO: 448 pecas nao tem imagem la, e sem
 * lembrar da ausencia o painel bateria na Conexa de novo a cada renderizacao,
 * para receber 404 toda vez.
 */

/** Quanto tempo uma imagem encontrada vale na memoria. */
const TTL_ACHOU = 24 * 60 * 60 * 1000;

/**
 * Quanto tempo uma AUSENCIA vale. Bem menor que o acerto: a peca pode ganhar
 * foto no ERP a qualquer momento, e um dia inteiro sem perceber seria demais.
 */
const TTL_FALTOU = 60 * 60 * 1000;

/**
 * Teto em BYTES, e nao em numero de itens.
 *
 * Contar itens seria enganoso: as fotos da origem variam de 11 KB a mais de
 * 340 KB (medido em 04/09/2026), entao "300 entradas" pode significar 4 MB ou
 * 100 MB. Um orcamento em bytes tem o mesmo custo de codigo e diz a verdade
 * sobre a memoria que este cache pode ocupar.
 *
 * Estourando o teto, o mapa e esvaziado INTEIRO. E um cache, nao um indice:
 * LRU de verdade seria maquinario para um ganho que ninguem mede, e o custo do
 * esvaziamento e reabastecer da origem.
 */
const MAX_BYTES = 64 * 1024 * 1024;

const TIMEOUT_MS = 8000;

interface NoCache {
  conteudo: Buffer | null;
  mime: string;
  ate: number;
}

export interface FotoErp {
  conteudo: Buffer;
  mime: string;
}

@Injectable()
export class FotoErpService {
  private readonly logger = new Logger(FotoErpService.name);
  private readonly cache = new Map<string, NoCache>();
  private bytes = 0;
  private readonly base: string;

  constructor(config: ConfigService) {
    // Configuravel porque ja mudou uma vez: o padrao das fotos na origem mudou
    // em 28/08/2026 sem aviso. Trocar por variavel de ambiente e mais rapido
    // que subir versao.
    this.base =
      config.get<string>('ERP_FOTOS_BASE_URL') ??
      'http://www.conexatecnologia.com/clientes/ATJewel';
  }

  /** Devolve a foto, ou `null` se a peca nao tem imagem na origem. */
  async buscar(codigoErp: string): Promise<FotoErp | null> {
    const codigo = codigoErp.trim().toUpperCase();
    if (!codigo) return null;

    const agora = Date.now();
    const guardado = this.cache.get(codigo);
    if (guardado && guardado.ate > agora) {
      return guardado.conteudo
        ? { conteudo: guardado.conteudo, mime: guardado.mime }
        : null;
    }

    const achado = await this.baixar(codigo);
    this.guardar(codigo, achado, agora);
    return achado;
  }

  private async baixar(codigo: string): Promise<FotoErp | null> {
    // O codigo entra na URL: `encodeURIComponent` porque a base tem codigo com
    // hifen e nada garante que nao apareca um com espaco ou barra.
    const url = `${this.base}/${encodeURIComponent(codigo)}.png`;

    // TIMEOUT OBRIGATORIO. A origem e um servidor de terceiro em HTTP simples;
    // sem prazo, uma conexao pendurada seguraria o pedido do painel ate o
    // navegador desistir, e a tabela ficaria com a linha travada.
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), TIMEOUT_MS);
    try {
      const resposta = await fetch(url, { signal: controle.signal });
      if (!resposta.ok) return null;

      const tipo = resposta.headers.get('content-type') ?? '';
      // A origem serve `.png`, mas confiar no cabecalho dela para devolver ao
      // navegador seria deixar um terceiro escolher o Content-Type de uma
      // resposta nossa. So passa se for imagem.
      const mime = tipo.startsWith('image/') ? tipo.split(';')[0].trim() : 'image/png';

      return { conteudo: Buffer.from(await resposta.arrayBuffer()), mime };
    } catch (erro) {
      // Falha de rede NAO e ausencia de foto. Registrada, e guardada como
      // ausencia so pelo TTL curto — a peca volta a ser tentada em uma hora.
      this.logger.warn(
        `Foto do ERP indisponivel para ${codigo}: ${(erro as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(prazo);
    }
  }

  private guardar(codigo: string, achado: FotoErp | null, agora: number): void {
    const tamanho = achado?.conteudo.length ?? 0;
    if (this.bytes + tamanho > MAX_BYTES) {
      this.cache.clear();
      this.bytes = 0;
    }

    // Sobrescrever uma entrada vencida devolve os bytes dela ao orcamento —
    // sem isto o contador so cresce, e o cache se esvaziaria sozinho a cada
    // rodada de expiracao.
    const anterior = this.cache.get(codigo);
    if (anterior?.conteudo) this.bytes -= anterior.conteudo.length;

    this.bytes += tamanho;
    this.cache.set(codigo, {
      conteudo: achado?.conteudo ?? null,
      mime: achado?.mime ?? 'image/png',
      ate: agora + (achado ? TTL_ACHOU : TTL_FALTOU),
    });
  }
}
