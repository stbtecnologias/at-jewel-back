/**
 * ESTE EVENTO E UMA MENSAGEM? — 25/09/2026.
 *
 * ==========================================================================
 * O WAHA TEM DOIS NOMES PARA A MESMA COISA, E ACEITAR SO UM CALOU A HELENA.
 *
 * `message` e so o que CHEGA; `message.any` traz os dois sentidos. A sessao
 * da Helena nasceu escutando `message.any` — defeito do caminho de criacao,
 * corrigido no `WahaAdminClient` no mesmo dia —, e aqui a condicao era
 * `event !== 'message'`: todo evento dela morria na primeira linha, antes de
 * qualquer roteamento.
 *
 * O SINTOMA FOI SILENCIO ABSOLUTO. A Anastasia respondia (a sessao dela escuta
 * `message`) e a Helena nao respondia nada — em PRODUCAO e no HOMOLOG. Nos
 * dois, trocar o evento da sessao para `message` a fez responder na mensagem
 * seguinte. Dois ambientes, duas vezes, mesmo resultado.
 *
 * ==========================================================================
 * O QUE FICA EM ABERTO, e fica dito para ninguem repetir a deducao errada:
 *
 *   local      WAHA 2026.8.2   `message.any`   RESPONDE
 *   homolog    WAHA 2026.5.1   `message.any`   mudo
 *   producao   WAHA 2026.9.1   `message.any`   mudo
 *
 * Cheguei a escrever que era a VERSAO do WAHA. Nao e: o homolog roda a mais
 * VELHA das tres e se comporta como a mais nova. O local e a excecao, e o
 * motivo dela nao foi encontrado em 25/09.
 *
 * Tambem NAO e a sessao em estado ruim: no homolog o restart sozinho, sem
 * mexer no evento, nao mudou nada — so a troca mudou.
 * ==========================================================================
 *
 * O SILENCIO NAO DEIXA RASTRO EM LOG NENHUM, porque descartar evento
 * desconhecido e o comportamento CORRETO para status, ack e presenca. Foi o
 * que fez o defeito sobreviver a tres ambientes sem ninguem ver.
 *
 * ACEITAR OS DOIS E CINTO E SUSPENSORIO: mesmo que alguem crie uma sessao com
 * o evento amplo de novo, a mensagem nao some calada. Quem filtra o que a
 * agente nao deve responder e o `fromMe`, logo abaixo, que sempre esteve la.
 * ==========================================================================
 */
function ehEventoDeMensagem(evento: string | undefined): boolean {
  // Sem `event` no corpo e o formato antigo do WAHA, de quando so havia um
  // tipo — continua valendo, como em toda a borda.
  if (!evento) return true;
  return evento === 'message' || evento === 'message.any';
}

/**
 * Shape (parcial) do evento que o WAHA envia ao webhook. O payload e amplo e
 * varia por engine/versao; tipamos apenas o que usamos e parseamos defensivo.
 */
interface WahaWebhookBody {
  event?: string;
  session?: string;
  payload?: {
    from?: string;
    fromMe?: boolean;
    body?: string;
    hasMedia?: boolean;
    /** Quando a mensagem foi escrita, em SEGUNDOS. */
    timestamp?: number;
    media?: { url?: string; mimetype?: string } | null;
    _data?: {
      Info?: {
        Type?: string;
        MediaType?: string;
        IsGroup?: boolean;
        SenderAlt?: string;
      };
      Message?: {
        audioMessage?: { mimetype?: string; seconds?: number };
        /**
         * `mentionedJID` com JID MAIUSCULO — conferido em 30/09/2026 num grupo
         * de verdade. Toda documentacao e todo exemplo publico escrevem
         * `mentionedJid`, e essa forma NAO existe no payload: quem escrever de
         * cor nunca casa, e falha calado.
         */
        extendedTextMessage?: {
          contextInfo?: { mentionedJID?: unknown };
        };
      };
    };
    [k: string]: unknown;
  };
}

