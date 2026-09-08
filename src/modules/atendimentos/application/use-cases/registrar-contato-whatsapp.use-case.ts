import { Inject, Injectable, Logger } from '@nestjs/common';
import { BuscarClientePorWhatsappUseCase } from '../../../clientes/application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { ATENDIMENTO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IAtendimentoRepository } from '../../domain/ports/repositories/atendimento-repository.port';
import type { TipoInteracao } from '../../domain/entities/enums';

export interface ContatoNoWhatsapp {
  /** A vendedora dona do numero em que a mensagem passou. */
  vendedoraId: string;
  /** O telefone do outro lado, em plaintext (com ou sem formatacao). */
  telefone: string;
  /** true = a vendedora escreveu; false = a cliente escreveu. */
  daVendedora: boolean;
  /** Quando a mensagem passou. */
  em: Date;
}

export type ResultadoContato =
  | { registrado: true; atendimentoId: string; tipo: TipoInteracao }
  | {
      registrado: false;
      motivo: 'cliente_desconhecido' | 'repetido_na_janela';
    };

/**
 * Quanto tempo uma conversa continua sendo O MESMO contato.
 *
 * Sem isto, oito mensagens em cinco minutos virariam oito pontos identicos na
 * regua — a leitura de relance ficaria pior, nao melhor. Quinze minutos separa
 * "ela mandou uma sequencia de mensagens" de "ela voltou a falar".
 */
const JANELA_MESMO_CONTATO_MIN = 15;

/**
 * A conversa no numero corporativo da vendedora vira interacao do atendimento
 * — MEL-14 e MEL-17.
 *
 * ==========================================================================
 * O CONTEUDO DA MENSAGEM NAO PASSA POR AQUI, E ISSO E DE PROPOSITO.
 *
 * O QR da acesso a CONTA da vendedora, nao ao trabalho dela (migracao 39).
 * Copiar as mensagens para o nosso banco faria o sistema guardar a conta
 * inteira, inclusive o que nao e da loja — e o WAHA ja guarda, e a aba
 * Conversas le ao vivo. O que fica registrado e o FATO: quem falou, quando, e
 * em que atendimento.
 *
 * A leitura da conversa — "procurando brincos", "fechou", "encerrou" — e outra
 * etapa (MEL-15): ela escreve uma linha curta no `relato`, que ja e cifrado.
 * ==========================================================================
 *
 * ISTO NAO RESPONDE NADA. Nenhum agente e chamado, nenhuma mensagem sai. A
 * garantia esta em dois lugares do codigo, e nao aqui: o webhook nao roteia o
 * que nao vem da loja, e o `WahaGateway` so sabe enviar pelo `WAHA_SESSION`.
 */
@Injectable()
export class RegistrarContatoWhatsappUseCase {
  private readonly logger = new Logger(RegistrarContatoWhatsappUseCase.name);

  constructor(
    @Inject(ATENDIMENTO_REPOSITORY)
    private readonly repo: IAtendimentoRepository,
    private readonly buscarCliente: BuscarClientePorWhatsappUseCase,
  ) {}

  async execute(entrada: ContatoNoWhatsapp): Promise<ResultadoContato> {
    const cliente = await this.buscarCliente.execute(entrada.telefone);

    // ======================================================================
    // NUMERO DESCONHECIDO NAO VIRA CADASTRO.
    //
    // O atendimento exige `cliente_id NOT NULL`, entao registrar exigiria
    // criar um cliente. E o numero da vendedora recebe de tudo: familia,
    // fornecedor, grupo de bairro. Cadastrar cada um deles sujaria a base de
    // clientes com gente que nunca comprou nada — e a base de clientes e o
    // que alimenta carteira, metas e analytics.
    //
    // Quem chega sem cadastro e assunto da TRIAGEM, no numero da loja, que e
    // onde existe fluxo para isso.
    // ======================================================================
    if (!cliente?.id) {
      return { registrado: false, motivo: 'cliente_desconhecido' };
    }

    const tipo: TipoInteracao = entrada.daVendedora
      ? 'RESPOSTA_VENDEDORA'
      : 'CONTATO_CLIENTE';

    // O episodio em curso, ou um novo. `buscarAbertoPorCliente` devolve o
    // unico aberto — o banco garante no maximo um por cliente.
    let atendimento = await this.repo.buscarAbertoPorCliente(cliente.id);
    if (!atendimento) {
      atendimento = await this.repo.abrir({
        clienteId: cliente.id,
        vendedoraId: entrada.vendedoraId,
      });
      this.logger.log(
        `Atendimento aberto pelo contato no WhatsApp da vendedora ${entrada.vendedoraId}.`,
      );
    }

    // ======================================================================
    // O ATENDIMENTO ABERTO PODE SER DE OUTRA VENDEDORA, E ELE MANDA.
    //
    // Se a cliente ja esta sendo atendida pela Bianca e escreve para a Marina,
    // o ponto entra no episodio da Bianca — que e a verdade do que aconteceu.
    // Reatribuir o atendimento por causa de uma mensagem tiraria a cliente da
    // carteira de quem esta negociando com ela, sem ninguem decidir isso.
    // ======================================================================
    const anterior = await this.repo.ultimaInteracao(atendimento.id, tipo);
    if (anterior && dentroDaJanela(anterior.ocorridoEm, entrada.em)) {
      return { registrado: false, motivo: 'repetido_na_janela' };
    }

    await this.repo.criarInteracao({
      atendimentoId: atendimento.id,
      tipo,
      ocorridoEm: entrada.em,
      // CONCLUIDA porque ja aconteceu: nao ha disparo pendente nem resposta a
      // esperar. Os status de espera sao dos avisos que NOS mandamos.
      status: 'CONCLUIDA',
    });

    return { registrado: true, atendimentoId: atendimento.id, tipo };
  }
}

function dentroDaJanela(anterior: Date | null, agora: Date): boolean {
  if (!anterior) return false;
  const minutos = (agora.getTime() - anterior.getTime()) / 60000;
  return minutos >= 0 && minutos < JANELA_MESMO_CONTATO_MIN;
}
