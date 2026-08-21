import { Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { variantesTelefone } from '../../../clientes/application/utils/normalizadores';
import { AdminUser } from '../../domain/entities/admin-user.entity';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { PermissionsService } from '../permissions.service';

/**
 * Permissao que separa gestao de vendedora.
 *
 * "Ver vendas de TODAS as vendedoras (comparativo)" e literalmente o que
 * distingue os dois papeis no painel — quem a tem enxerga a equipe, quem nao
 * tem enxerga a si mesma. Reusar a mesma chave aqui mantem um criterio so:
 * mexer nas permissoes de um papel muda o painel e o WhatsApp juntos, e nao
 * existe uma segunda lista para esquecer de atualizar.
 */
export const PERMISSAO_GESTAO = 'vendas:read_all';

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

  async execute(telefone: string): Promise<AdminUser | null> {
    for (const variante of variantesTelefone(telefone)) {
      const achado = await this.repo.buscarPorTelefoneHash(hashField(variante));
      if (!achado) continue;

      const podeGerir = await this.permissoes.possui(achado.role, PERMISSAO_GESTAO);
      // Reconhecido, mas sem permissao: devolve null, e nao um erro. Quem chama
      // trata como "nao reconhecido" e fica em silencio — mesma resposta de um
      // numero desconhecido, para nao confirmar que o cadastro existe.
      return podeGerir ? achado : null;
    }
    return null;
  }
}
