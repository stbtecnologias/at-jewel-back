import { Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { variantesTelefone } from '../../../clientes/application/utils/normalizadores';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { PermissionsService } from '../permissions.service';

/**
 * Permissao que abre o canal da Anastasia.
 *
 * ==========================================================================
 * ERA `vendas:read_all` ATE 29/09/2026, E A TROCA E DE CRITERIO, NAO DE NOME.
 *
 * A chave antiga significa "ver vendas de TODAS as vendedoras (comparativo)",
 * e no painel ela abre a TELA DE VENDAS — o `EscopoVendasService` para de
 * recortar por vendedora quando a encontra, e o resumo daquela tela vira o da
 * loja inteira. Ou seja: quem tinha a porta do WhatsApp tinha, pelo mesmo
 * cadeado, o faturamento geral na tela.
 *
 * Isso impedia o papel GERENTE_VENDAS — quem gerencia as vendedoras e nao ve o
 * faturamento da loja. Sem separar as duas coisas, so havia o extremo: ou ela
 * perdia o canal, ou ganhava a tela.
 *
 * `agentes:anastasia` ja existia e ja e exigida nas rotas do chat da Anastasia
 * no painel (`AgentesController`). Ela se chama "Conversar com a Anastasia",
 * que e exatamente o que esta porta decide — o nome passou a dizer a verdade.
 *
 * A TROCA FOI NEUTRA no dia em que entrou: ADMIN e GERENTE tinham as DUAS
 * chaves, SUPERADMIN tem o curinga, e ESTOQUISTA/VENDEDORA nao tinham nenhuma.
 * Ninguem ganhou nem perdeu o canal — conferido no banco antes de mexer.
 * ==========================================================================
 *
 * O que NAO mudou: continua sendo uma chave so para as duas portas (WhatsApp e
 * painel), entao mexer nas permissoes de um papel muda as duas juntas e nao
 * existe uma segunda lista para esquecer de atualizar.
 */
export const PERMISSAO_GESTAO = 'agentes:anastasia';

/**
 * De quem e este telefone, do lado da GESTAO? Espelha o
 * `BuscarVendedoraPorWhatsappUseCase`: mesmo formato de entrada, mesma busca
 * por variantes, mesmo `null` quando nao reconhece.
 *
 * TENTA TODAS AS VARIANTES pelo mesmo motivo de la — o WhatsApp entrega contas
 * antigas sem o nono digito, e casar so pela forma exata deixaria de reconhecer
 * justamente quem ja usava o numero antes da mudanca.
 *
 * ==========================================================================
 * NAO BASTA TER TELEFONE: PRECISA DE PERMISSAO DE GESTAO.
 *
 * O papel VENDEDORA e uma opcao do seletor de usuarios, entao vendedora com
 * login no painel TEM linha em `admin_users`. Se este use case olhasse so o
 * telefone, bastaria ela cadastrar o proprio celular para passar a enxergar
 * dado de toda a equipe pelo WhatsApp — e o buraco entraria sem ninguem ver,
 * porque o cadastro em si e uma acao legitima.
 *
 * A checagem e uma linha e fecha isso na origem.
 * ==========================================================================
 */
@Injectable()
export class BuscarAdminPorTelefoneUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
    private readonly permissoes: PermissionsService,
  ) {}

  /**
   * @param permissaoExigida qual permissao o dono do telefone precisa ter. O
   *   padrao e a de gestao — quem chama sem informar recebe exatamente o
   *   comportamento de antes.
   *
   *   O parametro existe porque o canal interno passou a ter mais de um
   *   assunto: o catalogo e atendido por estoque e marketing, que NAO tem
   *   permissao de gestao e nem deveriam ter. Sem ele seria preciso um
   *   segundo use case repetindo a mesma busca por variantes de telefone —
   *   duas implementacoes do mesmo reconhecimento, para divergirem na
   *   primeira correcao.
   */
  async execute(
    telefone: string,
    permissaoExigida: string = PERMISSAO_GESTAO,
  ): Promise<AdminUser | null> {
    for (const variante of variantesTelefone(telefone)) {
      const achado = await this.repo.buscarPorTelefoneHash(hashField(variante));
      if (!achado) continue;

      const podeGerir = await this.permissoes.possui(achado.role, permissaoExigida);
      // Reconhecido, mas sem permissao: devolve null, e nao um erro. Quem chama
      // trata como "nao reconhecido" e fica em silencio — mesma resposta de um
      // numero desconhecido, para nao confirmar que o cadastro existe.
      return podeGerir ? achado : null;
    }
    return null;
  }
}