/**
 * Imagem que veio junto da mensagem.
 *
 * O ARQUIVO VIVE 30 MINUTOS. O WAHA republica a midia decifrada num endereco
 * proprio e a apaga depois de `WHATSAPP_FILES_LIFETIME` (1800s na instalacao
 * de hoje). Quem recebe isto tem que BAIXAR E GRAVAR ANTES de conversar: se a
 * pessoa demorar para responder "e do catalogo 0002", o original ja evaporou.
 */
export interface ImagemRecebida {
  /** Endereco do arquivo JA DESCRIPTOGRAFADO. `null` quando o WAHA nao baixou. */
  url: string | null;
  mimetype: string;
}

/** Audio que veio junto da mensagem, ja identificado como audio. */
export interface AudioRecebido {
  /**
   * Endereco do arquivo JA DESCRIPTOGRAFADO pelo WAHA.
   *
   * `null` quando o WAHA reconheceu o audio mas nao entregou o arquivo — e o
   * que acontece com o download de midia desligado. Vale distinguir de "nao ha
   * audio": aqui da para avisar a vendedora que chegou audio e nao deu para
   * ouvir, em vez de ficar mudo.
   */
  url: string | null;
  mimetype: string;
  /** Duracao em segundos, quando informada. Serve para recusar antes de baixar. */
  segundos: number | null;
}

export interface MensagemWhatsapp {
  /** Chat de origem (formato WhatsApp, ex.: `5585...@c.us`, ou um `@lid`). */
  de: string;
  /**
   * Texto da mensagem. Vazio quando veio audio puro. Quando ha IMAGEM, este e
   * a LEGENDA — o WhatsApp manda a legenda no mesmo campo `body` do texto.
   */
  texto: string;
  /** Presente so quando a mensagem e de audio. */
  audio?: AudioRecebido;
  /** Presente so quando a mensagem e de imagem. */
  imagem?: ImagemRecebida;
  /**
   * Quando a mensagem foi ESCRITA, em milissegundos — o carimbo do WhatsApp,
   * e nao a hora em que chegou aqui.
   *
   * Entrou em 11/09/2026 para o relogio da aprovacao do catalogo: uma
   * afirmacao so aprova foto que ja tinha chegado quando a pessoa escreveu.
   * Ausente quando o payload nao traz — e ai quem usa cai na hora de agora.
   */
  em?: number;
  /** Presente so quando a mensagem veio de um GRUPO. Ver `MensagemDeGrupo`. */
  grupo?: MensagemDeGrupo;
}

/**
 * O que so existe quando a mensagem veio de grupo — 30/09/2026.
 *
 * ==========================================================================
 * EM GRUPO, "DE ONDE VEIO" E "QUEM FALOU" DEIXAM DE SER A MESMA COISA.
 *
 * Na conversa direta o chat E a pessoa, e o canal inteiro foi construido em
 * cima disso: o roteador tira o `@` do `de` e tem o telefone de quem escreveu.
 * Num grupo o `de` e o GRUPO — a resposta vai para la —, e quem escreveu esta
 * a parte. Sem esta separacao, o reconhecimento tentaria achar um admin com o
 * telefone do grupo e nao acharia nunca.
 * ==========================================================================
 */
export interface MensagemDeGrupo {
  /**
   * Quem escreveu, ja como `NNNNNNN@c.us` — sufixo de aparelho fora.
   *
   * Sai do `_data.Info.SenderAlt`, porque em grupo o `participant` e o
   * `Info.Sender` vem como `@lid`, sem telefone nenhum.
   */
  autor: string;
  /**
   * Os `@lid` mencionados na mensagem. Vazio = ninguem foi mencionado.
   *
   * SAO `@lid` E NAO TELEFONES, de proposito: e assim que o WhatsApp manda, e
   * a sessao sabe o PROPRIO lid (`me.lid`). Comparar lid com lid dispensa
   * traduzir, e traduzir custaria uma ida ao WAHA por mencao.
   */
  mencionados: string[];
}

