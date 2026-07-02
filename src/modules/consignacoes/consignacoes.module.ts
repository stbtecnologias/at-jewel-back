import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarConsignacaoUseCase } from './application/use-cases/atualizar-consignacao.use-case';
import { BuscarConsignacaoUseCase } from './application/use-cases/buscar-consignacao.use-case';
import { CriarConsignacaoUseCase } from './application/use-cases/criar-consignacao.use-case';
import { ListarConsignacoesUseCase } from './application/use-cases/listar-consignacoes.use-case';
import { ResumoConsignacoesUseCase } from './application/use-cases/resumo-consignacoes.use-case';
import { CONSIGNACAO_REPOSITORY } from './domain/ports/injection-tokens';
import { ConsignacaoOrmEntity } from './infrastructure/database/typeorm/entities/consignacao.orm-entity';
import { ConsignacaoRepository } from './infrastructure/database/typeorm/repositories/consignacao.repository';
import { ConsignacoesController } from './infrastructure/http/controllers/consignacoes.controller';

// AuthModule e OBRIGATORIO: o controller usa PermissionsGuard, cuja
// resolucao de DI so falha no boot (nest build/jest nao pegam).
@Module({
  imports: [TypeOrmModule.forFeature([ConsignacaoOrmEntity]), AuthModule],
  controllers: [ConsignacoesController],
  providers: [
    ListarConsignacoesUseCase,
    ResumoConsignacoesUseCase,
    BuscarConsignacaoUseCase,
    CriarConsignacaoUseCase,
    AtualizarConsignacaoUseCase,
    { provide: CONSIGNACAO_REPOSITORY, useClass: ConsignacaoRepository },
  ],
  exports: [CONSIGNACAO_REPOSITORY],
})
export class ConsignacoesModule {}
