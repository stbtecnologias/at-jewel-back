import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AtualizarEmpresaUseCase } from './application/use-cases/atualizar-empresa.use-case';
import { BuscarEmpresaUseCase } from './application/use-cases/buscar-empresa.use-case';
import { BuscarEmpresaPorIdErpUseCase } from './application/use-cases/buscar-empresa-por-id-erp.use-case';
import { CriarEmpresaUseCase } from './application/use-cases/criar-empresa.use-case';
import { ListarEmpresasUseCase } from './application/use-cases/listar-empresas.use-case';
import { RemoverEmpresaUseCase } from './application/use-cases/remover-empresa.use-case';
import { EMPRESA_REPOSITORY } from './domain/ports/injection-tokens';
import { EmpresaOrmEntity } from './infrastructure/database/typeorm/entities/empresa.orm-entity';
import { EmpresaRepository } from './infrastructure/database/typeorm/repositories/empresa.repository';
import { EmpresasController } from './infrastructure/http/controllers/empresas.controller';

@Module({
  // AuthModule exporta o JwtOrApiKeyGuard e o PermissionsService de que ele
  // depende — sem esse import o guard nao resolve no contexto deste modulo.
  imports: [TypeOrmModule.forFeature([EmpresaOrmEntity]), AuthModule],
  controllers: [EmpresasController],
  providers: [
    CriarEmpresaUseCase,
    BuscarEmpresaUseCase,
    BuscarEmpresaPorIdErpUseCase,
    ListarEmpresasUseCase,
    AtualizarEmpresaUseCase,
    RemoverEmpresaUseCase,
    { provide: EMPRESA_REPOSITORY, useClass: EmpresaRepository },
  ],
  // Exportado para quando `vendas.empresa_id` e a tabela de estoque
  // precisarem resolver a empresa na ingestao.
  exports: [EMPRESA_REPOSITORY],
})
export class EmpresasModule {}
