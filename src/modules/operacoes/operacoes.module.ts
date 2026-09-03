import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarOperacaoUseCase } from './application/use-cases/atualizar-operacao.use-case';
import { BuscarOperacaoPorIdErpUseCase } from './application/use-cases/buscar-operacao-por-id-erp.use-case';
import { BuscarOperacaoUseCase } from './application/use-cases/buscar-operacao.use-case';
import { CriarOperacaoUseCase } from './application/use-cases/criar-operacao.use-case';
import { ListarOperacoesUseCase } from './application/use-cases/listar-operacoes.use-case';
import { SincronizarOperacaoUseCase } from './application/use-cases/sincronizar-operacao.use-case';
import { OPERACAO_REPOSITORY } from './domain/ports/injection-tokens';
import { OperacaoOrmEntity } from './infrastructure/database/typeorm/entities/operacao.orm-entity';
import { OperacaoRepository } from './infrastructure/database/typeorm/repositories/operacao.repository';
import { OperacoesController } from './infrastructure/http/controllers/operacoes.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([OperacaoOrmEntity]), AuthModule],
  controllers: [OperacoesController],
  providers: [
    CriarOperacaoUseCase,
    SincronizarOperacaoUseCase,
    BuscarOperacaoUseCase,
    BuscarOperacaoPorIdErpUseCase,
    ListarOperacoesUseCase,
    AtualizarOperacaoUseCase,
    { provide: OPERACAO_REPOSITORY, useClass: OperacaoRepository },
  ],
  // Exportado para o MovimentacoesModule: a ingestao resolve `operacao_id`
  // pelo id do ERP antes de gravar o cabecalho.
  exports: [OPERACAO_REPOSITORY],
})
export class OperacoesModule {}
