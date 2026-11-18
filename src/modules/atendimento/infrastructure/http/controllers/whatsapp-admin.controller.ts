import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { PermissionsService } from '../../../../auth/application/permissions.service';
import { ConexoesService } from '../../../application/conexoes.service';
import { WahaAdminClient } from '../../whatsapp/waha-admin.client';

/**
 * Endpoints do painel para gerir as sessoes de WhatsApp (WAHA). Fazem proxy
 * para o WAHA — o front nunca ve a API key. Exige whatsapp:manage (RF-USU-01).
 *
 * ==========================================================================
 * TODA ROTA COM `:sessao` PASSA POR `exigirValida` ANTES DE QUALQUER COISA.
 *
 * O nome da sessao entra no caminho da URL do WAHA levando a nossa API key
 * junto. Sem essa checagem, uma rota do painel viraria um proxy aberto para o
 * WAHA inteiro. Ver o comentario do `ConexoesService`.
 * ==========================================================================
 */
@Controller('whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('whatsapp:manage')
export class WhatsappAdminController {
  constructor(
    private readonly waha: WahaAdminClient,
    private readonly conexoes: ConexoesService,
    private readonly permissoes: PermissionsService,
  ) {}

  /**
   * A SEGUNDA PORTA, E SO PARA OS NUMEROS DA CASA — 18/11/2026.
   *
   * ====================================================================
   * ELA ADMINISTRA AS VENDEDORAS; AS AGENTES SAO OUTRA COISA.
   *
   * Derrubar a Anastasia cala a agente para a loja inteira, e liga-la e
   * escanear o QR com o telefone da empresa — o cadastro em si. Pedido
   * do Lucas em 18/11, depois de a gerente de vendas ganhar o
   * conectar/desconectar das vendedoras.
   *
   * POR QUE AQUI E NAO NUM `@Permissions`: a regra depende da SESSAO que
   * chega no caminho, e o decorador so enxerga a rota. As tres rotas
   * seguem exigindo `whatsapp:manage` pela classe; esta e uma segunda
   * porta, atravessada so quando a sessao e da casa.
   *
   * ANTES DE CHAMAR O WAHA, sempre: o logout nao tem volta, e recusar
   * depois de derrubar o numero nao desfaz nada.
   * ====================================================================
   */
  private async exigirPoderSobreAgente(
    sessao: string,
    req: { user?: { role?: string } },
  ): Promise<void> {
    if (!this.conexoes.ehDeAgente(sessao)) return;

    const papel = req.user?.role;
    if (papel && (await this.permissoes.possui(papel, 'whatsapp:agentes'))) {
      return;
    }
    throw new ForbiddenException(
      'Este número é de uma agente da loja. Fale com quem administra o WhatsApp.',
    );
  }

  /**
   * A lista da tela: a loja e uma linha por vendedora ativa, com o estado de
   * cada uma. Vendedora cadastrada hoje ja aparece aqui — nao ha cadastro de
   * conexao a fazer.
   */
  @Get('conexoes')
  async listar() {
    return this.conexoes.listar();
  }

  /** Estado de uma conexao (desconectada / aguardando QR / conectada). */
  @Get('conexoes/:sessao/status')
  async status(@Param('sessao') sessao: string) {
    await this.conexoes.exigirValida(sessao);
    return this.waha.status(sessao);
  }

  /** Inicia/garante a sessao. O front chama ao clicar em "Conectar". */
  @Post('conexoes/:sessao/conectar')
  async conectar(
    @Param('sessao') sessao: string,
    @Req() req: { user?: { role?: string } },
  ) {
    await this.conexoes.exigirValida(sessao);
    await this.exigirPoderSobreAgente(sessao, req);
    return this.waha.conectar(sessao);
  }

  /** QR code (data URL) para escanear. Valido enquanto status = SCAN_QR_CODE. */
  @Get('conexoes/:sessao/qr')
  async qr(
    @Param('sessao') sessao: string,
    @Req() req: { user?: { role?: string } },
  ) {
    await this.conexoes.exigirValida(sessao);
    await this.exigirPoderSobreAgente(sessao, req);
    return { qr: await this.waha.qrDataUrl(sessao) };
  }

  /**
   * Os chats da conexao.
   *
   * ========================================================================
   * DAQUI PARA BAIXO E LER CONVERSA, E ISSO E OUTRA PERMISSAO — 17/11/2026.
   *
   * As tres rotas de leitura (`chats`, `mensagens`, `midia`) saem do
   * `whatsapp:manage` da classe e passam a exigir `whatsapp:conversas`.
   * Administrar a conexao e ler o que a vendedora falou com a cliente sao
   * coisas de peso diferente; ver o comentario do catalogo em
   * `auth/domain/permissions.ts`.
   *
   * A NOVA ENTRA SOZINHA, e nao ao lado do `whatsapp:manage`: a lista do
   * decorador e um OU. Listar as duas deixaria o `whatsapp:manage` passando,
   * e o recorte nao valeria nada.
   *
   * O guard usa `getAllAndOverride`, entao a permissao do metodo SUBSTITUI a
   * da classe. O corolario e perigoso: apagar uma destas linhas devolve a
   * rota ao `whatsapp:manage` em silencio, sem erro nenhum. E por isso que
   * `whatsapp-admin.permissoes.spec.ts` le o metadado rota por rota.
   * ========================================================================
   */
  @Permissions('whatsapp:conversas')
  @Get('conexoes/:sessao/chats')
  async chats(@Param('sessao') sessao: string) {
    await this.conexoes.exigirValida(sessao);
    return this.waha.chats(sessao);
  }

  /**
   * O historico de um chat — MEL-16.
   *
   * Vem do WAHA na hora, e nao de tabela nossa: ele ja guarda o historico, e
   * copiar conversa de cliente para o nosso banco e decisao que ninguem tomou.
   */
  @Permissions('whatsapp:conversas')
  @Get('conexoes/:sessao/chats/:chatId/mensagens')
  async mensagens(
    @Param('sessao') sessao: string,
    @Param('chatId') chatId: string,
    @Query('limite') limite?: string,
  ) {
    await this.conexoes.exigirValida(sessao);
    const n = Number(limite);
    // Teto de 300: a tela mostra conversa, nao faz exportacao.
    const quantas = Number.isFinite(n) && n > 0 ? Math.min(n, 300) : 100;
    return this.waha.mensagens(sessao, chatId, quantas);
  }

  /**
   * O arquivo de uma mensagem — foto, audio, video.
   *
   * ==========================================================================
   * ROTA GUARDADA, E POR ISSO O FRONT NAO USA `<img src>` DIRETO.
   *
   * As outras rotas de midia do sistema (`/midia`, `/produtos/:codigo/foto-erp`)
   * sao publicas de proposito: chave com UUID que ninguem adivinha, ou foto que
   * ja esta aberta no servidor do ERP. Aqui e o oposto — e a conversa de uma
   * cliente, e o endereco e adivinhavel (o chatId E o telefone dela).
   *
   * Entao ela e guardada — hoje por `whatsapp:conversas`, a mesma das outras
   * duas rotas de leitura (era `whatsapp:manage` ate 17/11/2026) — e o front
   * busca o arquivo com o token e monta um blob. Custa um componente a mais na
   * tela; a alternativa era deixar conversa de cliente atras de uma URL que se
   * adivinha com um numero de telefone.
   * ==========================================================================
   */
  @Permissions('whatsapp:conversas')
  @Get('conexoes/:sessao/chats/:chatId/mensagens/:mensagemId/midia')
  async midia(
    @Param('sessao') sessao: string,
    @Param('chatId') chatId: string,
    @Param('mensagemId') mensagemId: string,
    @Res() res: Response,
  ) {
    await this.conexoes.exigirValida(sessao);
    const arquivo = await this.waha.midiaDaMensagem(sessao, chatId, mensagemId);

    if (!arquivo) {
      // 404 SEM CACHE. Midia que o WhatsApp ainda nao expirou pode aparecer na
      // proxima tentativa (o WAHA repete o download); cachear o "nao tem"
      // congelaria a foto como ausente pelo resto da sessao do navegador.
      res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: 'Arquivo indisponível — o WhatsApp já o removeu.',
      });
      return;
    }

    res.setHeader('Content-Type', arquivo.mime);
    res.setHeader('Content-Length', String(arquivo.conteudo.length));
    // PRIVADO, e nao `public`: e conversa de cliente. Uma hora basta para
    // rolar a conversa para cima e para baixo sem rebaixar tudo de novo.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(arquivo.conteudo);
  }

  /** Desconecta o numero (logout). */
  @Post('conexoes/:sessao/desconectar')
  async desconectar(
    @Param('sessao') sessao: string,
    @Req() req: { user?: { role?: string } },
  ) {
    await this.conexoes.exigirValida(sessao);
    await this.exigirPoderSobreAgente(sessao, req);
    await this.waha.desconectar(sessao);
    return { ok: true };
  }
}
