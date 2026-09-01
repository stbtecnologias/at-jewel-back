import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import {
  AnexarReferenciaUseCase,
  AtualizarCatalogoUseCase,
  BuscarCatalogoUseCase,
  CriarCatalogoUseCase,
  CurarFotoUseCase,
  ListarCatalogosUseCase,
  RemoverCatalogoUseCase,
  RemoverReferenciaUseCase,
} from './application/use-cases/catalogos.use-cases';
import { ExportarCatalogoUseCase } from './application/use-cases/exportar-catalogo.use-case';
import { TratarFotoUseCase } from './application/use-cases/tratar-foto.use-case';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
  TRATAMENTO_IMAGEM,
} from './domain/ports/injection-tokens';
import { DiscoArmazenamento } from './infrastructure/armazenamento/disco.armazenamento';
import { S3Armazenamento } from './infrastructure/armazenamento/s3.armazenamento';
import { OpenaiTratamentoImagemClient } from './infrastructure/ia/openai-tratamento-imagem.client';
import { CatalogoFotoOrmEntity } from './infrastructure/database/typeorm/entities/catalogo-foto.orm-entity';
import { CatalogoReferenciaOrmEntity } from './infrastructure/database/typeorm/entities/catalogo-referencia.orm-entity';
import { CatalogoOrmEntity } from './infrastructure/database/typeorm/entities/catalogo.orm-entity';
import { CatalogoRepository } from './infrastructure/database/typeorm/repositories/catalogo.repository';
import { CatalogosController } from './infrastructure/http/controllers/catalogos.controller';
import { MidiaController } from './infrastructure/http/controllers/midia.controller';

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
  controllers: [CatalogosController, MidiaController],
  providers: [
    ListarCatalogosUseCase,
    BuscarCatalogoUseCase,
    CriarCatalogoUseCase,
    AtualizarCatalogoUseCase,
    RemoverCatalogoUseCase,
    AnexarReferenciaUseCase,
    RemoverReferenciaUseCase,
    CurarFotoUseCase,
    ExportarCatalogoUseCase,
    TratarFotoUseCase,
    { provide: TRATAMENTO_IMAGEM, useClass: OpenaiTratamentoImagemClient },
    { provide: CATALOGO_REPOSITORY, useClass: CatalogoRepository },
    {
      // O ADAPTADOR SAI DO AMBIENTE, e nao de um `if` espalhado pelo codigo.
      //
      // Com `AWS_S3_BUCKET` definido, S3; sem ele, disco. Assim o
      // desenvolvimento local nao precisa de credencial de AWS nenhuma, e
      // producao nao depende de lembrar de trocar uma linha antes do deploy.
      //
      // Os dois cumprem a mesma porta e guardam a mesma CHAVE, entao a troca
      // nao toca em nada ja gravado.
      provide: ARMAZENAMENTO,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('AWS_S3_BUCKET')
          ? new S3Armazenamento(config)
          : new DiscoArmazenamento(config),
    },
  ],
  exports: [CATALOGO_REPOSITORY, ARMAZENAMENTO, TratarFotoUseCase],
})
export class CatalogosModule {}
