import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { JwtOrApiKeyGuard } from '../../../../auth/infrastructure/http/guards/jwt-or-api-key.guard';
import { BuscarMovimentacaoPorIdErpUseCase } from '../../../application/use-cases/buscar-movimentacao-por-id-erp.use-case';
import { BuscarMovimentacaoUseCase } from '../../../application/use-cases/buscar-movimentacao.use-case';
import { ListarMovimentacoesUseCase } from '../../../application/use-cases/listar-movimentacoes.use-case';
import { RemoverMovimentacaoUseCase } from '../../../application/use-cases/remover-movimentacao.use-case';
import { SincronizarMovimentacaoUseCase } from '../../../application/use-cases/sincronizar-movimentacao.use-case';
import { FiltroMovimentacaoDto } from '../dto/filtro-movimentacao.dto';
import { SincronizarMovimentacaoDto } from '../dto/sincronizar-movimentacao.dto';

// JwtOrApiKeyGuard: JWT valida a PERMISSAO do papel (@Permissions), chave de
// API valida o SCOPE (@RequireScopes). Mesmo par de `operacoes` — quem le a
// movimentacao precisa da operacao para saber o que ela e.
//
// PUT PARA ESCREVER, DELETE PARA DESFAZER. Nao ha POST nem PATCH, e nenhum
// dos dois e esquecimento:
//
//   POST     duplicaria o caminho de entrada. O ERP reenvia o mesmo documento
//            e isso tem de ser barato e sem efeito.
//   PATCH    o CRM nao edita documento fiscal. O que e nosso — a projecao —
//            nao mora nesta tabela.
//
// O DELETE existe desde 04/09/2026, e a ordem das ferramentas importa:
//
//   dado errado ou incompleto  -> PUT, que substitui o agregado inteiro
//   venda cancelada no ERP     -> PUT com `ativo: false`, que e do ERP
//   documento que nao devia ter entrado -> DELETE
//
// So o terceiro caso e que o PUT nao alcanca: um `idErpMovimentacao` digitado
// errado cria um fantasma, e reenviar so corrige o CONTEUDO dele.
@Controller('movimentacoes')
export class MovimentacoesController {
  constructor(
    private readonly sincronizar: SincronizarMovimentacaoUseCase,
    private readonly buscar: BuscarMovimentacaoUseCase,
    private readonly buscarPorIdErp: BuscarMovimentacaoPorIdErpUseCase,
    private readonly listar: ListarMovimentacoesUseCase,
    private readonly remover: RemoverMovimentacaoUseCase,
  ) {}

  @Get()
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:read')
  @RequireScopes('movimentacoes:read')
  async listarMovimentacoes(@Query() filtros: FiltroMovimentacaoDto) {
    const { itens, total } = await this.listar.execute({
      ...filtros,
      de: filtros.de ? new Date(filtros.de) : undefined,
      ate: filtros.ate ? new Date(filtros.ate) : undefined,
    });
    // `toResumo`: a listagem nao carrega itens e pagamentos. Ver o repositorio.
    return { total, itens: itens.map((m) => m.toResumo()) };
  }

  // Antes de @Get(':id'), porque o Nest casa as rotas na ordem em que
  // aparecem. O parametro NAO usa ParseUUIDPipe: aqui chega o id do ERP, que e
  // numero e as vezes vem com espaco a esquerda.
  @Get('iderp/:id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:read')
  @RequireScopes('movimentacoes:read')
  async buscarPeloIdErp(@Param('id') idErp: string) {
    const m = await this.buscarPorIdErp.execute(idErp);
    return m.toPublic();
  }

  @Get(':id')
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:read')
  @RequireScopes('movimentacoes:read')
  async buscarPorId(@Param('id', ParseUUIDPipe) id: string) {
    const m = await this.buscar.execute(id);
    return m.toPublic();
  }

  // A ingestao. Upsert do agregado por `id_erp`, no padrao do PUT /estoque.
  //
  // 200 nos dois casos, com `criada` no corpo dizendo o que aconteceu — o
  // integrador manda lote e nao le status por item.
  @Put()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:write')
  @RequireScopes('movimentacoes:write')
  async sincronizarMovimentacao(@Body() dto: SincronizarMovimentacaoDto) {
    const { movimentacao, criada } = await this.sincronizar.execute(dto);
    return { ...movimentacao.toPublic(), criada };
  }

  // Pelo NOSSO UUID, nao pelo id do ERP — decisao do Lucas em 04/09/2026, e
  // ela protege: obriga um GET antes, entao ninguem apaga de cabeca um id que
  // acha que sabe. Itens e pagamentos vao junto pelo CASCADE.
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtOrApiKeyGuard)
  @Permissions('movimentacoes:write')
  @RequireScopes('movimentacoes:write')
  async removerMovimentacao(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.remover.execute(id);
  }
}
