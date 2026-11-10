import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConexoesService } from '../atendimento/application/conexoes.service';
import { WahaAdminModule } from '../atendimento/waha-admin.module';
import { AvisarMudancaDeConexaoUseCase } from './application/avisar-mudanca-de-conexao.use-case';
import { TelegramClient } from './infrastructure/telegram/telegram.client';
import { OuvinteDeStatusService } from './infrastructure/waha/ouvinte-de-status.service';

/**
 * ==========================================================================
 * O AVISO QUE SAI POR FORA DO WHATSAPP — 10/11/2026.
 *
 * Os chips das agentes nao tem aparelho e deslogam a cada quatorze dias. Na
 * ultima vez ficou TRES DIAS caido, porque a agente fica quieta e ninguem de
 * fora percebe. Este modulo escuta o canal de eventos do WAHA e avisa no
 * Telegram a cada mudanca de estado.
 *
 * TELEGRAM, E NAO WHATSAPP, pelo motivo obvio quando se diz em voz alta: o
 * alarme nao pode dividir destino com o que ele vigia.
 *
 * IMPORTA O `WahaAdminModule`, e nao o `AtendimentoModule`. Aquele e o
 * modulo-folha que existe justamente para quebrar ciclo, e ja exporta o
 * `ConexoesService` — unica coisa daqui que precisa do resto da casa, e so
 * para traduzir o nome da sessao.
 *
 * NASCE DESLIGADO. `TELEGRAM_ALERTAS_ATIVOS=false` e o padrao; desligado, o
 * ouvinte ainda conecta e registra em log o que mandaria. E assim que se mede
 * o barulho antes de deixar sair — o mesmo desenho do `AlertasModule`.
 *
 * AS FABRICAS SAO EXPLICITAS porque as duas classes tem um ultimo parametro
 * com valor padrao — o envio HTTP e a fabrica de socket, trocados no teste.
 * Deixar o Nest resolver isso sozinho o faria procurar um provider para
 * `Function`, e falhar no boot.
 * ==========================================================================
 */
@Module({
  imports: [WahaAdminModule],
  providers: [
    {
      provide: TelegramClient,
      useFactory: (config: ConfigService) => new TelegramClient(config),
      inject: [ConfigService],
    },
    {
      provide: AvisarMudancaDeConexaoUseCase,
      useFactory: (conexoes: ConexoesService, telegram: TelegramClient) =>
        new AvisarMudancaDeConexaoUseCase(conexoes, telegram),
      inject: [ConexoesService, TelegramClient],
    },
    {
      provide: OuvinteDeStatusService,
      useFactory: (
        config: ConfigService,
        avisar: AvisarMudancaDeConexaoUseCase,
        telegram: TelegramClient,
      ) => new OuvinteDeStatusService(config, avisar, telegram),
      inject: [ConfigService, AvisarMudancaDeConexaoUseCase, TelegramClient],
    },
  ],
  exports: [TelegramClient],
})
export class NotificacoesModule {}
