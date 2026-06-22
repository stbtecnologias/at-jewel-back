import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../auth/infrastructure/http/guards/roles.guard';
import { Roles } from '../../../../auth/infrastructure/http/decorators/roles.decorator';
import { WahaAdminClient } from '../../whatsapp/waha-admin.client';

/**
 * Endpoints do painel para gerir a sessao de WhatsApp (WAHA). Fazem proxy para
 * o WAHA — o front nunca ve a API key. Restrito a ADMIN (mesmo padrao das telas
 * de API keys e usuarios).
 */
@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class WhatsappAdminController {
  constructor(private readonly waha: WahaAdminClient) {}

  /** Estado da sessao (desconectado / aguardando QR / conectado + numero). */
  @Get('status')
  async status() {
    return this.waha.status();
  }

  /** Inicia/garante a sessao. O front chama ao clicar em "Conectar". */
  @Post('conectar')
  async conectar() {
    return this.waha.conectar();
  }

  /** QR code (data URL) para escanear. Valido enquanto status = SCAN_QR_CODE. */
  @Get('qr')
  async qr() {
    return { qr: await this.waha.qrDataUrl() };
  }

  /** Lista os chats da sessao conectada. */
  @Get('chats')
  async chats() {
    return this.waha.chats();
  }

  /** Desconecta o numero (logout). */
  @Post('desconectar')
  async desconectar() {
    await this.waha.desconectar();
    return { ok: true };
  }
}
