import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Estourou o teto de envio. Erro PROPRIO, e nao um `Error` qualquer, para quem
 * chama poder distinguir "o WAHA recusou" de "nos recusamos" — sao problemas
 * diferentes e a reacao certa e diferente.
 */
export class LimiteDeEnvioExcedido extends Error {
  constructor(motivo: string) {
    super(`Limite de envio excedido: ${motivo}`);
    this.name = 'LimiteDeEnvioExcedido';
  }
}

/** Uma hora. Janela padrao quando o `.env` nao diz outra. */
const JANELA_PADRAO_MINUTOS = 60;

/**
 * Teto por DESTINO. Trinta mensagens para a mesma pessoa numa hora ja e muito
 * acima de qualquer conversa real — a vendedora mais falante nao passa disso
 * com a agente. Quem chega aqui e laco, nao gente.
 */
const PADRAO_POR_DESTINO = 30;

/**
 * Teto por NUMERO DA CASA. O mesmo numero atende toda a equipe, entao ele
 * precisa de folga: 8 vendedoras conversando ao mesmo tempo passam facil de
 * 150 mensagens numa hora movimentada.
 *
 * Trezentos nao e "o quanto e seguro mandar" — e o ponto em que alguma coisa
 * claramente quebrou. O limite que protege de verdade contra bloqueio da Meta
 * e nao existir disparo em massa (RF-11); este aqui e a rede embaixo.
 */
const PADRAO_POR_NUMERO = 300;

/**
 * O TETO DE ENVIO PELO WHATSAPP — requisito RF-12, 28/09/2026.
 *
 * ==========================================================================
 * ISTO NAO E O QUE IMPEDE DISPARO EM MASSA. E A REDE EMBAIXO.
 *
 * O que impede disparo em massa e nao existir caminho para ele: sem endpoint,
 * sem tela, sem comando, sem job que mande para varios contatos (auditado em
 * 28/09, requisito RF-11). O documento pede este limite como protecao contra
 * "envio em lote ACIDENTAL" — laco que nao termina, retry sem teto, fila
 * represada que despeja de uma vez depois de o servidor voltar.
 *
 * E o risco e concreto e caro: contas de WhatsApp foram bloqueadas
 * definitivamente por envio em volume, com perda dos contatos e das conversas.
 * ==========================================================================
 *
 * DOIS TETOS, PORQUE SAO DOIS ACIDENTES DIFERENTES:
 *
 *   por destino  -> o laco que insiste com UMA pessoa
 *   por numero   -> a fila represada que despeja para MUITAS
 *
 * Um teto so deixaria um dos dois passar: 300 por numero nao salva quem levou
 * 300 mensagens sozinho, e 30 por destino nao impede 30 para cada um de 200.
 *
 * ==========================================================================
 * A CONTAGEM E EM MEMORIA, E ISSO TEM CONSEQUENCIA.
 *
 * Reiniciar o processo zera os contadores, e duas instancias contariam
 * separado. E aceitavel aqui porque a aplicacao roda em UM container — a mesma
 * premissa do `PermissionsService` e do `MemoriaConversaService` — e porque
 * errar para o lado de deixar passar e melhor do que uma dependencia nova no
 * caminho de toda mensagem enviada.
 *
 * Se um dia houver mais de uma instancia, este e o arquivo a trocar por Redis,
 * e o contrato (`registrar`) nao muda.
 * ==========================================================================
 */
@Injectable()
export class LimiteDeEnvioService {
  private readonly logger = new Logger(LimiteDeEnvioService.name);

  /** chave -> carimbos dos envios dentro da janela. */
  private readonly envios = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  private numeroDoEnv(chave: string, padrao: number): number {
    const bruto = this.config.get<string>(chave);
    const n = Number(bruto);
    // `Number('')` e 0 e `Number(undefined)` e NaN — os dois cairiam em zero
    // e bloqueariam TODO envio. Configuracao ausente tem de virar o padrao, e
    // nao um sistema mudo.
    return Number.isFinite(n) && n > 0 ? n : padrao;
  }

  private get janelaMs(): number {
    return this.numeroDoEnv('WHATSAPP_JANELA_MINUTOS', JANELA_PADRAO_MINUTOS) * 60_000;
  }

  /**
   * Registra um envio e devolve. LANCA `LimiteDeEnvioExcedido` quando o teto
   * ja foi atingido.
   *
   * LANCA, e nao devolve `false` silencioso. Quem chama precisa saber que a
   * mensagem NAO saiu: o `DispararPendenciasUseCase` so marca a interacao como
   * enviada depois que o envio confirma, e um `return` mudo aqui faria ele
   * marcar como enviada uma mensagem que nunca saiu — o erro pior, porque
   * apaga a pendencia sem resolver nada.
   *
   * @param destino chatId de quem vai receber
   * @param numero  a sessao da casa que envia (o chip)
   */
  registrar(destino: string, numero: string, agora = Date.now()): void {
    const janela = this.janelaMs;
    const porDestino = this.numeroDoEnv(
      'WHATSAPP_LIMITE_POR_DESTINO',
      PADRAO_POR_DESTINO,
    );
    const porNumero = this.numeroDoEnv(
      'WHATSAPP_LIMITE_POR_NUMERO',
      PADRAO_POR_NUMERO,
    );

    const chaveDestino = `d:${numero}:${destino}`;
    const chaveNumero = `n:${numero}`;

    const dosDestino = this.dentroDaJanela(chaveDestino, agora, janela);
    const doNumero = this.dentroDaJanela(chaveNumero, agora, janela);

    // A CHECAGEM VEM ANTES DO REGISTRO. Registrando primeiro, a mensagem
    // recusada ainda contaria — e um laco travado ficaria empurrando a janela
    // para a frente sozinho, sem nunca voltar a poder enviar.
    if (dosDestino.length >= porDestino) {
      this.bloquear(`${dosDestino.length} envios para o mesmo destino`, numero);
    }
    if (doNumero.length >= porNumero) {
      this.bloquear(`${doNumero.length} envios pelo número`, numero);
    }

    dosDestino.push(agora);
    doNumero.push(agora);
    this.envios.set(chaveDestino, dosDestino);
    this.envios.set(chaveNumero, doNumero);
  }

  private bloquear(motivo: string, numero: string): never {
    // O LOG E PARTE DO REQUISITO ("bloquear e registrar em log"), e por isso e
    // `error` e nao `warn`: chegar aqui significa que alguma coisa esta em
    // laco, e ninguem vai procurar por isso ate ver a linha vermelha.
    //
    // Sem o destino no texto — chatId e telefone, e telefone e PII.
    this.logger.error(
      `Envio BLOQUEADO pela sessão ${numero}: ${motivo} na janela configurada. ` +
        `Verifique laço de repetição ou fila represada antes de aumentar o teto.`,
    );
    throw new LimiteDeEnvioExcedido(motivo);
  }

  /** Os carimbos ainda dentro da janela, descartando os velhos no caminho. */
  private dentroDaJanela(
    chave: string,
    agora: number,
    janela: number,
  ): number[] {
    const todos = this.envios.get(chave) ?? [];
    return todos.filter((t) => agora - t < janela);
  }

  /**
   * Esquece tudo. Existe para os testes e para um eventual comando de
   * operacao — "destravei o laco, pode voltar a enviar" — sem exigir restart.
   */
  limpar(): void {
    this.envios.clear();
  }
}
