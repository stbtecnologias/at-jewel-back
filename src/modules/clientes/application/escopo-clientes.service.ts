import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PermissionsService } from '../../auth/application/permissions.service';
import { CLIENTE_REPOSITORY } from '../domain/ports/injection-tokens';
import type { IClienteRepository } from '../domain/ports/repositories/cliente-repository.port';

/**
 * Isolamento da carteira de clientes por vendedora — o MEL-23.
 *
 * ==========================================================================
 * O QUE ELE CONSERTA.
 *
 * Ate 04/09/2026 `GET /clientes` tinha `@Permissions('clientes:read')` e mais
 * nada: nenhum recorte, e nenhum servico como este. O que protegia a base era
 * um ACIDENTE — a VENDEDORA simplesmente nao possuia a permissao.
 *
 * E a tela de Papeis, que e o proprio MEL-22 do documento, e uma caixinha por
 * permissao. Bastava marcar `clientes:read` para VENDEDORA, achando que estava
 * liberando a carteira DELA, para entregar a base inteira: nome, telefone,
 * e-mail, limite de credito e observacoes de todos os clientes da loja.
 *
 * Fazer o MEL-22 sem este servico era abrir o buraco de proposito.
 * ==========================================================================
 *
 * O DESENHO E O MESMO DO `EscopoVendasService`, e isso e deliberado: dois
 * jeitos diferentes de responder "esta pessoa ve tudo?" e um convite a divergir
 * na primeira mudanca.
 */
@Injectable()
export class EscopoClientesService {
  constructor(
    private readonly permissions: PermissionsService,
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
  ) {}

  /**
   * Devolve o `codigo_erp` da vendedora a que o usuario esta restrito, ou
   * `undefined` quando ele pode ver a carteira inteira (`clientes:read_all`).
   *
   * LANCA 403 quando o usuario NAO tem `clientes:read_all` e tambem nao esta
   * vinculado a nenhuma vendedora. E o caso do papel novo que alguem criou com
   * `clientes:read` marcada e mais nada: nao existe "carteira propria" para
   * mostrar, e devolver a base inteira seria exatamente o buraco que este
   * servico fecha. Negar e a resposta segura.
   */
  async codigoErpRestrito(user: {
    sub: string;
    role: string;
  }): Promise<string | undefined> {
    if (await this.permissions.possui(user.role, 'clientes:read_all')) {
      return undefined;
    }

    const codigo =
      await this.clienteRepo.resolverVendedoraCodigoErpPorAdminUser(user.sub);

    if (!codigo) {
      throw new ForbiddenException(
        'Usuário não está vinculado a uma vendedora; acesso aos clientes negado.',
      );
    }
    return codigo;
  }

  /**
   * Confere se um cliente ja carregado pertence ao escopo do usuario.
   *
   * Existe separado do filtro de listagem porque as rotas de DETALHE buscam
   * pelo id e so depois podem comparar — e ai a checagem tem que ser explicita,
   * senao um id valido de outra carteira volta inteiro, com telefone e limite
   * de credito.
   */
  podeVer(
    restrito: string | undefined,
    clienteVendedoraCodigoErp: string | null,
  ): boolean {
    if (restrito === undefined) return true;
    return clienteVendedoraCodigoErp === restrito;
  }
}
