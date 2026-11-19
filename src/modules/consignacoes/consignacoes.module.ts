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
import { ConsignacoesDeMovimentacaoRepository } from './infrastructure/database/typeorm/repositories/consignacoes-de-movimentacao.repository';
import { ConsignacoesUnidasRepository } from './infrastructure/database/typeorm/repositories/consignacoes-unidas.repository';
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
    // AS DUAS FONTES — 19/11/2026. A tela passou a ler a movimentacao, que
    // e onde a consignacao de verdade esta: a tabela tinha ZERO linhas
    // desde 09/11. O cadastro manual continua gravando nela, e por isso a
    // leitura une as duas. Ver `ConsignacoesUnidasRepository`.
    ConsignacaoRepository,
    ConsignacoesDeMovimentacaoRepository,
    { provide: CONSIGNACAO_REPOSITORY, useClass: ConsignacoesUnidasRepository },
  ],
  exports: [CONSIGNACAO_REPOSITORY],
})
export class ConsignacoesModule {}