/**
 * De QUAL sessao veio o evento.
 *
 * ==========================================================================
 * ESTE CAMPO PASSOU A IMPORTAR EM 08/09/2026.
 *
 * Ate aqui havia UMA sessao, entao a resposta era sempre a mesma e ninguem
 * precisava perguntar. Agora ha uma sessao por vendedora, e a diferenca e de
 * vida ou morte: a sessao da LOJA fala com a IA; a de uma vendedora e SO
 * LEITURA, porque do outro lado esta uma cliente conversando com a vendedora
 * de verdade — e a Anastasia respondendo por cima disso seria a IA falando no
 * lugar dela, numa conversa que nao e dela.
 *
 * Quem decide o que fazer com esta informacao e o controller.
 * ==========================================================================
 *
 * @returns o nome da sessao, ou `null` quando o payload nao traz.
 */
export function sessaoDoEvento(body: unknown): string | null {
  const b = (body ?? {}) as WahaWebhookBody;
  return typeof b.session === 'string' && b.session !== '' ? b.session : null;
}

/**
 * O contato que passou pelo numero — quem falou com quem, e quando.
 *
 * ==========================================================================
 * DIFERENTE DE `extrairMensagemRecebida`, ESTE OLHA OS DOIS SENTIDOS.
 *
 * Aquele descarta `fromMe` de proposito: no canal da loja, mensagem nossa nao
 * deve ser processada de novo. Aqui a mensagem da vendedora IMPORTA — cliente
 * que escreve e nao recebe resposta e justamente o que a gestao precisa ver,
 * e sem o lado dela os dois casos ficariam identicos na regua.
 *
 * Quando `fromMe`, o outro lado esta em `to` e nao em `from`.
 * ==========================================================================
 *
 * @returns null quando o evento nao e um contato pessoa-a-pessoa: nao e
 *          mensagem, e de grupo, ou o identificador nao e um telefone.
 */
export function contatoDoEvento(body: unknown): {
  telefone: string;
  daVendedora: boolean;
  em: Date;
} | null {
  const b = (body ?? {}) as WahaWebhookBody & {
    payload?: {
      to?: string;
      timestamp?: number;
      _data?: { Info?: Record<string, unknown> };
    };
  };

  if (!ehEventoDeMensagem(b.event)) return null;

  const payload = b.payload ?? {};
  const daVendedora = payload.fromMe === true;
  const info = payload._data?.Info;

  // Grupo nao e atendimento. `IsGroup` vem do proprio WAHA e e mais confiavel
  // que farejar `@g.us` num identificador que nem sempre e string.
  if (info?.IsGroup === true) return null;

  const digitos = telefoneDoIdentificador(
    daVendedora ? payload.to : payload.from,
    info,
    daVendedora,
  );
  if (!digitos) return null;

  return {
    telefone: digitos,
    daVendedora,
    // O WAHA manda o timestamp em SEGUNDOS. Sem ele, a hora de agora — que
    // erra por segundos, e nao por horas.
    em:
      typeof payload.timestamp === 'number'
        ? new Date(payload.timestamp * 1000)
        : new Date(),
  };
}

/**
 * O FORMATO do identificador, para o log de descarte — 29/09/2026.
 *
 * Existe para que "a mensagem sumiu" deixe de ser invisivel, sem que o numero
 * ou o texto entrem no log por isso. Devolve so a familia do identificador.
 */
export function formatoDoRemetente(body: unknown): string {
  const b = (body ?? {}) as {
    payload?: { from?: unknown; to?: unknown; fromMe?: boolean };
  };
  const lado = b.payload?.fromMe === true ? b.payload?.to : b.payload?.from;

  // "ausente" nao pode cobrir o campo que existe com outra forma: foi
  // exatamente essa confusao que custou uma hora em 29/09, quando o `to` de
  // saida chegou como OBJETO e o log disse que faltava.
  if (lado === undefined || lado === null) return 'ausente';
  if (typeof lado !== 'string') return `nao-string(${typeof lado})`;
  if (!lado) return 'vazio';

  const arroba = lado.lastIndexOf('@');
  return arroba >= 0 ? lado.slice(arroba) : 'sem sufixo';
}

