import { Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
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
  ) {}

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
  async conectar(@Param('sessao') sessao: string) {
    await this.conexoes.exigirValida(sessao);
    return this.waha.conectar(sessao);
  }

  /** QR code (data URL) para escanear. Valido enquanto status = SCAN_QR_CODE. */
  @Get('conexoes/:sessao/qr')
  async qr(@Param('sessao') sessao: string) {
    await this.conexoes.exigirValida(sessao);
    return { qr: await this.waha.qrDataUrl(sessao) };
  }

  /** Os chats da conexao. */
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
   * Entao ela exige `whatsapp:manage` como todas as outras deste controller, e
   * o front busca o arquivo com o token e monta um blob. Custa um componente a
   * mais na tela; a alternativa era deixar conversa de cliente atras de uma URL
   * que se adivinha com um numero de telefone.
   * ==========================================================================
   */
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
  async desconectar(@Param('sessao') sessao: string) {
    await this.conexoes.exigirValida(sessao);
    await this.waha.desconectar(sessao);
    return { ok: true };
  }
}
