import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AGENTES_DATA_REPOSITORY,
  LLM_CLIENT,
} from '../../domain/ports/injection-tokens';
import type { ILlmClient } from '../../domain/ports/llm-client.port';
import type { IAgentesDataRepository } from '../../domain/ports/repositories/agentes-data-repository.port';
import { ELENA_SYSTEM } from '../personas';

@Injectable()
export class AnalisarProdutoUseCase {
  constructor(
    @Inject(LLM_CLIENT)
    private readonly llm: ILlmClient,
    @Inject(AGENTES_DATA_REPOSITORY)
    private readonly dados: IAgentesDataRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(produtoId: string): Promise<{ texto: string; tokens: number }> {
    const p = await this.dados.analisarProduto(produtoId);
    if (!p) throw new NotFoundException('Produto nao encontrado');

    const diasEmEstoque = p.dataEntradaEstoque
      ? Math.round((Date.now() - p.dataEntradaEstoque.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const model =
      this.config.get<string>('ANTHROPIC_MODEL_ELENA') ?? 'claude-sonnet-4-6';

    // O QUE ESTE PROMPT PEDIA ANTES, E POR QUE MUDOU.
    //
    // Ele pedia "1) Análise técnica, 2) Análise de giro, 3) Alertas, 4)
    // Sugestões" com 1500 tokens de teto. Um pedido de relatório em quatro
    // seções, num modelo sem nenhuma regra de formatação — a `ELENA_SYSTEM`
    // manda ser "técnica e detalhista" e não diz nada sobre markdown. O
    // resultado saía com títulos, negrito e TABELAS, dentro de um modal de
    // 32rem onde a tabela quebra em pipes soltos.
    //
    // Na revisão de 10/09/2026 o Yerlon foi direto: "me dá uma agonia, porque
    // eu não entendo nada". Ele não pediu markdown renderizado — pediu texto
    // "menos robotizado, mais fluido".
    //
    // A REGRA DE FORMATO FICA AQUI, e não na `ELENA_SYSTEM`, por dois motivos:
    // aquela persona é editável pelo painel (está no `AGENTES_PROMPT`), então
    // uma regra escrita lá pode ser apagada por quem editar; e ela é
    // compartilhada com o chat, onde uma lista às vezes é a resposta certa.
    // Aqui o formato é sempre o mesmo, e é sempre prosa.
    const prompt = `Escreva um resumo curto desta peça para a vendedora ler no painel.

Peça: ${p.nome}
Categoria: ${p.categoria}
Pedra: ${p.tipoPedra ?? 'não informada'}
Fornecedor: ${p.fornecedor ?? 'não informado'}
Estoque atual: ${p.estoqueAtual} unidade(s)
Dias em estoque: ${diasEmEstoque ?? 'não informado'}
Total de vendas: ${p.totalVendas}
Últimas vendas: ${JSON.stringify(p.ultimasVendas)}
Ocorrências (defeitos/devoluções): ${JSON.stringify(p.ocorrencias)}

Como escrever:
- No máximo três parágrafos curtos, texto corrido.
- SEM markdown: nada de títulos, negrito, asteriscos, hífens de lista ou tabelas. Só frases.
- Os números entram no meio da frase ("parada há 120 dias", "três vendas no último mês"), não em coluna.
- Fale com a vendedora, não sobre ela.

O que cobrir, na ordem, e só o que tiver algo a dizer: o que é a peça e o que a torna vendável; como ela está girando; e o que a vendedora deveria fazer com isso. Se houver defeito ou devolução repetida, isso vem primeiro e em uma frase clara.

Não invente dado que não está acima. Faltando informação, diga que falta.`;

    return this.llm.chat({
      model,
      system: ELENA_SYSTEM,
      // 1500 era teto de relatório. Três parágrafos cabem em bem menos, e o
      // teto menor ataca a outra metade da queixa: "além de estar muito
      // demorado, ela demora muito tempo para poder fazer uma análise". O que
      // o modelo escreve é o que a pessoa espera.
      maxTokens: 500,
      mensagens: [{ role: 'user', content: prompt }],
    });
  }
}