/**
 * O telefone por tras do identificador — 29/09/2026.
 *
 * ==========================================================================
 * O `@lid` NAO E UM CASO RARO: E O QUE CHEGA HOJE.
 *
 * Ate esta data o extrator aceitava so `@c.us` e descartava o resto EM
 * SILENCIO. O comentario que justificava o descarte dizia que traduzir o
 * `@lid` "exigiria consultar a sessao da vendedora" — e isso nao e verdade.
 * O WAHA ja manda o telefone no mesmo evento, em `_data.Info.SenderAlt`.
 *
 * O custo do engano foi medido: com o numero corporativo conectado, TODA
 * mensagem de cliente sumia. Sem log, sem linha na fila, sem lead. O painel
 * dizia "Conectado · sincronizado agora" enquanto nada era registrado.
 *
 * Conferido no evento real de 29/09/2026 (WAHA sobre WhatsApp comercial):
 *
 *   payload.from              -> ...@lid              (sem telefone)
 *   payload._data.Info.Sender -> ...@lid              (sem telefone)
 *   payload._data.Info.SenderAlt -> 55...@s.whatsapp.net  <- o telefone
 * ==========================================================================
 *
 * O SUFIXO DE APARELHO TEM DE SAIR. O JID vem como `5585...:15@s.whatsapp.net`
 * — o `:15` e o dispositivo que enviou, e muda entre celular e WhatsApp Web da
 * MESMA pessoa. Deixa-lo entrar no telefone criaria um contato novo a cada
 * aparelho, e a cliente seria perguntada de novo em cada um.
 *
 * ==========================================================================
 * O `to` NEM SEMPRE E STRING — conferido em 29/09/2026.
 *
 * No evento de SAIDA (`fromMe: true`) desta versao do WAHA, `payload.to` chega
 * como OBJETO. O codigo antigo fazia `typeof outroLado !== 'string'` e desistia
 * ali, entao a resposta da vendedora nunca era registrada — e o log dizia
 * "remetente ausente", o que era enganoso: o campo existia, com outra forma.
 *
 * Por isso `identificador` e `unknown` e serve apenas como PRIMEIRO candidato.
 * Quem manda e o `Info`, que traz o mesmo dado em formato estavel:
 *
 *   recebendo -> SenderAlt      (o telefone de quem escreveu)
 *   enviando  -> RecipientAlt   (o telefone de quem recebeu)
 *
 * O SENTIDO NAO E DETALHE. Ler `SenderAlt` quando a VENDEDORA escreve devolve
 * o telefone DELA no lugar do da cliente, e o atendimento abriria contra a
 * pessoa errada — sem erro nenhum aparecer.
 * ==========================================================================
 *
 * @param identificador o `from`/`to` do evento, em qualquer forma.
 * @param info          `payload._data.Info`, onde mora o JID real.
 * @param daVendedora   o sentido decide QUAL campo espelha o outro lado.
 * @returns so digitos, ou `null` quando nao ha telefone recuperavel.
 */
export function telefoneDoIdentificador(
  identificador: unknown,
  info: Record<string, unknown> | undefined,
  daVendedora: boolean,
): string | null {
  /**
   * O SUFIXO E CONFERIDO ANTES DOS DIGITOS, E ISSO NAO E ZELO.
   *
   * Um `@lid` como `158205808246878@lid` tem QUINZE digitos — passaria por
   * qualquer teste de "parece telefone" e viraria um cliente fantasma, com
   * atendimento e tudo. So `@c.us` e `@s.whatsapp.net` carregam telefone; o
   * resto e identificador interno do WhatsApp e nao serve para nada aqui.
   */
  const limpar = (valor: unknown): string | null => {
    if (typeof valor !== 'string' || !valor) return null;

    const arroba = valor.indexOf('@');
    if (arroba >= 0) {
      const sufixo = valor.slice(arroba);
      if (sufixo !== '@c.us' && sufixo !== '@s.whatsapp.net') return null;
    }

    // `5585...:15@s.whatsapp.net` -> `5585...`
    const digitos = valor.replace(/[@:].*$/, '');
    return /^\d{10,15}$/.test(digitos) ? digitos : null;
  };

  // A ORDEM E A REGRA. O identificador direto vem primeiro porque, quando e
  // um telefone de verdade, e o dado mais proximo do evento. O campo espelho
  // vem depois, e resolve o `@lid` e o `to` que nao e string.
  const candidatos: unknown[] = [
    identificador,
    daVendedora ? info?.RecipientAlt : info?.SenderAlt,
    // Em 1:1 o `Chat` E o outro lado — ultima tentativa, e so quando os dois
    // acima falham. Em grupo nao serve, mas grupo ja saiu antes daqui.
    info?.Chat,
  ];

  for (const candidato of candidatos) {
    const telefone = limpar(candidato);
    if (telefone) return telefone;
  }

  return null;
}

