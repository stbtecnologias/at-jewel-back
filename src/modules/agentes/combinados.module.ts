import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CombinadosService } from './application/combinados.service';
import { COMBINADOS_REPOSITORY } from './domain/ports/injection-tokens';
import { AgenteCombinadoOrmEntity } from './infrastructure/database/typeorm/entities/agente-combinado.orm-entity';
import { CombinadosRepository } from './infrastructure/database/typeorm/repositories/combinados.repository';

/**
 * So os combinados, isolados num modulo proprio.
 *
 * ==========================================================================
 * POR QUE SEPARADO — e a resposta e a mesma do `WhatsappGatewayModule`.
 *
 * O `AgentesModule` importa o `AtendimentosModule` (a tool `avisar_vendedora`
 * abre atendimento), entao o caminho direto — o canal de WhatsApp da gestao
 * importar o AgentesModule para pegar o `CombinadosService` — fecharia um
 * ciclo, e o Nest recusa.
 *
 * Este modulo nao importa nada alem do TypeORM, entao os dois lados podem
 * importa-lo sem ciclo. E e o que garante o requisito ANA-23: a MESMA
 * instancia, a MESMA tabela, o mesmo combinado valendo no WhatsApp e no
 * painel — nao duas copias sincronizadas.
 * ==========================================================================
 */
@Module({
  imports: [TypeOrmModule.forFeature([AgenteCombinadoOrmEntity])],
  providers: [
    CombinadosService,
    { provide: COMBINADOS_REPOSITORY, useClass: CombinadosRepository },
  ],
  exports: [CombinadosService],
})
export class CombinadosModule {}
