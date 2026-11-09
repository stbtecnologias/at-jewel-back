import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import {
  normalizarTelefone,
  variantesTelefone,
} from '../../../clientes/application/utils/normalizadores';
import { ADMIN_USER_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../domain/ports/repositories/admin-user-repository.port';
import { toUsuarioPublico, UsuarioPublico } from './usuario-publico';

export interface AtualizarUsuarioCmd {
  id: string;
  /** `undefined` = nao mexe. String vazia limpa o nome. */
  nome?: string | null;
  /**
   * `undefined` = nao mexe. `null` ou string vazia APAGA o telefone — e a
   * unica forma de tirar um numero que foi cadastrado errado.
   */
  telefone?: string | null;
  /** `undefined` = nao mexe. `false` desliga a conta — migracao 77. */
  ativo?: boolean;
  /** Quem esta pedindo. So e usado para impedir que alguem se desative. */
  solicitanteId?: string;
}

/**
 * Edita nome e telefone de um usuario que ja existe.
 *
 * NAO MEXE EM PAPEL, e-mail nem senha, de proposito:
 *
 * - PAPEL e decisao de permissao, com consequencia diferente das outras. Trocar
 *   o papel de alguem muda o que ela pode fazer no sistema inteiro, e merece
 *   fluxo proprio — inclusive a pergunta de quem pode rebaixar quem. Ficou de
 *   fora ate isso ser decidido.
 * - E-MAIL e a chave de login (e o casamento com a conta Google). Trocar
 *   silenciosamente derrubaria o acesso da pessoa.
 * - SENHA ja tem caminho proprio, pelo perfil de cada um.
 */
@Injectable()
export class AtualizarUsuarioUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly repo: IAdminUserRepository,
  ) {}

  async execute(cmd: AtualizarUsuarioCmd): Promise<UsuarioPublico> {
    const alvo = await this.repo.findById(cmd.id);
    if (!alvo) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const dados: {
      nome?: string | null;
      telefone?: string | null;
      telefoneHash?: string | null;
      ativo?: boolean;
    } = {};

    // ======================================================================
    // DESLIGAR A CONTA — migracao 77, 09/11/2026.
    //
    // NINGUEM SE DESATIVA, e a trava e copiada do `RemoverUsuarioUseCase`,
    // que ja diz "voce nao pode remover a propria conta". E a mesma
    // consequencia por outro caminho: o ultimo SUPERADMIN se trancaria para
    // fora, e o conserto seria UPDATE em producao.
    //
    // A trava vale so para DESLIGAR. Reativar a si mesmo e inofensivo — e,
    // na pratica, impossivel: quem esta desligado nao entra para pedir.
    // ======================================================================
    if (cmd.ativo !== undefined) {
      if (!cmd.ativo && cmd.solicitanteId === cmd.id) {
        throw new BadRequestException('Você não pode desativar a própria conta');
      }
      dados.ativo = cmd.ativo;
    }

    if (cmd.nome !== undefined) {
      dados.nome = cmd.nome?.trim() || null;
    }

    if (cmd.telefone !== undefined) {
      const digitado = cmd.telefone?.trim() || '';

      if (!digitado) {
        // Apagar e uma operacao legitima: numero cadastrado errado precisa sair.
        dados.telefone = null;
        dados.telefoneHash = null;
      } else {
        const digitos = normalizarTelefone(digitado);
        if (digitos.length < 10 || digitos.length > 13) {
          throw new BadRequestException(
            'Telefone inválido. Use DDD + número, ex.: (99) 99999-9999',
          );
        }

        // A DUPLICATA IGNORA O PROPRIO USUARIO. Sem isso, salvar a tela sem
        // trocar o numero daria 409 contra ele mesmo — e o erro pareceria vir
        // do nada, porque nada mudou.
        for (const variante of variantesTelefone(digitado)) {
          const dup = await this.repo.buscarPorTelefoneHash(hashField(variante));
          if (dup && dup.id !== cmd.id) {
            throw new ConflictException('Já existe um usuário com este telefone');
          }
        }

        dados.telefone = digitado;
        dados.telefoneHash = hashField(digitos);
      }
    }

    // Nada a mudar: devolve como esta, sem tocar no banco.
    if (Object.keys(dados).length === 0) {
      return toUsuarioPublico(alvo);
    }

    const atualizado = await this.repo.atualizarDados(cmd.id, dados);

    // ======================================================================
    // DESLIGAR DERRUBA A SESSAO ABERTA — e nao so a proxima entrada.
    //
    // O access token ja emitido vale ate expirar (JWT_ACCESS_TTL, 8h no
    // default), e quem esta com a aba aberta nunca mais passa pelo login: so
    // renova. Zerando o refresh aqui, a sessao morre no primeiro F5, em vez
    // de arrastar por ate oito horas.
    //
    // E O MOTIVO E A FRASE DELE em 09/11: *"o usuario desativado nao acessa o
    // sistema"*. "Nao entra mais a partir da proxima vez" nao e o que isso
    // quer dizer.
    // ======================================================================
    if (dados.ativo === false) {
      await this.repo.updateRefreshToken(cmd.id, null, null);
    }

    return toUsuarioPublico(atualizado);
  }
}
