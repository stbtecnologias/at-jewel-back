/**
 * Audio pronto para virar texto: bytes na memoria, nunca caminho de arquivo.
 *
 * Nada disso toca o disco em nenhum momento. O audio de uma vendedora pode
 * conter nome de cliente, valor e combinacao — e material que nao deve
 * sobreviver a requisicao. Buffer entra, texto sai, o resto o coletor leva.
 */
export interface AudioParaTranscrever {
  conteudo: Buffer;
  /** Ex.: `audio/ogg; codecs=opus` (WhatsApp) ou `audio/webm` (navegador). */
  mimetype: string;
  /** So para dar extensao ao arquivo enviado; nao e persistido. */
  nomeArquivo?: string;
}

/**
 * Porta de transcricao de audio (implementada com a API da OpenAI na infra).
 *
 * POR QUE E UMA PORTA, e nao uma chamada direta: e o unico ponto do sistema
 * que fala com um provedor que nao e a Anthropic. Manter a fronteira explicita
 * deixa claro onde o audio sai da nossa infraestrutura, e permite trocar de
 * provedor — ou desligar a transcricao — sem tocar em nenhum use case.
 */
export interface ITranscricao {
  /**
   * Devolve o texto do audio, ou `null` quando nao foi possivel transcrever.
   *
   * NUNCA LANCA. Um audio que nao transcreve nao pode derrubar o webhook nem a
   * tela: quem chama trata o `null` como "nao entendi" e segue. Falha de
   * provedor, chave ausente e audio grande demais caem todos no mesmo caminho.
   */
  transcrever(audio: AudioParaTranscrever): Promise<string | null>;

  /** `false` quando falta configuracao — evita tentar e pagar por um 401. */
  disponivel(): boolean;
}

/**
 * Tetos do audio aceito. Existem por dois motivos somados: transcricao e
 * chamada PAGA por duracao, e audio longo transcreve pior (o modelo perde o
 * fio, e a vendedora nao revisa o que nao ve).
 *
 * Dois minutos cobrem com folga um relato falado — "falei com a Ana, ela vem
 * sabado as 15h, quer ver meia alianca". Quem precisa de mais que isso esta
 * contando uma historia, e ai vale escrever.
 */
export const LIMITE_SEGUNDOS = 120;
export const LIMITE_BYTES = 10 * 1024 * 1024;
