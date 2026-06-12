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

    const prompt = `Analise o seguinte produto e forneça insights técnicos e de estoque:

Produto: ${p.nome}
Categoria: ${p.categoria}
Pedra: ${p.tipoPedra ?? 'N/A'}
Fornecedor: ${p.fornecedor ?? 'N/A'}
Estoque atual: ${p.estoqueAtual} unidade(s)
Dias em estoque: ${diasEmEstoque ?? 'N/A'}
Total de vendas: ${p.totalVendas}
Últimas vendas: ${JSON.stringify(p.ultimasVendas)}
Ocorrências (defeitos/devoluções): ${JSON.stringify(p.ocorrencias)}

Forneça: 1) Análise técnica do produto, 2) Análise de giro, 3) Alertas se houver problemas recorrentes, 4) Sugestões para a vendedora.`;

    return this.llm.chat({
      model,
      system: ELENA_SYSTEM,
      maxTokens: 1500,
      mensagens: [{ role: 'user', content: prompt }],
    });
  }
}