/**
 * Extrai uma mensagem RECEBIDA a partir do corpo do webhook do WAHA. Retorna
 * null quando o evento deve ser ignorado:
 * - nao e evento de mensagem;
 * - e mensagem enviada por nos mesmos (fromMe);
 * - e de grupo e nao da para saber QUEM escreveu;
 * - nao tem remetente;
 * - nao tem texto, nem audio, nem imagem (documento, sticker, evento de status).
 *
 * AUDIO — acrescentado em 21/08/2026. Ate entao qualquer mensagem sem texto
 * era descartada aqui, em silencio: quem mandava audio nao recebia resposta
 * nenhuma e nem sabia por que. O audio de voz do WhatsApp chega como `ptt`
 * (push-to-talk), SEM campo `body` algum, com o arquivo em `media.url`.
 *
 * IMAGEM — acrescentada em 28/08/2026, para o catalogo. Ate entao foto caia no
 * mesmo descarte silencioso do audio. Quem decide o que fazer com ela e o
 * ROTEADOR, nao este arquivo: aqui so se reconhece que ha imagem.
 */
export function extrairMensagemRecebida(body: unknown): MensagemWhatsapp | null {
  const b = (body ?? {}) as WahaWebhookBody;

  if (!ehEventoDeMensagem(b.event)) return null;

  const payload = b.payload ?? {};
  const de = typeof payload.from === 'string' ? payload.from : '';
  const texto = typeof payload.body === 'string' ? payload.body : '';

  if (payload.fromMe === true) return null;
  if (!de) return null;

  // ========================================================================
  // O GRUPO PASSA DESDE 30/09/2026 — ate aqui era descartado em silencio.
  //
  // Passar nao e responder: quem decide isso e o roteador, e a regra dele e
  // "so quando mencionada, e so para quem tem cadastro". Aqui so se reconhece
  // o formato.
  //
  // SEM AUTOR, NAO PASSA. Um grupo sem `SenderAlt` nao permite saber quem
  // falou, e sem isso o reconhecimento nao tem como acontecer — deixar entrar
  // so adiaria o descarte para um lugar onde ele seria mais confuso.
  // ========================================================================
  const ehGrupo = payload._data?.Info?.IsGroup === true || de.endsWith('@g.us');
  let grupo: MensagemDeGrupo | undefined;
  if (ehGrupo) {
    const autor = telefoneDoIdentificador(
      payload._data?.Info?.SenderAlt,
      payload._data?.Info as Record<string, unknown> | undefined,
      false,
    );
    if (!autor) return null;
    grupo = { autor: `${autor}@c.us`, mencionados: mencionadosDoEvento(payload) };
  }

  const audio = extrairAudio(payload);
  // Imagem so e procurada quando NAO ha audio: os dois usam `media`, e um
  // audio nunca deve ser confundido com foto.
  const imagem = audio ? null : extrairImagem(payload);

  // Sem texto, sem audio e sem imagem nao ha o que processar. Documento,
  // sticker e evento de status caem aqui, e continuam ignorados de proposito.
  if (!texto.trim() && !audio && !imagem) return null;

  const msg: MensagemWhatsapp = { de, texto };
  if (grupo) msg.grupo = grupo;
  if (audio) msg.audio = audio;
  if (imagem) msg.imagem = imagem;
  // O WAHA manda o timestamp em SEGUNDOS — o mesmo campo que o
  // `contatoDoEvento` ja le para a regua da vendedora.
  if (typeof payload.timestamp === 'number' && payload.timestamp > 0) {
    msg.em = payload.timestamp * 1000;
  }
  return msg;
}

