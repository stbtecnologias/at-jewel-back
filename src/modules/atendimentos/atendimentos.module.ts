import { AtendimentoPersistenciaModule } from './atendimento-persistencia.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappGatewayModule } from '../atendimento/whatsapp-gateway.module';
import { ClientesModule } from '../clientes/clientes.module';
import { LeadsModule } from '../leads/leads.module';
import { MetasModule } from '../metas/metas.module';
import { ProdutosModule } from '../produtos/produtos.module';
import { CatalogosModule } from '../catalogos/catalogos.module';
import { VendasModule } from '../vendas/vendas.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../agentes/llm.module';
import { TranscricaoModule } from '../transcricao/transcricao.module';
import { ConsultarAgendaVendedoraUseCase } from './application/use-cases/consultar-agenda-vendedora.use-case';
import { ConsultarDesempenhoVendedoraUseCase } from './application/use-cases/consultar-desempenho-vendedora.use-case';
import { AgendarContatoVendedoraUseCase } from './application/use-cases/agendar-contato-vendedora.use-case';
import { ConsultarCarteiraVendedoraUseCase } from './application/use-cases/consultar-carteira-vendedora.use-case';
import { ConsultarProdutosVendedoraUseCase } from './application/use-cases/consultar-produtos-vendedora.use-case';
import { DispararPendenciasUseCase } from './application/use-cases/disparar-pendencias.use-case';
import { ProcessarMensagemGestaoUseCase } from './application/use-cases/processar-mensagem-gestao.use-case';
import { ProcessarMensagemInternaUseCase } from './application/use-cases/processar-mensagem-interna.use-case';
import { EncaminharLeadUseCase } from './application/use-cases/encaminhar-lead.use-case';
import { ProcessarFotoCatalogoUseCase } from './application/use-cases/processar-foto-catalogo.use-case';
import { ResolverVendedoraPorNomeUseCase } from './application/use-cases/resolver-vendedora-por-nome.use-case';
import { RotearMensagemInternaUseCase } from './application/use-cases/rotear-mensagem-interna.use-case';
import { ConsultarAuditoriaUseCase } from './application/use-cases/consultar-auditoria.use-case';
import { ConsultarLinhaDoTempoUseCase } from './application/use-cases/consultar-linha-do-tempo.use-case';
import { ReabrirAtendimentoUseCase } from './application/use-cases/reabrir-atendimento.use-case';
import { EncerrarPorSilencioUseCase } from './application/use-cases/encerrar-por-silencio.use-case';
import { RegistrarContatoWhatsappUseCase } from './application/use-cases/registrar-contato-whatsapp.use-case';
import { AtendimentosController } from './infrastructure/http/controllers/atendimentos.controller';
import { ProcessarRelatoVendedoraUseCase } from './application/use-cases/processar-relato-vendedora.use-case';
import { FerramentasGestaoService } from './application/ferramentas-gestao.service';
import { FerramentasVendedoraService } from './application/ferramentas-vendedora.service';
import { MemoriaConversaService } from './application/memoria-conversa.service';
import { SessaoCatalogoService } from './application/sessao-catalogo.service';
import { RecepcaoService } from './application/recepcao.service';
import { RecepcionarUseCase } from './application/use-cases/recepcionar.use-case';
import { AgendarContatoGestaoUseCase } from './application/use-cases/agendar-contato-gestao.use-case';
import { PendenciasScheduler } from './infrastructure/schedule/pendencias.scheduler';
import {
  ATENDIMENTO_REPOSITORY,
  CONVERSA_WHATSAPP_REPOSITORY,
} from './domain/ports/injection-tokens';
import { AtendimentoInteracaoOrmEntity } from './infrastructure/database/typeorm/entities/atendimento-interacao.orm-entity';
import { AtendimentoOrmEntity } from './infrastructure/database/typeorm/entities/atendimento.orm-entity';
import { ClientePerfilOrmEntity } from '../clientes/infrastructure/database/typeorm/entities/cliente-perfil.orm-entity';
import { AtendimentoRepository } from './infrastructure/database/typeorm/repositories/atendimento.repository';
import { ConversaWhatsappOrmEntity } from './infrastructure/database/typeorm/entities/conversa-whatsapp.orm-entity';
import { ConversaWhatsappRepository } from './infrastructure/database/typeorm/repositories/conversa-whatsapp.repository';

/**
 * Episodios de atendimento (migracao 35) e a linha do tempo de cada um.
 *
 * Sem controller por enquanto: quem escreve aqui e a tool `avisar_vendedora`
 * da Anastasia, e quem le sera o agendador. A tela vem depois.
 */
