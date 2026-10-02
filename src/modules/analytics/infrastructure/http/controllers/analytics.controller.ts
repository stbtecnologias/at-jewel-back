import { Controller, Get, Header, Query, Request, UseGuards } from '@nestjs/common';
import { PermissionsService } from '../../../../auth/application/permissions.service';
import { Permissions } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../../auth/infrastructure/http/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../auth/infrastructure/http/guards/permissions.guard';
import { ComportamentoDatasUseCase } from '../../../application/use-cases/comportamento-datas.use-case';
import { DemografiaUseCase } from '../../../application/use-cases/demografia.use-case';
import { DistribuicaoOrigemUseCase } from '../../../application/use-cases/distribuicao-origem.use-case';
import { EmpresasDoFiltroUseCase } from '../../../application/use-cases/empresas-do-filtro.use-case';
import { DistribuicaoPagamentoUseCase } from '../../../application/use-cases/distribuicao-pagamento.use-case';
import { EstatisticasInventarioUseCase } from '../../../application/use-cases/estatisticas-inventario.use-case';
import { ExportarVendasCsvUseCase } from '../../../application/use-cases/exportar-vendas-csv.use-case';
import { GiroEstoqueUseCase } from '../../../application/use-cases/giro-estoque.use-case';
import { GiroFamiliasUseCase } from '../../../application/use-cases/giro-familias.use-case';
import { ReceitaMensalUseCase } from '../../../application/use-cases/receita-mensal.use-case';
import { ResumoPeriodoUseCase } from '../../../application/use-cases/resumo-periodo.use-case';
import { TopProdutosUseCase } from '../../../application/use-cases/top-produtos.use-case';
import type { FiltroAnalitico } from '../../../domain/ports/repositories/analytics-repository.port';
import { listaEntrada } from '../../../../../shared/http/query-transforms';

// Converte as query strings do filtro comum das telas de Analytics num
// FiltroAnalitico. Retorna undefined quando TUDO esta vazio. Periodo so vale
// quando AMBAS as datas vem e sao validas; os recortes demograficos
// (sexo/origem/faixa) entram individualmente quando presentes.
function parseFiltro(
  de?: string,
  ate?: string,
  sexo?: string | string[],
  origem?: string | string[],
  faixa?: string,
  idadeMin?: string,
  idadeMax?: string,
  empresa?: string | string[],
): FiltroAnalitico | undefined {
  const filtro: FiltroAnalitico = {};
  if (de && ate) {
    const dataInicio = new Date(de);
    const dataFim = new Date(ate);
    if (!Number.isNaN(dataInicio.getTime()) && !Number.isNaN(dataFim.getTime())) {
      filtro.dataInicio = dataInicio;
      filtro.dataFim = dataFim;
    }
  }
  // `?sexo=F&sexo=M` chega como array; `?sexo=F` como string. O helper cobre
  // as duas, mais a lista por virgula, e devolve `undefined` quando vazio.
  const sexos = listaEntrada(sexo) as string[] | undefined;
  const origens = listaEntrada(origem) as string[] | undefined;
  // A EMPRESA DO GRUPO — 02/10/2026. Mesma forma dos outros: `?empresa=a&empresa=b`,
  // lista por virgula ou valor unico. AUSENTE = TODAS, somadas como sempre.
  const empresas = listaEntrada(empresa) as string[] | undefined;
  if (empresas) filtro.empresaId = empresas;
  if (sexos) filtro.sexo = sexos;
  if (origens) filtro.origem = origens;
  if (faixa) filtro.faixaEtaria = faixa;
  if (idadeMin) {
    const min = Number(idadeMin);
    if (Number.isInteger(min) && min >= 0) filtro.idadeMin = min;
  }
  if (idadeMax) {
    const max = Number(idadeMax);
    if (Number.isInteger(max) && max >= 0) filtro.idadeMax = max;
  }
  return Object.keys(filtro).length > 0 ? filtro : undefined;
}

// Dashboards e KPIs gerenciais — exige analytics:read (RF-USU-01). Somente
// leitura/agregacao; todos os endpoints sao GET, dai a permissao no class-level.
@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('analytics:read')
export class AnalyticsController {
  constructor(
    private readonly receitaMensal: ReceitaMensalUseCase,
    private readonly topProdutos: TopProdutosUseCase,
    private readonly giroEstoque: GiroEstoqueUseCase,
    private readonly giroFamilias: GiroFamiliasUseCase,
    private readonly distribuicaoPagamento: DistribuicaoPagamentoUseCase,
    private readonly estatisticasInventario: EstatisticasInventarioUseCase,
    private readonly distribuicaoOrigem: DistribuicaoOrigemUseCase,
    private readonly empresasDoFiltro: EmpresasDoFiltroUseCase,
    private readonly demografia: DemografiaUseCase,
    private readonly comportamentoDatas: ComportamentoDatasUseCase,
    private readonly exportarVendasCsv: ExportarVendasCsvUseCase,
    private readonly resumoPeriodo: ResumoPeriodoUseCase,
    private readonly permissoes: PermissionsService,
  ) {}

