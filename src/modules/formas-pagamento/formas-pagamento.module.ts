import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarFormaPagamentoUseCase } from './application/use-cases/atualizar-forma-pagamento.use-case';
import { BuscarFormaPagamentoUseCase } from './application/use-cases/buscar-forma-pagamento.use-case';
import { BuscarFormaPagamentoPorIdErpUseCase } from './application/use-cases/buscar-forma-pagamento-por-id-erp.use-case';
import { CriarFormaPagamentoUseCase } from './application/use-cases/criar-forma-pagamento.use-case';
import { ListarFormasPagamentoUseCase } from './application/use-cases/listar-formas-pagamento.use-case';
import { RemoverFormaPagamentoUseCase } from './application/use-cases/remover-forma-pagamento.use-case';
import { FORMA_PAGAMENTO_REPOSITORY } from './domain/ports/injection-tokens';
import { FormaPagamentoOrmEntity } from './infrastructure/database/typeorm/entities/forma-pagamento.orm-entity';
import { FormaPagamentoRepository } from './infrastructure/database/typeorm/repositories/forma-pagamento.repository';
import { FormasPagamentoController } from './infrastructure/http/controllers/formas-pagamento.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([FormaPagamentoOrmEntity]), AuthModule],
  controllers: [FormasPagamentoController],
  providers: [
    CriarFormaPagamentoUseCase,
    BuscarFormaPagamentoUseCase,
    BuscarFormaPagamentoPorIdErpUseCase,
    ListarFormasPagamentoUseCase,
    AtualizarFormaPagamentoUseCase,
    RemoverFormaPagamentoUseCase,
    { provide: FORMA_PAGAMENTO_REPOSITORY, useClass: FormaPagamentoRepository },
  ],
  exports: [FORMA_PAGAMENTO_REPOSITORY],
})
export class FormasPagamentoModule {}
