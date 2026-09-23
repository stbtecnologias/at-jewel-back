import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientePerfilOrmEntity } from '../clientes/infrastructure/database/typeorm/entities/cliente-perfil.orm-entity';
import { ATENDIMENTO_REPOSITORY } from './domain/ports/injection-tokens';
import { AtendimentoOrmEntity } from './infrastructure/database/typeorm/entities/atendimento.orm-entity';
import { AtendimentoInteracaoOrmEntity } from './infrastructure/database/typeorm/entities/atendimento-interacao.orm-entity';
import { ConversaWhatsappOrmEntity } from './infrastructure/database/typeorm/entities/conversa-whatsapp.orm-entity';
import { AtendimentoRepository } from './infrastructure/database/typeorm/repositories/atendimento.repository';

/**
 * SO A PERSISTENCIA DO ATENDIMENTO, sem nenhum caso de uso — 23/09/2026.
 *
 * ==========================================================================
 * EXISTE PARA QUEBRAR UM CICLO DE MODULO.
 *
 * `AtendimentosModule` importa `LeadsModule` (a ferramenta da gestao encaminha
 * lead). Quando a triagem passou a ABRIR ATENDIMENTO para cliente com
 * cadastro, o modulo de leads precisou do repositorio de atendimentos — e a
 * volta fecharia o ciclo.
 *
 * Este modulo nao importa nem leads nem atendimentos: so as entidades e o
 * repositorio. Os dois lados o importam, e ninguem aponta para o outro.
 *
 * O `AtendimentoRepository` nao importa nada de leads — conferido antes de
 * extrair.
 * ==========================================================================
 *
 * `ClientePerfilOrmEntity` entra porque o repositorio le o perfil para achar o
 * cliente por WhatsApp; e a mesma lista que o `AtendimentosModule` declarava.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AtendimentoOrmEntity,
      AtendimentoInteracaoOrmEntity,
      ConversaWhatsappOrmEntity,
      ClientePerfilOrmEntity,
    ]),
  ],
  providers: [{ provide: ATENDIMENTO_REPOSITORY, useClass: AtendimentoRepository }],
  exports: [ATENDIMENTO_REPOSITORY, TypeOrmModule],
})
export class AtendimentoPersistenciaModule {}
