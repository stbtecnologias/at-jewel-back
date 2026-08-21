import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LIMITE_BYTES,
  type AudioParaTranscrever,
  type ITranscricao,
} from '../../domain/ports/transcricao.port';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MODELO_PADRAO = 'gpt-4o-mini-transcribe';
const TIMEOUT_MS = 60_000;

/**
 * Vocabulario da casa, enviado como dica ao modelo.
 *
 * NAO E ENFEITE. Medido em 21/08/2026 com um audio real de 5 segundos: sem a
 * dica, "quais sao os meus clientes" foi transcrito como "quais sao os
 * musclings". Com a dica, saiu certo. Palavra de joalheria e ainda pior — sem
 * contexto, "rodio" vira "rodeio" e "meia alianca" vira qualquer coisa.
 *
 * Nao e instrucao nem prompt de sistema: e so uma lista de palavras provaveis.
 * O modelo de transcricao nao obedece ordens daqui, entao nao ha superficie de
 * injecao neste campo.
 */
const VOCABULARIO =
  'Joalheria. Vocabulário: aliança, meia aliança, ródio, ouro 18k, prata 925, ' +
  'brinco, gargantilha, pingente, pulseira, corrente, anel solitário, ' +
  'consignação, mostruário, zircônia, esmeralda, safira, banho de ouro, ' +
  'vendedora, cliente, agenda, meta, retorno.';

/**
 * Transcricao via API de audio da OpenAI.
 *
 * O UNICO ponto do backend que fala com um provedor fora da Anthropic. O audio
 * sai daqui e nao volta: nao gravamos o arquivo, nao guardamos a resposta bruta,
 * e o texto segue como se tivesse sido digitado.
 *
 * ESCOLHA DO MODELO — o menor ganhou. No teste de 21/08 o `gpt-4o-transcribe`
 * errou onde o `gpt-4o-mini-transcribe` acertou, e demorou o dobro. Fica em
 * variavel de ambiente (`OPENAI_TRANSCRICAO_MODEL`) porque isso pode mudar sem
 * aviso, e trocar nao deve exigir deploy de codigo.
 */
@Injectable()
export class OpenaiTranscricaoClient implements ITranscricao {
  private readonly logger = new Logger(OpenaiTranscricaoClient.name);

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY'));
  }

  async transcrever(audio: AudioParaTranscrever): Promise<string | null> {
    const chave = this.config.get<string>('OPENAI_API_KEY');
    if (!chave) {
      this.logger.warn('OPENAI_API_KEY ausente — audio nao transcrito.');
      return null;
    }

    if (audio.conteudo.length > LIMITE_BYTES) {
      this.logger.warn(
        `Audio de ${audio.conteudo.length} bytes acima do teto — descartado.`,
      );
      return null;
    }
    if (audio.conteudo.length === 0) return null;

    const modelo =
      this.config.get<string>('OPENAI_TRANSCRICAO_MODEL') ?? MODELO_PADRAO;

    // O mimetype do WhatsApp vem com parametro (`audio/ogg; codecs=opus`); a
    // OpenAI so quer o tipo, e a extensao do nome e o que ela usa para decidir
    // o decoder.
    const tipo = audio.mimetype.split(';')[0].trim();
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audio.conteudo)], { type: tipo }),
      audio.nomeArquivo ?? `audio.${extensaoDe(tipo)}`,
    );
    form.append('model', modelo);
    // Fixo em portugues: dizer o idioma corta erro e tempo pela metade, e nao
    // ha cenario aqui em que a vendedora fale outra lingua.
    form.append('language', 'pt');
    form.append('prompt', VOCABULARIO);

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        const corpo = await resp.text().catch(() => '');
        // Nao logamos o audio nem o texto: so o status e o inicio do erro.
        this.logger.error(
          `OpenAI transcriptions falhou: ${resp.status} ${corpo.slice(0, 200)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as { text?: string };
      const texto = (dados.text ?? '').trim();
      return texto.length > 0 ? texto : null;
    } catch (err) {
      // Timeout, DNS, rede. Nunca sobe: quem chama trata o null.
      this.logger.error(
        `Falha ao transcrever audio: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

/** Extensao que a OpenAI reconhece para cada tipo que recebemos na pratica. */
function extensaoDe(tipo: string): string {
  const mapa: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/oga': 'ogg',
    'audio/opus': 'ogg',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
  };
  return mapa[tipo] ?? 'ogg';
}
