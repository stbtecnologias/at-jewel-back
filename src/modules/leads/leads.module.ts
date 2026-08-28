import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClientesModule } from '../clientes/clientes.module';
import { RegistrarLeadUseCase } from './application/use-cases/registrar-lead.use-case';
import { LEAD_REPOSITORY } from './domain/ports/injection-tokens';
import { LeadOrmEntity } from './infrastructure/database/typeorm/entities/lead.orm-entity';
import { LeadRepository } from './infrastructure/database/typeorm/repositories/lead.repository';
import { LeadsController } from './infrastructure/http/controllers/leads.controller';

/**
 * Leads: a triagem da Anastasia antes de existir cadastro.
 *
 * Depende de `ClientesModule` para o reconhecimento — saber se quem escreveu
 * ja e cliente do ERP. E uma dependencia de LEITURA: este modulo nunca escreve
 * em `clientes`, que continua sendo espelho do Safira.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LeadOrmEntity]),
    AuthModule,
    ClientesModule,
  ],
  controllers: [LeadsController],
  providers: [
    RegistrarLeadUseCase,
    { provide: LEAD_REPOSITORY, useClass: LeadRepository },
  ],
  exports: [LEAD_REPOSITORY, RegistrarLeadUseCase],
})
export class LeadsModule {}
