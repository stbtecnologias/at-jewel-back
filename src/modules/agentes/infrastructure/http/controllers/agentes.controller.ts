import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { AnalisarProdutoUseCase } from '../../../application/use-cases/analisar-produto.use-case';
import { ChatAnastasiaUseCase } from '../../../application/use-cases/chat-anastasia.use-case';
import { ChatElenaUseCase } from '../../../application/use-cases/chat-elena.use-case';
import { GerarRelatorioUseCase } from '../../../application/use-cases/gerar-relatorio.use-case';
import { SalvarConversaUseCase } from '../../../application/use-cases/salvar-conversa.use-case';
import { SugerirComprasFeiraUseCase } from '../../../application/use-cases/sugerir-compras-feira.use-case';
import { ListarPromptsUseCase } from '../../../application/use-cases/listar-prompts.use-case';
import { AtualizarPromptUseCase } from '../../../application/use-cases/atualizar-prompt.use-case';
import { ChatDto } from '../dto/chat.dto';
import { GerarRelatorioDto } from '../dto/gerar-relatorio.dto';
import { SalvarConversaDto } from '../dto/salvar-conversa.dto';
import { AtualizarPromptDto } from '../dto/atualizar-prompt.dto';

// Agentes internos do painel. Chamadas de LLM sao PAGAS — throttle apertado
// (20/min/IP) alem do global. Auth por JWT de staff; papeis por rota.
@Controller('agentes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AgentesController {
  constructor(
    private readonly chatAnastasia: ChatAnastasiaUseCase,
    private readonly chatElena: ChatElenaUseCase,
    private readonly gerarRelatorio: GerarRelatorioUseCase,
    private readonly sugerirComprasFeira: SugerirComprasFeiraUseCase,
    private readonly analisarProduto: AnalisarProdutoUseCase,
    private readonly salvarConversa: SalvarConversaUseCase,
    private readonly listarPrompts: ListarPromptsUseCase,
    private readonly atualizarPrompt: AtualizarPromptUseCase,
  ) {}

  // --- Prompts das agentes (configuraveis) — somente ADMIN (RF-USU-03/04) ---

  @Get('prompts')
  @Permissions('prompts:manage')
  async listarPromptsAgentes() {
    return this.listarPrompts.execute();
  }

  @Put('prompts/:agente')
  @Permissions('prompts:manage')
  async atualizarPromptAgente(
    @Param('agente') agente: string,
    @Body() dto: AtualizarPromptDto,
    @Req() req: { user?: { sub?: string } },
  ) {
    await this.atualizarPrompt.execute(agente, dto.systemPrompt, req.user?.sub ?? null);
    return { ok: true };
  }

  // --- Anastasia (analytics) — proprietarias/gerencia ---

  @Post('anastasia/chat')
  @Roles('ADMIN', 'GERENTE')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async anastasiaChat(@Body() dto: ChatDto) {
    return this.chatAnastasia.execute(dto.messages, dto.contexto);
  }

  @Post('anastasia/relatorio')
  @Roles('ADMIN', 'GERENTE')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async anastasiaRelatorio(@Body() dto: GerarRelatorioDto) {
    return this.gerarRelatorio.execute(dto.tipo, {
      dataInicio: dto.data_inicio ? new Date(dto.data_inicio) : undefined,
      dataFim: dto.data_fim ? new Date(dto.data_fim) : undefined,
    });
  }

  @Post('anastasia/sugestoes-feira')
  @Roles('ADMIN', 'GERENTE')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async anastasiaSugestoes() {
    return this.sugerirComprasFeira.execute();
  }

  // --- Elena (catalogo/estoque) — gerencia + vendedoras ---

  @Post('elena/chat')
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async elenaChat(@Body() dto: ChatDto) {
    return this.chatElena.execute(dto.messages, dto.contexto);
  }

  @Get('elena/produto/:produtoId')
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async elenaProduto(@Param('produtoId', ParseUUIDPipe) produtoId: string) {
    return this.analisarProduto.execute(produtoId);
  }

  // --- Persistencia de conversa (qualquer staff) ---

  @Post('conversas')
  @Roles('ADMIN', 'GERENTE', 'VENDEDORA')
  @HttpCode(HttpStatus.CREATED)
  async salvar(@Body() dto: SalvarConversaDto) {
    return this.salvarConversa.execute({
      agente: dto.agente,
      mensagens: dto.mensagens,
      contexto: dto.contexto ?? null,
      clienteId: dto.cliente_id ?? null,
      vendedoraId: dto.vendedora_id ?? null,
    });
  }
}
