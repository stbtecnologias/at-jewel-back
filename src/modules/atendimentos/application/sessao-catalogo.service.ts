import { Injectable, Logger } from '@nestjs/common';

/**
 * Memoria curta da conversa de catalogo no WhatsApp.
 *
 * ==========================================================================
 * DUAS COISAS VIVEM AQUI, E POR MOTIVOS DIFERENTES.
 *
 * 1. O CATALOGO ESCOLHIDO. Quem fotografa 20 pecas de uma colecao nao vai
 *    dizer "e do 0002" vinte vezes. A primeira resposta vale para as fotos
 *    seguintes daquele remetente.
 *
 * 2. AS FOTOS AGUARDANDO CATALOGO. O arquivo do WAHA vive 30 minutos, entao
 *    ele e baixado e gravado ANTES de saber a que catalogo pertence. A linha
 *    no banco, nao: `catalogo_id` e NOT NULL. Entao a foto ja gravada em disco
 *    espera aqui ate a pessoa responder.
 *
 *    O CUSTO ACEITO: reiniciar o processo perde a fila e deixa o arquivo orfao
 *    no disco. E o preco de nao ter, ainda, a tela de "nao classificadas" que
 *    justificaria tornar `catalogo_id` nulavel. Quando essa tela existir, esta
 *    metade do servico sai e vira linha no banco.
 * ==========================================================================
 *
 * Map em memoria, como o `MemoriaConversaService` dos outros dois canais: o
 * processo e unico e a janela e curta. Nao vale um Redis para 30 minutos de
 * "de qual catalogo e essa foto".
 */

/** Janela de validade. Igual ao `WHATSAPP_FILES_LIFETIME` do WAHA, e nao por acaso. */
const JANELA_MS = 30 * 60 * 1000;

/** Teto de fotos penduradas por remetente. Evita fila infinita de quem nunca responde. */
const MAX_PENDENTES = 30;

export interface FotoPendente {
  /** Chave do arquivo JA gravado no armazenamento. */
  arquivoId: string;
  mime: string;
  /** Codigo da peca, quando veio na legenda. */
  codigoErp: string | null;
  parcelas: number | null;
  /**
   * O que sobrou da legenda depois de tirar catalogo, codigo e parcelas:
   * "fundo rosa", "mais claro". Vai para a IA como pedido pontual.
   */
  pedidoDeEstilo?: string | null;
  em: number;
}

interface Sessao {
  catalogoId: string | null;
  catalogoNumero: string | null;
  catalogoNome: string | null;
  pendentes: FotoPendente[];
  atualizadoEm: number;
}

@Injectable()
export class SessaoCatalogoService {
  private readonly logger = new Logger(SessaoCatalogoService.name);
  private readonly sessoes = new Map<string, Sessao>();

  /** Catalogo lembrado da ultima vez, se ainda dentro da janela. */
  catalogoAtual(
    chave: string,
  ): { id: string; numero: string; nome: string } | null {
    const s = this.viva(chave);
    if (!s?.catalogoId) return null;
    return {
      id: s.catalogoId,
      numero: s.catalogoNumero!,
      nome: s.catalogoNome!,
    };
  }

  lembrarCatalogo(
    chave: string,
    catalogo: { id: string; numero: string; nome: string },
  ): void {
    const s = this.viva(chave) ?? this.nova();
    s.catalogoId = catalogo.id;
    s.catalogoNumero = catalogo.numero;
    s.catalogoNome = catalogo.nome;
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
  }

  /**
   * Pendura uma foto ja gravada esperando a resposta de "qual catalogo".
   * @returns false quando a fila daquele remetente estourou.
   */
  pendurar(chave: string, foto: Omit<FotoPendente, 'em'>): boolean {
    const s = this.viva(chave) ?? this.nova();
    if (s.pendentes.length >= MAX_PENDENTES) return false;
    s.pendentes.push({ ...foto, em: Date.now() });
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
    return true;
  }

  temPendentes(chave: string): boolean {
    return (this.viva(chave)?.pendentes.length ?? 0) > 0;
  }

  /** Retira e devolve tudo que estava esperando. */
  recolherPendentes(chave: string): FotoPendente[] {
    const s = this.viva(chave);
    if (!s) return [];
    const fila = s.pendentes;
    s.pendentes = [];
    s.atualizadoEm = Date.now();
    this.sessoes.set(chave, s);
    return fila;
  }

  /**
   * Descarta sessoes vencidas e devolve as chaves de arquivo que ficaram
   * orfas, para quem chamar apagar do disco. E chamado de dentro do fluxo, e
   * nao por agendador: o volume e baixo e um `setInterval` a mais so existiria
   * para varrer um Map quase sempre vazio.
   */
  limpar(): string[] {
    const orfaos: string[] = [];
    const agora = Date.now();
    for (const [chave, s] of this.sessoes) {
      if (agora - s.atualizadoEm <= JANELA_MS) continue;
      for (const p of s.pendentes) orfaos.push(p.arquivoId);
      this.sessoes.delete(chave);
    }
    if (orfaos.length) {
      this.logger.warn(
        `${orfaos.length} foto(s) expiraram sem catalogo informado.`,
      );
    }
    return orfaos;
  }

  private viva(chave: string): Sessao | null {
    const s = this.sessoes.get(chave);
    if (!s) return null;
    if (Date.now() - s.atualizadoEm > JANELA_MS) {
      this.sessoes.delete(chave);
      return null;
    }
    return s;
  }

  private nova(): Sessao {
    return {
      catalogoId: null,
      catalogoNumero: null,
      catalogoNome: null,
      pendentes: [],
      atualizadoEm: Date.now(),
    };
  }
}