  // Resumo (receita/vendas/ticket) do recorte temporal selecionado (RF-ANL-01).
  @Get('resumo')
  async resumo(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.resumoPeriodo.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  /**
   * AS OPCOES DO FILTRO DE EMPRESA — 02/10/2026.
   *
   * Guardada por `analytics:read`, e nao por `empresas:read`: quem abre esta
   * tela tem de poder montar o filtro dela. Pendurar o controle numa segunda
   * permissao faria a tela carregar e o filtro sumir, que e pior que nao ter
   * o filtro.
   */
  @Get('empresas')
  async empresas() {
    return this.empresasDoFiltro.execute();
  }

  // Com o filtro da tela desde 11/09/2026 — sem ele, os ultimos `meses`.
  @Get('receita-mensal')
  async receita(
    @Query('meses') meses?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.receitaMensal.execute(
      meses ? Number(meses) : undefined,
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  @Get('top-produtos')
  async top(
    @Query('limit') limit?: string,
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.topProdutos.execute(
      limit ? Number(limit) : undefined,
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  @Get('giro-estoque')
  async giro(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.giroEstoque.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  // Giro de estoque agrupado por familia de produto (RF-15). Mesmos recortes
  // de periodo/demografia dos endpoints vizinhos.
  @Get('giro-familias')
  async giroPorFamilia(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.giroFamilias.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  @Get('distribuicao-pagamento')
  async pagamento(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.distribuicaoPagamento.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  /**
   * O inventario: quantas pecas, quanto valem, e a quebra por categoria.
   *
   * ========================================================================
   * O `valorTotal` SAI PARA QUEM NAO TEM `estoque:valor` — 28/09/2026.
   *
   * A matriz do documento de requisitos separa duas linhas que vinham juntas
   * neste objeto desde sempre: "quantidade TOTAL em estoque" a gerente PODE
   * ver, e "VALOR financeiro do estoque (R$)" ela NAO pode (RF-09).
   *
   * Por isso o recorte e no campo, e nao na rota: negar o `/inventario`
   * inteiro tiraria dela o total e a quebra por categoria, que sao dela por
   * direito. E o `valorTotal` some do objeto em vez de vir zero — zero e um
   * numero, e um numero errado e pior que campo nenhum.
   * ========================================================================
   */
  @Get('inventario')
  async inventario(@Request() req: { user: { role: string } }) {
    const inventario = await this.estatisticasInventario.execute();

    if (await this.permissoes.possui(req.user.role, 'estoque:valor')) {
      return inventario;
    }

    const { valorTotal: _, ...semValor } = inventario;
    return semValor;
  }

  @Get('origem')
  async origem(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.distribuicaoOrigem.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  @Get('demografia')
  async demo(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    return this.demografia.execute(
      parseFiltro(dataInicio, dataFim, sexo, origem, faixa, idadeMin, idadeMax, empresa),
    );
  }

  // Comportamento de compra em torno de datas comemorativas (janela de 15 dias).
  // O periodo vem das janelas; data_inicio/data_fim NAO se aplicam aqui, mas
  // os recortes demograficos (sexo/origem/faixa) sim.
  @Get('datas-comemorativas')
  async datas(
    @Query('ano') ano?: string,
    @Query('sexo') sexo?: string | string[],
    @Query('origem') origem?: string | string[],
    @Query('faixa') faixa?: string,
    @Query('idade_min') idadeMin?: string,
    @Query('idade_max') idadeMax?: string,
    @Query('empresa') empresa?: string | string[],
  ) {
    const anoNum = Number(ano);
    const alvo = Number.isInteger(anoNum) && anoNum > 2000 ? anoNum : new Date().getFullYear();
    return this.comportamentoDatas.execute(
      alvo,
      parseFiltro(undefined, undefined, sexo, origem, faixa, idadeMin, idadeMax),
    );
  }

  @Get('vendas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="vendas.csv"')
  async exportar(
    @Query('data_inicio') dataInicio?: string,
    @Query('data_fim') dataFim?: string,
  ): Promise<string> {
    return this.exportarVendasCsv.execute(
      dataInicio ? new Date(dataInicio) : undefined,
      dataFim ? new Date(dataFim) : undefined,
    );
  }
}
