import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_CLIENT } from '../../agentes/domain/ports/injection-tokens';
import type {
  AnexoDaConversa,
  ILlmClient,
} from '../../agentes/domain/ports/llm-client.port';
import { modeloDeIa } from '../../../shared/config/modelo-de-ia';
import {
  corpoDoPedido,
  FICHA_NAO_BATE,
  MAXIMO_TOKENS,
  SEM_JOIA,
  SISTEMA_DO_PROMPT,
} from './molde-do-prompt-de-imagem';

/**
 * A FOTO VIRANDO PROMPT, ATRAS DE UMA PORTA SEM FERRAMENTA — 29/10/2026.
 *
 * ==========================================================================
 * POR QUE UMA CHAMADA SEPARADA, E NAO A FOTO NO TURNO DA AGENTE.
 *
 * E o mesmo desenho — e o mesmo motivo — do `AnalisarArquivoService`, de
 * 08/10. La esta escrito, e vale palavra por palavra aqui:
 *
 *   "Nao e a frase de aviso que protege. O que de fato impede o estrago e
 *    NAO HAVER FERRAMENTA NENHUMA na chamada que le o arquivo. Mesmo que a
 *    injecao funcione perfeitamente aqui, nao existe o que chamar."
 *
 * O formato de risco e identico: entra conteudo de fora — uma imagem e um
 * pedido DITADO POR AUDIO, transcrito sem ninguem ler — e sai texto. O audio
 * e o que fecha o paralelo: ninguem revisa uma transcricao antes de ela virar
 * mensagem, do mesmo jeito que ninguem le a celula 400 da planilha.
 *
 *   foto + pedido  ->  [chat() SEM ferramenta]  ->  prompt em ingles
 *
 * O `chat()` do cliente de LLM nao declara ferramenta alguma, por construcao.
 * E por isso que esta geracao usa `chat` e nao `chatComFerramentas` — e o
 * spec quebra se alguem trocar.
 * ==========================================================================
 */

/**
 * No feitio do `AnaliseDeArquivo`: os dois opcionais, e quem consome testa o
 * POSITIVO. Um so idioma de resultado nos dois servicos que leem conteudo de
 * fora.
 */
export interface PromptDeImagem {
  /** O prompt em ingles, pronto para colar. */
  prompt?: string;
  /** O que dizer a ele quando nao deu. */
  falha?: string;
}

@Injectable()
export class PromptDeImagemService {
  private readonly logger = new Logger(PromptDeImagemService.name);

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: ILlmClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * @param anexo a foto da peca, ja em base64 — ver `AnexoDaConversa`.
   * @param pedido o que ele escreveu ou ditou, em portugues. Pode ser vazio.
   */
  async gerar(entrada: {
    anexo: AnexoDaConversa;
    pedido: string;
    /** O que o cadastro sabe da peca, quando ele mandou a referencia. */
    ficha?: string | null;
  }): Promise<PromptDeImagem> {
    const { anexo, pedido, ficha } = entrada;

    try {
      const { texto } = await this.llm.chat({
        model: modeloDeIa(
          this.config,
          'ANTHROPIC_MODEL_GESTAO',
          'claude-opus-4-8',
        ),
        system: SISTEMA_DO_PROMPT,
        maxTokens: MAXIMO_TOKENS,
        mensagens: [{ role: 'user', content: corpoDoPedido(pedido, ficha) }],
        // SEM FERRAMENTA: `chat` nao declara nenhuma. Ver o cabecalho.
        anexos: [anexo],
      });

      const prompt = texto.trim();

      if (!prompt) {
        this.logger.warn('O prompt de imagem voltou vazio.');
        return {
          falha:
            'Recebi a foto mas não consegui escrever o prompt. Me manda a foto de novo?',
        };
      }

      // A PECA TEM DE ESTAR NA FOTO. O modelo olha e responde em texto — a
      // mesma guarda que o catalogo faz antes de gerar, pela mesma razao: sem
      // peca na entrada, o que sai e a peca mais provavel, e nao a dela.
      if (prompt.toUpperCase().includes(SEM_JOIA)) {
        return {
          falha:
            'Não consegui ver uma joia nessa foto. Manda a foto da peça que eu escrevo o prompt.',
        };
      }

      // A FICHA DESCREVE OUTRA PECA. Dizer, e nao conciliar: um prompt que
      // junta o cadastro de um anel com a foto de um colar descreve uma peca
      // que nao existe — e e a IA de imagem que vai fabrica-la.
      if (prompt.toUpperCase().includes(FICHA_NAO_BATE)) {
        return {
          falha:
            'Essa referência não bate com a foto — o cadastro descreve outra peça. ' +
            'Confere o código, ou manda sem ele que eu escrevo pela foto.',
        };
      }

      // So METADADO no log: o prompt descreve peca da casa.
      this.logger.debug(`Prompt de imagem escrito — ${prompt.length} caracteres.`);

      return { prompt };
    } catch (err) {
      this.logger.error(
        `Falha ao escrever o prompt de imagem: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        falha:
          'Não consegui escrever o prompt agora. Me manda a foto de novo daqui a pouco.',
      };
    }
  }
}
