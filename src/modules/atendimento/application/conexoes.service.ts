import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VENDEDORA_REPOSITORY } from '../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import {
  WahaAdminClient,
  type SessaoListada,
} from '../infrastructure/whatsapp/waha-admin.client';

/** Uma linha da tela de Conexoes. */
export interface Conexao {
  /** O nome da sessao no WAHA. E ele que volta nas rotas seguintes. */
  sessao: string;
  rotulo: string;
  /** null = a loja. */
  vendedoraId: string | null;
  papel: 'LOJA' | 'VENDEDORA' | 'ORFA';
  /** WORKING | SCAN_QR_CODE | STARTING | STOPPED | FAILED | UNKNOWN */
  status: string;
  /** `5585...@c.us` do numero conectado. Null quando nao ha ninguem lido. */
  numero: string | null;
  pushName: string | null;
  /** Quantos chats. Null quando nao conectada ou quando a consulta falhou. */
  chats: number | null;
  /** Ultimo sinal de vida da sessao, em ms. */
  atividadeEm: number | null;
}

const ROTULO_LOJA = 'Loja (Anastasia)';
const PREFIXO = 'vend-';

/** `vend-<uuid>`. O nome da sessao e DERIVADO do id da vendedora. */
const RE_SESSAO_VENDEDORA = new RegExp(
  `^${PREFIXO}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`,
  'i',
);

/**
 * As conexoes de WhatsApp: a da loja, e uma por vendedora.
 *
 * ==========================================================================
 * NAO HA TABELA, E ISSO E DE PROPOSITO.
 *
 * O nome da sessao e DERIVADO do id da vendedora (`vend-<uuid>`), e o estado
 * vem do WAHA, que e quem sabe. Nao ha nada a sincronizar, nada que possa
 * divergir, e nada a migrar.
 *
 * O efeito pratico e o que o Lucas pediu em 08/09: cadastrar uma vendedora
 * nova ja faz a linha dela aparecer aqui, com o botao de Conectar. Ninguem
 * precisa registrar conexao em lugar nenhum.
 * ==========================================================================
 *
 * A LISTA E UNIAO, E NAO SO AS VENDEDORAS ATIVAS. Uma sessao pode continuar
 * conectada depois de a vendedora ser desligada — e um numero ligado que
 * ninguem enxerga e exatamente o que nao pode existir. Essas aparecem como
 * ORFA, para poderem ser desconectadas.
 */
@Injectable()
export class ConexoesService {
  constructor(
    private readonly waha: WahaAdminClient,
    private readonly config: ConfigService,
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
  ) {}

  /** A sessao da LOJA — a unica que fala com a IA. Segue vindo do env. */
  get sessaoDaLoja(): string {
    return this.config.get<string>('WAHA_SESSION') ?? 'default';
  }

  /** O nome da sessao de uma vendedora. Puro: nao consulta nada. */
  nomeDaSessao(vendedoraId: string): string {
    return `${PREFIXO}${vendedoraId}`;
  }

  /** O id da vendedora dentro do nome da sessao, ou null se nao for de uma. */
  vendedoraDaSessao(sessao: string): string | null {
    const m = RE_SESSAO_VENDEDORA.exec(sessao);
    return m ? m[1].toLowerCase() : null;
  }

  /**
   * Confere que o nome de sessao recebido pela rota e um dos nossos.
   *
   * ISTO E BARREIRA DE SEGURANCA, e nao validacao de formulario. O nome entra
   * no CAMINHO da URL do WAHA, com a nossa API key no cabecalho — aceitar
   * qualquer string deixaria uma rota do painel alcancar qualquer endpoint do
   * WAHA. So passam: a sessao da loja, e `vend-<uuid>` de vendedora que
   * existe de fato.
   *
   * 404 e nao 400 de proposito: para quem chama, uma sessao que nao e nossa e
   * uma sessao que nao existe.
   */
  async exigirValida(sessao: string): Promise<void> {
    if (sessao === this.sessaoDaLoja) return;

    const vendedoraId = this.vendedoraDaSessao(sessao);
    if (vendedoraId) {
      const v = await this.vendedoras.buscarPorId(vendedoraId);
      // Desligada ainda passa: a sessao dela pode estar no ar, e desconectar
      // precisa continuar sendo possivel.
      if (v) return;
    }

    throw new NotFoundException('Conexão não encontrada');
  }

  /**
   * A lista da tela: a loja primeiro, as vendedoras ativas depois, e por
   * ultimo as sessoes orfas — se houver.
   */
  async listar(): Promise<Conexao[]> {
    const [sessoes, ativas] = await Promise.all([
      this.waha.listarSessoes(),
      this.vendedoras.listar({ ativo: true }),
    ]);

    const porNome = new Map(sessoes.map((s) => [s.nome, s]));
    const linhas: Conexao[] = [
      montar(this.sessaoDaLoja, ROTULO_LOJA, null, 'LOJA', porNome),
    ];

    for (const v of ativas) {
      if (!v.id) continue;
      const nome = this.nomeDaSessao(v.id);
      linhas.push(montar(nome, `Vendedora: ${v.nome}`, v.id, 'VENDEDORA', porNome));
    }

    // O que sobrou no WAHA e nao casou com ninguem.
    const conhecidas = new Set(linhas.map((l) => l.sessao));
    for (const s of sessoes) {
      if (conhecidas.has(s.nome)) continue;
      linhas.push(
        montar(
          s.nome,
          this.vendedoraDaSessao(s.nome)
            ? 'Vendedora desligada — conexão ainda ativa'
            : `Sessão desconhecida: ${s.nome}`,
          this.vendedoraDaSessao(s.nome),
          'ORFA',
          porNome,
        ),
      );
    }

    // A contagem de chats custa uma chamada por sessao CONECTADA, entao so
    // essas sao consultadas — e em paralelo. `contarChats` ja engole a falha:
    // uma sessao lenta deixa a linha sem numero, nao derruba a tela.
    await Promise.all(
      linhas.map(async (l) => {
        if (l.status !== 'WORKING') return;
        l.chats = await this.waha.contarChats(l.sessao);
      }),
    );

    return linhas;
  }
}

function montar(
  sessao: string,
  rotulo: string,
  vendedoraId: string | null,
  papel: Conexao['papel'],
  porNome: Map<string, SessaoListada>,
): Conexao {
  const s = porNome.get(sessao);
  return {
    sessao,
    rotulo,
    vendedoraId,
    papel,
    // Sessao que nunca foi criada no WAHA nao e erro: e uma vendedora que
    // ainda nao leu o QR. STOPPED e o mesmo estado de quem desconectou.
    status: s?.status ?? 'STOPPED',
    numero: s?.me?.id ?? null,
    pushName: s?.me?.pushName ?? null,
    chats: null,
    atividadeEm: s?.atividadeEm ?? null,
  };
}