/**
 * Quem foi mencionado na mensagem, como `@lid`.
 *
 * ==========================================================================
 * A CHAVE E `mentionedJID`, COM JID MAIUSCULO.
 *
 * Conferido em 30/09/2026 num grupo de verdade, por busca RECURSIVA de
 * qualquer chave contendo "mention". Toda documentacao e todo exemplo publico
 * escrevem `mentionedJid` — essa forma nao existe no payload.
 *
 * Escrever de cor produziria o pior defeito possivel: a lista vem sempre
 * vazia, a agente nunca responde no grupo, e nao ha erro em lugar nenhum
 * para explicar por que. Foi exatamente assim que o `@lid` sumiu com toda
 * mensagem de cliente em 29/09.
 * ==========================================================================
 *
 * A LISTA E A FONTE, E NAO O TEXTO — e e o que faz a posicao da mencao nao
 * importar. "@anastasia qual o faturamento" e "qual o faturamento\n@anastasia"
 * chegam aqui identicos, porque o WhatsApp monta esta lista a parte da frase.
 */
export function mencionadosDoEvento(
  payload: NonNullable<WahaWebhookBody['payload']>,
): string[] {
  const bruto = payload._data?.Message?.extendedTextMessage?.contextInfo
    ?.mentionedJID;
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((j): j is string => typeof j === 'string' && !!j);
}

/**
 * Tira as mencoes do texto que vai para o modelo.
 *
 * ==========================================================================
 * NO CORPO DA MENSAGEM A MENCAO CHEGA COMO NUMERO CRU.
 *
 * A tela mostra "@~Artz Teste"; o `body` traz o identificador. Sem limpar,
 * "qual o faturamento da semana @558535141045" chega ao modelo com um numero
 * de telefone solto no meio da pergunta — ruido para ele e um dado pessoal
 * viajando para a API sem precisar.
 *
 * TIRA QUALQUER `@digitos`, e nao so os da lista, porque os dois lados nao
 * batem: a lista vem em `@lid` e o texto costuma trazer o telefone. Casar um
 * com o outro exigiria traduzir cada mencao; e o que se perde com a regra
 * larga e desprezivel — mensagem de loja nao tem "@12345678" com outro
 * sentido.
 * ==========================================================================
 */
export function semMencoes(texto: string): string {
  return texto
    .replace(/@\d{8,20}\b/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}

function extrairImagem(
  payload: NonNullable<WahaWebhookBody['payload']>,
): ImagemRecebida | null {
  const mediaType = String(payload._data?.Info?.MediaType ?? '').toLowerCase();
  const mimeDaMidia = payload.media?.mimetype ?? '';

  // Dois sinais independentes, porque o payload varia por engine e versao.
  // `sticker` fica de fora de proposito: e imagem, mas nunca e foto de peca.
  const ehImagem = mediaType === 'image' || mimeDaMidia.startsWith('image/');
  if (!ehImagem) return null;

  const url = typeof payload.media?.url === 'string' ? payload.media.url : null;
  return { url, mimetype: mimeDaMidia || 'image/jpeg' };
}

function extrairAudio(
  payload: NonNullable<WahaWebhookBody['payload']>,
): AudioRecebido | null {
  const audioMsg = payload._data?.Message?.audioMessage;
  const mediaType = String(payload._data?.Info?.MediaType ?? '').toLowerCase();
  const mimeDaMidia = payload.media?.mimetype ?? '';

  // Tres sinais independentes, porque o payload varia por engine e versao. Um
  // basta — mas exigir que ALGUM exista evita mandar foto para a transcricao.
  const ehAudio =
    Boolean(audioMsg) ||
    mediaType === 'ptt' ||
    mediaType === 'audio' ||
    mimeDaMidia.startsWith('audio');

  if (!ehAudio) return null;

  const url = typeof payload.media?.url === 'string' ? payload.media.url : null;
  const mimetype = mimeDaMidia || audioMsg?.mimetype || 'audio/ogg';
  const segundos =
    typeof audioMsg?.seconds === 'number' && audioMsg.seconds > 0
      ? audioMsg.seconds
      : null;

  return { url, mimetype, segundos };
}
