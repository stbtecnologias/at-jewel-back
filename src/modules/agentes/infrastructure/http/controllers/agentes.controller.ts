import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { TRANSCRICAO_SERVICE } from '../../../../transcricao/domain/ports/injection-tokens';
import {
  LIMITE_BYTES,
  type ITranscricao,
} from '../../../../transcricao/domain/ports/transcricao.port';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
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
// (20/min/IP) alem do global. Auth por JWT de staff; permissoes por rota (RF-USU-01).
@Controller('agentes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
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
    @Inject(TRANSCRICAO_SERVICE)
    private readonly transcricaoService: ITranscricao,
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
  @Permissions('agentes:anastasia')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async anastasiaChat(
    @Body() dto: ChatDto,
    @Req() req: { user?: { sub?: string; email?: string; role?: string } },
  ) {
    // Identidade da usuaria para carimbar demandas registradas via tool (RF-24).
    // O JWT nao traz nome; usa o email como rotulo de fallback.
    //
    // O PAPEL vai junto desde 21/08: e ele que decide se as ferramentas de
    // gestao entram, pelo mesmo criterio do WhatsApp.
    const solicitante =
      req.user?.sub
        ? {
            userId: req.user.sub,
            nomeFallback: req.user.email ?? req.user.sub,
            role: req.user.role,
          }
        : undefined;
    return this.chatAnastasia.execute(dto.messages, dto.contexto, solicitante);
  }

  @Post('anastasia/relatorio')
  @Permissions('agentes:anastasia')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async anastasiaRelatorio(@Body() dto: GerarRelatorioDto) {
    return this.gerarRelatorio.execute(dto.tipo, {
      dataInicio: dto.data_inicio ? new Date(dto.data_inicio) : undefined,
      dataFim: dto.data_fim ? new Date(dto.data_fim) : undefined,
    });
  }

  @Post('anastasia/sugestoes-feira')
  @Permissions('agentes:anastasia')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async anastasiaSugestoes() {
    return this.sugerirComprasFeira.execute();
  }

  // --- Elena (catalogo/estoque) — gerencia + vendedoras ---

  @Post('elena/chat')
  @Permissions('agentes:elena')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async elenaChat(
    @Body() dto: ChatDto,
    @Req() req: { user?: { sub?: string; email?: string; role?: string } },
  ) {
    // O solicitante define o ESCOPO: as ferramentas dela sao montadas sobre a
    // vendedora vinculada a este login. Sem login vinculado, sem ferramenta.
    const solicitante =
      req.user?.sub
        ? {
            userId: req.user.sub,
            nomeFallback: req.user.email ?? req.user.sub,
            role: req.user.role,
          }
        : undefined;
    return this.chatElena.execute(dto.messages, dto.contexto, solicitante);
  }

  @Get('elena/produto/:produtoId')
  @Permissions('agentes:elena')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async elenaProduto(@Param('produtoId', ParseUUIDPipe) produtoId: string) {
    return this.analisarProduto.execute(produtoId);
  }

  // --- Persistencia de conversa (qualquer staff) ---

  // Salvar conversa: quem pode falar com qualquer das agentes pode persistir.
  @Post('conversas')
  @Permissions('agentes:elena', 'agentes:anastasia')
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

  // --- Audio (qualquer staff que fale com alguma agente) ---

  /**
   * Recebe um audio gravado no painel e devolve so o texto.
   *
   * NAO CONVERSA COM AGENTE NENHUMA. Devolver o texto em vez de ja responder e
   * deliberado: a tela poe a transcricao no campo e quem gravou revisa antes de
   * enviar. Vocabulario de joalheria erra facil — "meia aliança", "ródio" — e
   * uma palavra trocada vira uma pergunta diferente, respondida com conviccao.
   *
   * No WhatsApp nao ha essa chance: o audio ja foi, entao la transcreve e
   * processa direto.
   *
   * Nada e gravado: o arquivo fica em memoria (`memoryStorage`), vira texto e
   * o buffer e descartado com a requisicao.
   */
  @Post('transcrever')
  @Permissions('agentes:elena', 'agentes:anastasia')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  // Sem `storage` nem `dest`, o multer guarda em MEMORIA (node_modules/multer/
  // index.js:13-17) — que e exatamente o que queremos. Passar `memoryStorage()`
  // explicito obrigaria a instalar `@types/multer` so para tipar o import.
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: LIMITE_BYTES, files: 1 } }),
  )
  async transcrever(@UploadedFile() arquivo?: ArquivoEnviado) {
    if (!arquivo?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo de áudio no campo "audio".');
    }
    const tipo = (arquivo.mimetype ?? '').split(';')[0].trim();
    if (!tipo.startsWith('audio/') && !tipo.startsWith('video/')) {
      // `video/webm` entra porque o MediaRecorder de alguns navegadores rotula
      // assim mesmo uma gravacao so de audio.
      throw new BadRequestException('Formato não suportado — envie áudio.');
    }

    const texto = await this.transcricaoService.transcrever({
      conteudo: arquivo.buffer,
      mimetype: tipo,
      nomeArquivo: arquivo.originalname,
    });

    if (!texto) {
      throw new UnprocessableEntityException(
        'Não consegui entender o áudio. Tente gravar de novo.',
      );
    }
    return { texto };
  }
}

/**
 * O minimo do arquivo que o multer entrega. Declarado aqui em vez de instalar
 * `@types/multer` so por causa de um tipo — o pacote `multer` ja vem junto do
 * `@nestjs/platform-express`, entao o runtime nunca foi o problema.
 */
interface ArquivoEnviado {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
}
