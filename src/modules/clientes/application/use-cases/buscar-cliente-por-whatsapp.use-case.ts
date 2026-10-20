import { Inject, Injectable, Logger } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import { Cliente } from '../../domain/entities/cliente.entity';
import {
  CLIENTE_PERFIL_REPOSITORY,
  CLIENTE_REPOSITORY,
} from '../../domain/ports/injection-tokens';
import type { IClientePerfilRepository } from '../../domain/ports/repositories/cliente-perfil-repository.port';
import type { IClienteRepository } from '../../domain/ports/repositories/cliente-repository.port';
import { variantesTelefone } from '../utils/normalizadores';

@Injectable()
export class BuscarClientePorWhatsappUseCase {
  private readonly logger = new Logger(BuscarClientePorWhatsappUseCase.name);

  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clienteRepo: IClienteRepository,
    @Inject(CLIENTE_PERFIL_REPOSITORY)
    private readonly perfilRepo: IClientePerfilRepository,
  ) {}

  /**
   * Recebe o numero em plaintext (com ou sem formatacao) e devolve o cliente
   * com perfil carregado, ou null se for numero desconhecido.
   *
   * Lookup principal da Anastasia ao receber mensagem no WhatsApp — e o passo
   * que decide entre CONTINUAR uma conversa e CRIAR um lead. Por isso tenta
   * todas as formas equivalentes do numero (nono digito, DDI): um falso
   * negativo aqui nao da erro, ele cria um cliente duplicado em silencio.
   *
   * Sao no maximo 4 consultas por hash indexado, e a forma recebida vem
   * primeiro — no caso comum resolve na primeira.
   *
   * ========================================================================
   * DOIS LUGARES GUARDAM TELEFONE, E SO UM ESTAVA SENDO OLHADO — RF41,
   * 20/10/2026.
   *
   * `clientes_perfil.whatsapp_hash` so nasce quando o cliente tem WhatsApp no
   * cadastro. Em producao, medido em 20/10, essa tabela tem **0 linhas** —
   * enquanto `clientes.telefone_1_hash` esta preenchida em **774 dos 1.110**
   * clientes. Olhando so a primeira, o reconhecimento por telefone NUNCA
   * achava ninguem, e toda conversa de cliente que existe no ERP tomava o
   * galho do lead.
   *
   * A queda para `telefone_1_hash` ja existia — mas DENTRO de um chamador, o
   * `RegistrarLeadUseCase`, e por isso os outros quatro nao a herdavam. O
   * grave era `LerConversaWhatsappUseCase`, a linha que decide RELATO ou
   * LEAD. Agora a queda e deste use case, e os cinco a herdam.
   *
   * O PRECO DE OLHAR OS DOIS: `telefone_1_hash` nao e unica desde a migracao
   * 36 — 19 numeros servem a mais de um cliente, e um deles serve a oito.
   * Entao aqui N > 1 e AMBIGUIDADE e devolve `null`: nao se adivinha de quem
   * e a mensagem. O comportamento nesses casos fica igual ao de hoje, e nos
   * outros 728 passa a acertar.
   * ========================================================================
   */
  async execute(whatsapp: string): Promise<Cliente | null> {
    const variantes = variantesTelefone(whatsapp);

    // PRIMEIRO O WHATSAPP, e a ordem importa: `whatsapp_hash` e o numero que
    // a pessoa REALMENTE usa para falar com a loja, e e unico por perfil.
    // Achando por ele, nao ha ambiguidade possivel.
    for (const variante of variantes) {
      const perfil = await this.perfilRepo.buscarPorWhatsappHash(
        hashField(variante),
      );
      if (perfil) {
        return this.clienteRepo.buscarPorId(perfil.clienteId, {
          incluirPerfil: true,
        });
      }
    }

    // DEPOIS O TELEFONE DO CADASTRO. Varre TODAS as variantes antes de
    // decidir, e nao para na primeira que acha: duas formas do mesmo numero
    // apontando para clientes diferentes tambem e ambiguidade, e parar na
    // primeira esconderia isso atras da ordem das variantes.
    const achados = new Map<string, Cliente>();
    for (const variante of variantes) {
      const mesmos = await this.clienteRepo.listarPorTelefone1Hash(
        hashField(variante),
      );
      for (const c of mesmos) {
        if (c.id) achados.set(c.id, c);
      }
    }

    if (achados.size === 0) return null;

    if (achados.size > 1) {
      // SEM TELEFONE E SEM NOME NO LOG — a contagem e o que serve para
      // alguem resolver o cadastro depois.
      this.logger.warn(
        `Telefone de cadastro serve a ${achados.size} clientes: nao da para dizer de quem e a mensagem, segue como desconhecido`,
      );
      return null;
    }

    const [unico] = achados.values();
    // De novo por id, para vir com perfil como no caminho do WhatsApp — quem
    // chama recebe a mesma coisa, venha de onde vier.
    return this.clienteRepo.buscarPorId(unico.id!, { incluirPerfil: true });
  }
}
