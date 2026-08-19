import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarFornecedorUseCase } from './application/use-cases/atualizar-fornecedor.use-case';
import { BuscarFornecedorUseCase } from './application/use-cases/buscar-fornecedor.use-case';
import { BuscarFornecedorPorIdErpUseCase } from './application/use-cases/buscar-fornecedor-por-id-erp.use-case';
import { CriarFornecedorUseCase } from './application/use-cases/criar-fornecedor.use-case';
import { ListarFornecedoresUseCase } from './application/use-cases/listar-fornecedores.use-case';
import { RemoverFornecedorUseCase } from './application/use-cases/remover-fornecedor.use-case';
import { FORNECEDOR_REPOSITORY } from './domain/ports/injection-tokens';
import { FornecedorOrmEntity } from './infrastructure/database/typeorm/entities/fornecedor.orm-entity';
import { FornecedorRepository } from './infrastructure/database/typeorm/repositories/fornecedor.repository';
import { FornecedoresController } from './infrastructure/http/controllers/fornecedores.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([FornecedorOrmEntity]), AuthModule],
  controllers: [FornecedoresController],
  providers: [
    CriarFornecedorUseCase,
    BuscarFornecedorUseCase,
    BuscarFornecedorPorIdErpUseCase,
    ListarFornecedoresUseCase,
    AtualizarFornecedorUseCase,
    RemoverFornecedorUseCase,
    { provide: FORNECEDOR_REPOSITORY, useClass: FornecedorRepository },
  ],
  exports: [FORNECEDOR_REPOSITORY],
})
export class FornecedoresModule {}
