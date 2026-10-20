import { Inject, Injectable } from '@nestjs/common';
import { ADMIN_USER_REPOSITORY } from '../../auth/domain/ports/injection-tokens';
import type { IAdminUserRepository } from '../../auth/domain/ports/repositories/admin-user-repository.port';
import { VENDEDORA_REPOSITORY } from '../../vendedoras/domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../vendedoras/domain/ports/repositories/vendedora-repository.port';
import { hashField } from '../../../shared/database/transformers/encrypted-column.transformer';
import { variantesTelefone } from '../../clientes/application/utils/normalizadores';

/**
 * Quem é a pessoa do outro lado, quando ela é da casa.
 *
 * A VENDEDORA é a vendedora. O resto vem do `role` da conta de painel, que é
 * quem sabe se aquele telefone é do financeiro, da gerência ou da
 * administração.
 */
export type PapelDeDentro =
  | 'VENDEDORA'
  | 'SUPERADMIN'
  | 'ADMIN'
  | 'GERENTE'
  | 'GERENTE_VENDAS'
  | 'ESTOQUISTA'
  | 'MARKETING';

/**
 * QUEM É GENTE DA CASA — RF29 e RF30, 20/10/2026.
 *
 * ==========================================================================
 * A ETIQUETA NÃO SE CADASTRA: ELA SE DEDUZ DO NÚMERO.
 *
 * O pedido da reunião de 19/10 foi *"etiquetar quem é admin, vendedora e
 * gerente nas conversas, e poder não visualizar o interno na timeline"*. A
 * leitura óbvia seria uma tabela de contatos e uma coluna gravada em cada
 * interação — e as duas seriam piores.
 *
 * Gravada, a etiqueta congela no dia em que a linha nasceu: quem trocar de
 * telefone, quem entrar na equipe depois e quem já está na base ficam de fora
 * até alguém rodar um backfill. **Derivada, ela vale para trás e para a
 * frente sem migração nenhuma** — os 53 RELATOs que já estão na timeline
 * aparecem marcados na primeira vez que a tela abrir.
 *
 * E foi o pedido do Lucas em 20/10: *"quando elas cadastrarem novos
 * telefones, já sejam lidos também."* Por isso aqui **não há cache**. O
 * conjunto é montado a cada pergunta, de 23 vendedoras e 10 contas — algumas
 * dezenas de HMACs, menos do que a consulta que vem junto. Telefone
 * cadastrado agora vale na próxima tela que abrir, e não em cinco minutos.
 * ==========================================================================
 *
 * SÃO TRÊS ORIGENS DE NÚMERO, e não uma:
 *
 *   vendedoras.whatsapp_interno   — o pessoal dela
 *   vendedoras.whatsapp_externo   — o corporativo, o que fala com cliente
 *   admin_users.telefone          — financeiro, gerência, administração
 *
 * Medido em 20/10: das 23 vendedoras, **7 têm o corporativo e NENHUMA tem o
 * pessoal**; das 10 contas de painel, 6 têm telefone. O campo do pessoal
 * existe e está vazio — então vendedora falando do celular dela ainda não é
 * reconhecida, e isso é cadastro, não código.
 */
@Injectable()
export class GenteDaCasaService {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly vendedoras: IVendedoraRepository,
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly admins: IAdminUserRepository,
  ) {}

  /**
   * O mapa `hash do telefone -> papel`, pronto para consultar.
   *
   * Duas consultas e nenhum cache. Ver o cabeçalho.
   */
  async mapa(): Promise<MapaDeDentro> {
    const porHash = new Map<string, PapelDeDentro>();

    const guardar = (numero: string | null | undefined, papel: PapelDeDentro) => {
      if (!numero?.trim()) return;
      for (const v of variantesTelefone(numero)) {
        // ================================================================
        // DUAS FORMAS POR VARIANTE: SOLTA E COM `@c.us`.
        //
        // `conversas_whatsapp.chat_id_hash` nao e o hash do telefone — e o
        // hash do CHAT ID, `<telefone>@c.us` (ver
        // `RegistrarContatoWhatsappUseCase`). Guardando so a forma solta, a
        // conferencia de 20/10 devolveu ZERO conversas de gente de dentro, e
        // zero tinha cara de "nao tem".
        //
        // E a terceira vez que esta armadilha aparece no projeto: filtrar por
        // coluna que nao casa devolve vazio, e vazio parece resposta.
        // ================================================================
        if (!porHash.has(hashField(v))) porHash.set(hashField(v), papel);
        const comSufixo = hashField(`${v}@c.us`);
        if (!porHash.has(comSufixo)) porHash.set(comSufixo, papel);
      }
    };

    // A VENDEDORA PRIMEIRO, e a ordem importa: quem é vendedora E tem conta de
    // painel (a gerente de vendas, hoje) aparece como VENDEDORA na timeline,
    // que é a faixa em que ela está.
    for (const v of await this.vendedoras.listar({})) {
      guardar(v.whatsappInterno, 'VENDEDORA');
      guardar(v.whatsappExterno, 'VENDEDORA');
    }

    for (const a of await this.admins.listarTodos()) {
      guardar(a.telefone, papelDoRole(a.role));
    }

    return new MapaDeDentro(porHash);
  }
}

/** O que o mapa responde. Imutável — quem o recebeu não mexe nele. */
export class MapaDeDentro {
  constructor(private readonly porHash: ReadonlyMap<string, PapelDeDentro>) {}

  /** Todos os hashes, para quem precisa cruzar com uma coluna do banco. */
  hashes(): string[] {
    return [...this.porHash.keys()];
  }

  /** O papel de um hash já calculado, ou `null` se não é gente da casa. */
  papelDoHash(hash: string | null | undefined): PapelDeDentro | null {
    return hash ? (this.porHash.get(hash) ?? null) : null;
  }

  /**
   * O papel de quem está num chat do WhatsApp.
   *
   * Recebe o `chatId` como a tela o tem (`5585...@c.us`) e tenta o valor como
   * veio; as variantes já estão no mapa, então não há normalização aqui.
   */
  papelDoChat(chatId: string | null | undefined): PapelDeDentro | null {
    if (!chatId?.trim()) return null;
    return this.papelDoHash(hashField(chatId.trim()));
  }

  /** Há alguém marcado? Falso quando ninguém tem telefone cadastrado. */
  vazio(): boolean {
    return this.porHash.size === 0;
  }
}

/**
 * O papel vem do `role` da conta, e papel desconhecido vira ADMIN.
 *
 * VALIDADO, E NAO CONVERTIDO: `role` e texto no banco, e um valor novo
 * criado na tela de Papeis nao pode virar etiqueta inventada na timeline.
 * Cair em ADMIN e honesto — a pessoa E da casa, e o que se perde e so a
 * precisao do rotulo.
 */
function papelDoRole(role: string | null | undefined): PapelDeDentro {
  switch ((role ?? '').toUpperCase()) {
    case 'SUPERADMIN':
      return 'SUPERADMIN';
    case 'GERENTE':
      return 'GERENTE';
    case 'GERENTE_VENDAS':
      return 'GERENTE_VENDAS';
    case 'ESTOQUISTA':
      return 'ESTOQUISTA';
    case 'MARKETING':
      return 'MARKETING';
    default:
      return 'ADMIN';
  }
}
