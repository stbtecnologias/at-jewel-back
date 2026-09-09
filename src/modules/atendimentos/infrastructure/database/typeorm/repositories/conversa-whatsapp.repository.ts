import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  encryptedTransformer,
  hashField,
} from '../../../../../../shared/database/transformers/encrypted-column.transformer';
import type {
  ConversaWhatsapp,
  DadosDaMensagem,
  FechamentoDaLeitura,
  IConversaWhatsappRepository,
} from '../../../../domain/ports/repositories/conversa-whatsapp-repository.port';
import { ConversaWhatsappOrmEntity } from '../entities/conversa-whatsapp.orm-entity';

@Injectable()
export class ConversaWhatsappRepository implements IConversaWhatsappRepository {
  constructor(
    @InjectRepository(ConversaWhatsappOrmEntity)
    private readonly repo: Repository<ConversaWhatsappOrmEntity>,
  ) {}

  /**
   * UPSERT em SQL, e nao "busca depois grava".
   *
   * O webhook e concorrente por natureza: duas mensagens da mesma conversa
   * podem chegar no mesmo instante, e o par busca+insert perderia a corrida
   * contra a chave unica. `ON CONFLICT` resolve no banco.
   *
   * REPARE NO `GREATEST` e no `COALESCE`:
   *
   *   - `ultima_mensagem_em` nunca ANDA PARA TRAS. Evento reentregue pelo WAHA
   *     com timestamp velho nao pode desfazer o relogio da conversa.
   *   - `cliente_id` so e preenchido, nunca apagado. Uma vez que se sabe de
   *     quem e a conversa, mensagem seguinte sem cliente nao desfaz o vinculo.
   *
   * ======================================================================
   * A CONVERSA IGNORADA NAO VOLTA PARA A FILA A CADA MENSAGEM.
   *
   * Quem foi julgado como "isto nao e assunto da loja" — o grupo do bairro, a
   * familia, a operadora — continua recebendo mensagem o dia inteiro. Se cada
   * uma recolocasse a conversa na fila de uma hora, pagariamos uma leitura por
   * hora, para sempre, para reconfirmar o obvio.
   *
   * Entao IGNORADA permanece IGNORADA, e a reavaliacao fica marcada para 24h
   * depois da mensagem. A porta continua aberta — quem falava de outra coisa
   * pode passar a falar de joia — mas com o custo limitado a uma leitura por
   * dia por conversa.
   * ======================================================================
   */
  async registrarMensagem(dados: DadosDaMensagem): Promise<void> {
    await this.repo.query(
      `INSERT INTO conversas_whatsapp
         (vendedora_id, chat_id, chat_id_hash, cliente_id,
          ultima_mensagem_em, ler_em, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'AGUARDANDO')
       ON CONFLICT (vendedora_id, chat_id_hash) DO UPDATE SET
         ultima_mensagem_em = GREATEST(conversas_whatsapp.ultima_mensagem_em, EXCLUDED.ultima_mensagem_em),
         ler_em = CASE
           WHEN conversas_whatsapp.estado = 'IGNORADA'
             THEN COALESCE(
                    conversas_whatsapp.ler_em,
                    EXCLUDED.ultima_mensagem_em + interval '24 hours'
                  )
           ELSE LEAST(
                  EXCLUDED.ler_em,
                  -- O TETO DA CONVERSA QUE NAO PARA.
                  --
                  -- "Ler uma hora depois de a conversa parar" tem um buraco: a
                  -- conversa que nao para nunca e lida, porque cada mensagem
                  -- empurra o relogio. Seis horas depois da ultima leitura (ou
                  -- do inicio, se nunca houve) o adiamento acaba e se le do
                  -- jeito que estiver.
                  COALESCE(conversas_whatsapp.lida_ate, conversas_whatsapp.criado_em)
                    + interval '6 hours'
                )
         END,
         estado = CASE
           WHEN conversas_whatsapp.estado = 'IGNORADA'
             THEN 'IGNORADA'::estado_conversa_whatsapp
           ELSE 'AGUARDANDO'::estado_conversa_whatsapp
         END,
         cliente_id         = COALESCE(conversas_whatsapp.cliente_id, EXCLUDED.cliente_id),
         atualizado_em      = now()`,
      [
        dados.vendedoraId,
        // A cifra e do transformer do ORM; em SQL cru ela nao acontece
        // sozinha, entao e feita aqui.
        cifrar(dados.chatId),
        hashField(dados.chatId),
        dados.clienteId ?? null,
        dados.em,
        dados.lerEm,
      ],
    );
  }

  async listarParaLeitura(agora: Date, limite: number): Promise<ConversaWhatsapp[]> {
    const linhas = await this.repo.find({
      where: { lerEm: LessThanOrEqual(agora) },
      order: { lerEm: 'ASC' },
      take: limite,
    });
    return linhas.map(paraDominio);
  }

  async concluirLeitura(id: string, dados: FechamentoDaLeitura): Promise<void> {
    await this.repo.update(id, {
      lidaAte: dados.lidaAte,
      estado: dados.estado,
      lerEm: dados.lerEm,
      tentativas: 0,
      ...(dados.clienteId !== undefined ? { clienteId: dados.clienteId } : {}),
      ...(dados.atendimentoId !== undefined
        ? { atendimentoId: dados.atendimentoId }
        : {}),
      ...(dados.leadId !== undefined ? { leadId: dados.leadId } : {}),
    });
  }

  /** `lida_ate` fica de fora de proposito: falha nao move a marca d'agua. */
  async registrarFalha(id: string, proximaTentativa: Date | null): Promise<void> {
    await this.repo.query(
      `UPDATE conversas_whatsapp
          SET tentativas = tentativas + 1,
              ler_em = $2,
              atualizado_em = now()
        WHERE id = $1`,
      [id, proximaTentativa],
    );
  }
}

/**
 * A cifra do `chat_id` para o caminho de SQL cru.
 *
 * O transformer do TypeORM so roda quando o ORM monta a query; o UPSERT acima
 * e texto puro, entao o valor passaria em claro. Reusa o MESMO transformer
 * para nao existirem dois formatos de ciphertext no banco.
 */
function cifrar(valor: string): string {
  const cifrado = encryptedTransformer.to(valor);
  if (cifrado === null) throw new Error('chatId vazio nao pode ser cifrado');
  return cifrado;
}

function paraDominio(o: ConversaWhatsappOrmEntity): ConversaWhatsapp {
  return {
    id: o.id,
    vendedoraId: o.vendedoraId,
    chatId: o.chatId,
    clienteId: o.clienteId,
    atendimentoId: o.atendimentoId,
    leadId: o.leadId,
    ultimaMensagemEm: o.ultimaMensagemEm,
    lidaAte: o.lidaAte,
    lerEm: o.lerEm,
    estado: o.estado,
    tentativas: o.tentativas,
  };
}
