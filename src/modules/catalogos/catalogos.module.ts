import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import {
  AnexarReferenciaUseCase,
  AnotarReferenciaUseCase,
  AtualizarCatalogoUseCase,
  BuscarCatalogoUseCase,
  CorrigirParcelamentoUseCase,
  DefinirCapaUseCase,
  CriarCatalogoUseCase,
  CurarFotoUseCase,
  ListarCatalogosUseCase,
  RemoverCatalogoUseCase,
  RemoverReferenciaUseCase,
} from './application/use-cases/catalogos.use-cases';
import { EnviarFinalUseCase } from './application/use-cases/enviar-final.use-case';
import { ExportarCatalogoUseCase } from './application/use-cases/exportar-catalogo.use-case';
import { AjustarCatalogoUseCase } from './application/use-cases/ajustar-catalogo.use-case';
import { AprovarCatalogoUseCase } from './application/use-cases/aprovar-catalogo.use-case';
import { MontarCatalogoUseCase } from './application/use-cases/montar-catalogo.use-case';
import { TratarFotoUseCase } from './application/use-cases/tratar-foto.use-case';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
  CONFERENCIA_FOTO,
  ESTILO_CATALOGO,
  INTERPRETADOR_AJUSTE,
  TRATAMENTO_IMAGEM,
} from './domain/ports/injection-tokens';
import { DiscoArmazenamento } from './infrastructure/armazenamento/disco.armazenamento';
import { S3Armazenamento } from './infrastructure/armazenamento/s3.armazenamento';
import { OpenaiTratamentoImagemClient } from './infrastructure/ia/openai-tratamento-imagem.client';
import { AnthropicConferenciaFotoClient } from './infrastructure/ia/anthropic-conferencia-foto.client';
import { AnthropicEstiloCatalogoClient } from './infrastructure/ia/anthropic-estilo-catalogo.client';
import { AnthropicInterpretadorDeAjusteClient } from './infrastructure/ia/anthropic-interpretador-ajuste.client';
import { EstiloDoCatalogoService } from './application/estilo-do-catalogo.service';
import { CatalogoFinalOrmEntity } from './infrastructure/database/typeorm/entities/catalogo-final.orm-entity';
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
      CatalogoFinalOrmEntity,
    ]),
    AuthModule,
  ],
  controllers: [CatalogosController, MidiaController],
  providers: [
    ListarCatalogosUseCase,
    BuscarCatalogoUseCase,
    CriarCatalogoUseCase,
    AtualizarCatalogoUseCase,
    DefinirCapaUseCase,
    AnotarReferenciaUseCase,
    CorrigirParcelamentoUseCase,
    RemoverCatalogoUseCase,
    AnexarReferenciaUseCase,
    RemoverReferenciaUseCase,
    CurarFotoUseCase,
    EnviarFinalUseCase,
    ExportarCatalogoUseCase,
    MontarCatalogoUseCase,
    // O ajuste do PDF montado, pagina por pagina — e quem le o pedido.
    AjustarCatalogoUseCase,
    // A aprovação: PUBLICADO, a trava e a capa da versão aprovada.
    AprovarCatalogoUseCase,
    {
      provide: INTERPRETADOR_AJUSTE,
      useClass: AnthropicInterpretadorDeAjusteClient,
    },
    TratarFotoUseCase,
    { provide: TRATAMENTO_IMAGEM, useClass: OpenaiTratamentoImagemClient },
    // Quem OLHA a foto antes de gerar. Ver o cabecalho da porta: sem ela, a
    // foto de um teclado voltava como uma joia inventada.
    { provide: CONFERENCIA_FOTO, useClass: AnthropicConferenciaFotoClient },
    // Quem LE as paginas de referencia, e o cache que evita reler a cada foto.
    { provide: ESTILO_CATALOGO, useClass: AnthropicEstiloCatalogoClient },
    EstiloDoCatalogoService,
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
  exports: [
    CATALOGO_REPOSITORY,
    ARMAZENAMENTO,
    TratarFotoUseCase,
    // Exportado porque quem confere e o canal do WhatsApp, no modulo de
    // atendimentos — a conferencia acontece na CHEGADA da foto, antes de ela
    // ser gravada.
    CONFERENCIA_FOTO,
  ],
})
export class CatalogosModule {}