@Module({
  imports: [
    // ClientePerfilOrmEntity entra so para a Linha do Tempo decifrar o
    // WhatsApp da cliente e levar o ponto ate a conversa. Registrar a
    // entidade AQUI e o que da o repositorio ao `AtendimentoRepository` —
    // sem isto o modulo nem carrega.
    // O repositorio vem daqui, e nao de um provider local: o modulo de LEADS
    // tambem precisa dele desde 23/09 (a triagem abre atendimento), e este
    // modulo importa LeadsModule — provendo nos dois lados existiriam duas
    // instancias da mesma coisa.
    AtendimentoPersistenciaModule,
    TypeOrmModule.forFeature([
      AtendimentoOrmEntity,
      AtendimentoInteracaoOrmEntity,
      ConversaWhatsappOrmEntity,
      ClientePerfilOrmEntity,
    ]),
    // O agendador precisa do nome do cliente, do WhatsApp da vendedora e do
    // gateway de envio. Nenhum destes importa atendimentos — sem ciclo.
    ClientesModule,
    // Encaminhar o lead que terminou a triagem para uma vendedora.
    LeadsModule,
    VendedorasModule,
    // Vendas e metas: o que a vendedora consulta sobre si mesma no canal
    // interno. Os dois sao folhas (so TypeORM e Auth), entao nao ha ciclo.
    VendasModule,
    MetasModule,
    ProdutosModule,
    // Catalogo: o repositorio e o armazenamento vem de la. A foto chega por
    // este modulo, mas o agregado e do catalogo — nao ha segundo repositorio.
    // CatalogosModule nao importa este, entao nao ha ciclo.
    CatalogosModule,
    WhatsappGatewayModule,
    // So o LLM, nao o AgentesModule inteiro: aquele importa ESTE modulo (a
    // tool avisar_vendedora abre atendimento), e o Nest recusa o ciclo.
    LlmModule,
    // Audio da vendedora vira texto no ProcessarMensagemInterna. Modulo folha,
    // nao importa nada — sem risco de ciclo.
    TranscricaoModule,
    // Reconhecimento do ADM pelo telefone (BuscarAdminPorTelefoneUseCase).
    AuthModule,
  ],
  providers: [
    {
      provide: CONVERSA_WHATSAPP_REPOSITORY,
      useClass: ConversaWhatsappRepository,
    },
    DispararPendenciasUseCase,
    ConsultarAgendaVendedoraUseCase,
    ConsultarDesempenhoVendedoraUseCase,
    ConsultarProdutosVendedoraUseCase,
    ConsultarCarteiraVendedoraUseCase,
    AgendarContatoVendedoraUseCase,
    AgendarContatoGestaoUseCase,
    // Memoria de conversa dos DOIS canais. Singleton do Nest — uma instancia
    // para o processo inteiro, que e onde o Map vive.
    MemoriaConversaService,
    FerramentasGestaoService,
    FerramentasVendedoraService,
    PendenciasScheduler,
    ProcessarRelatoVendedoraUseCase,
    ProcessarMensagemInternaUseCase,
    // Memoria curta de "de qual catalogo e essa foto". Singleton, como a
    // MemoriaConversaService — o Map vive no processo.
    SessaoCatalogoService,
    EncaminharLeadUseCase,
    ProcessarFotoCatalogoUseCase,
    ResolverVendedoraPorNomeUseCase,
    ProcessarMensagemGestaoUseCase,
    // A recepcao: o menu do perfil e a memoria do numero digitado depois dele.
    // Singleton pelo mesmo motivo da sessao do catalogo — o Map e do processo.
    RecepcaoService,
    RecepcionarUseCase,
    RotearMensagemInternaUseCase,
    ConsultarAuditoriaUseCase,
    ConsultarLinhaDoTempoUseCase,
    ReabrirAtendimentoUseCase,
    EncerrarPorSilencioUseCase,
    RegistrarContatoWhatsappUseCase,
  ],
  // A leitura de gestao sobre os atendimentos. So JWT: o que sai daqui e o
  // relato da vendedora, e nao ha integracao que precise dele.
  controllers: [AtendimentosController],
  // O controller do webhook interno vive no modulo atendimento (singular).
  // O webhook usa o ROTEADOR, nao os canais direto: e ele que decide se quem
  // escreveu e vendedora, gestao ou ninguem.
  exports: [
    // O MODULO, e nao o token: o Nest nao reexporta provider de outro modulo.
    // Quem importava AtendimentosModule pelo repositorio continua alcancando-o.
    AtendimentoPersistenciaModule,
    // A fila de conversas a ler: o webhook do modulo `atendimento`
    // (singular) enfileira, e o leitor de la consome.
    CONVERSA_WHATSAPP_REPOSITORY,
    ProcessarMensagemInternaUseCase,
    RotearMensagemInternaUseCase,
    // O webhook do modulo `atendimento` (singular) registra por aqui o que
    // passa no numero corporativo de cada vendedora.
    RegistrarContatoWhatsappUseCase,
    // O painel usa AS MESMAS ferramentas da gestao que o WhatsApp usa. Um
    // lugar so, para as duas portas nao divergirem na primeira correcao.
    FerramentasGestaoService,
    FerramentasVendedoraService,
  ],
})
export class AtendimentosModule {}
