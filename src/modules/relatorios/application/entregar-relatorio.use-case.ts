import { Injectable } from '@nestjs/common';
import { MontarArquivoUseCase } from './montar-arquivo.use-case';
import { MontarMensagensUseCase } from './montar-mensagens.use-case';
import type { ArquivoDoAgente } from './montar-arquivo.use-case';

export type FormatoPedido = 'PDF' | 'PLANILHA' | 'LISTA';

/**
 * O que viaja até o webhook quando a lista sai pela CONVERSA.
 *
 * É menos que o `ListaEmMensagens` do montador: `preferirArquivo` e
 * `mensagensNecessarias` são decisão daqui, e já foram tomadas quando esta
 * saiu. Quem envia não precisa saber que houve escolha.
 */
export interface ListaEntregue {
  mensagens: string[];
  linhas: number;
  total: number;
}

/** Um arquivo, ou a lista em mensagens — nunca os dois. */
export type RelatorioEntregue =
  | { tipo: 'ARQUIVO'; arquivo: ArquivoDoAgente }
  | ({ tipo: 'LISTA' } & ListaEntregue);

/**
 * POR ONDE A ÚLTIMA LISTA SAI — 28/10/2026.
 *
 * ==========================================================================
 * TRÊS DESTINOS, UMA TABELA: a conversa, o PDF e a planilha.
 *
 * Isto mora num lugar só, e não dentro de cada canal, pelo mesmo motivo que a
 * guarda de `tool_result` vazio mora no funil desde 29/09: *"basta uma
 * esquecer"*. São dois canais hoje — a Anastasia e a Helena —, e a regra de
 * quando a lista vira arquivo tem de ser a mesma nos dois, ou a mesma pergunta
 * responde diferente conforme quem fez.
 * ==========================================================================
 *
 * A REGRA DO ARQUIVO AUTOMÁTICO: pedir a lista e receber dez mensagens é pior
 * que receber um PDF. Acima do teto de mensagens — ver
 * `MontarMensagensUseCase` — a lista vira arquivo SOZINHA, e quem chama diz
 * isso na resposta. O RF-12 limita 30 mensagens por destino por hora, e
 * contas de WhatsApp já foram bloqueadas definitivamente por volume: o teto
 * não é zelo.
 */
@Injectable()
export class EntregarRelatorioUseCase {
  constructor(
    private readonly arquivo: MontarArquivoUseCase,
    private readonly mensagens: MontarMensagensUseCase,
  ) {}

  async execute(
    chave: string | null | undefined,
    formato: FormatoPedido,
    opcoes?: { geradoPor?: string | null },
  ): Promise<RelatorioEntregue | null> {
    if (formato !== 'LISTA') {
      const a = await this.arquivo.execute(chave, formato, opcoes);
      return a ? { tipo: 'ARQUIVO', arquivo: a } : null;
    }

    const lista = this.mensagens.execute(chave);
    if (!lista) return null;

    if (lista.preferirArquivo) {
      // NÃO MANDA PELA METADE, E NÃO RECUSA: o conteúdo é o mesmo, e o PDF
      // leva tudo numa mensagem só. Quem chama recebe um ARQUIVO e diz na
      // resposta que mandou assim porque não caberia em mensagem.
      const a = await this.arquivo.execute(chave, 'PDF', opcoes);
      return a ? { tipo: 'ARQUIVO', arquivo: a } : null;
    }

    return {
      tipo: 'LISTA',
      mensagens: lista.mensagens,
      linhas: lista.linhas,
      total: lista.total,
    };
  }

  /**
   * O QUE A CONVERSA NÃO MOSTROU, SEM NINGUÉM PEDIR — 28/10/2026.
   *
   * ======================================================================
   * *"Por padrão toda lista ou consulta deve listar tudo. Se ela pedir
   * 'traga os últimos 10', aí você limita a quantidade — mas se não tiver,
   * deve vir tudo de uma vez no WhatsApp."* — Lucas, 27/10/2026.
   *
   * É A INVERSÃO. Até aqui a lista inteira era uma ESCOLHA: o modelo tinha
   * de chamar `mandar_relatorio` com LISTA, e antes disso oferecer e esperar
   * a resposta. Dois turnos para entregar o que já estava pronto no primeiro.
   *
   * Agora o padrão é sair. Isto roda DEPOIS da resposta do modelo, no canal,
   * e não depende dele: quem decide é a diferença entre a tabela e o texto
   * (ver `quantasNaoForamMostradas`).
   *
   * NÃO RODA QUANDO JÁ HOUVE ENTREGA — se ela pediu o PDF, ou se o modelo
   * chamou o LISTA por conta própria, mandar de novo duplicaria.
   * ======================================================================
   */
  async oQueFaltou(
    chave: string | null | undefined,
    opcoes?: { geradoPor?: string | null },
  ): Promise<RelatorioEntregue | null> {
    if (this.mensagens.quantasNaoForamMostradas(chave) === 0) return null;
    return this.execute(chave, 'LISTA', opcoes);
  }
}
