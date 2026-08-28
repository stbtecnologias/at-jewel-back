import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import {
  AnexarReferenciaUseCase,
  AtualizarCatalogoUseCase,
  BuscarCatalogoUseCase,
  CriarCatalogoUseCase,
  ListarCatalogosUseCase,
  RemoverCatalogoUseCase,
  RemoverReferenciaUseCase,
} from './application/use-cases/catalogos.use-cases';
import { ARMAZENAMENTO, CATALOGO_REPOSITORY } from './domain/ports/injection-tokens';
import { DiscoArmazenamento } from './infrastructure/armazenamento/disco.armazenamento';
import { CatalogoFotoOrmEntity } from './infrastructure/database/typeorm/entities/catalogo-foto.orm-entity';
import { CatalogoReferenciaOrmEntity } from './infrastructure/database/typeorm/entities/catalogo-referencia.orm-entity';
import { CatalogoOrmEntity } from './infrastructure/database/typeorm/entities/catalogo.orm-entity';
import { CatalogoRepository } from './infrastructure/database/typeorm/repositories/catalogo.repository';
import { CatalogosController } from './infrastructure/http/controllers/catalogos.controller';

// AuthModule e OBRIGATORIO: o controller usa PermissionsGuard, cuja resolucao
// de DI so falha no boot (nest build/jest nao pegam).
//
// CATALOGO_REPOSITORY e ARMAZENAMENTO sao exportados para a rodada seguinte:
// quem recebe a foto do WhatsApp e o modulo de atendimentos, e ele precisa
// gravar no mesmo agregado sem duplicar repositorio.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatalogoOrmEntity,
      CatalogoReferenciaOrmEntity,
      CatalogoFotoOrmEntity,
    ]),
    AuthModule,
  ],
  controllers: [CatalogosController],
  providers: [
    ListarCatalogosUseCase,
    BuscarCatalogoUseCase,
    CriarCatalogoUseCase,
    AtualizarCatalogoUseCase,
    RemoverCatalogoUseCase,
    AnexarReferenciaUseCase,
    RemoverReferenciaUseCase,
    { provide: CATALOGO_REPOSITORY, useClass: CatalogoRepository },
    { provide: ARMAZENAMENTO, useClass: DiscoArmazenamento },
  ],
  exports: [CATALOGO_REPOSITORY, ARMAZENAMENTO],
})
export class CatalogosModule {}
