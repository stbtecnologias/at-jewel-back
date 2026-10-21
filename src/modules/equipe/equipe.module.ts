import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VendedorasModule } from '../vendedoras/vendedoras.module';
import { GenteDaCasaService } from './application/gente-da-casa.service';

/**
 * QUEM É DA CASA — módulo próprio desde 21/10/2026.
 *
 * ==========================================================================
 * ELE NASCEU DENTRO DE `atendimentos`, E TEVE DE SAIR.
 *
 * A pergunta "este telefone é de gente da casa?" começou servindo só à
 * timeline. Quando o Lucas pediu que **conversa interna não vire lead** —
 * *"quando ela quiser fazer uma campanha dos leads dela, vai ter muito número
 * interno"* —, a mesma pergunta passou a ser feita pelo módulo de leads.
 *
 * E não dava para importar: `AtendimentosModule` já importa `LeadsModule`, e
 * o caminho de volta fecharia um ciclo. Então a resposta vira módulo, e os
 * dois lados importam **ela**, em vez de um importar o outro.
 *
 * É a mesma lição de 20/10 com outra roupa: **regra que mora no chamador não
 * é regra.** Aqui ela mora no seu próprio lugar, e quem precisar pergunta.
 * ==========================================================================
 *
 * Só depende de quem guarda telefone de gente da casa: as vendedoras e as
 * contas de painel.
 */
@Module({
  imports: [AuthModule, VendedorasModule],
  providers: [GenteDaCasaService],
  exports: [GenteDaCasaService],
})
export class EquipeModule {}
