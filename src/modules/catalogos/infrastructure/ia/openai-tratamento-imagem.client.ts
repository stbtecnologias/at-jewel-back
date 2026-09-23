import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ImagemDeEntrada,
  ImagemTratada,
  ITratamentoImagem,
  Orientacao,
  PedidoDeAmbientacao,
  PedidoDeArte,
  PedidoDeTratamento,
} from '../../domain/ports/tratamento-imagem.port';

const ENDPOINT_EDICAO = 'https://api.openai.com/v1/images/edits';
const ENDPOINT_GERACAO = 'https://api.openai.com/v1/images/generations';
const MODELO_PADRAO = 'gpt-image-1';

/**
 * Geracao de imagem e lenta — 10 a 30 segundos e normal. O timeout e generoso
 * de proposito: cortar em 30s desperdicaria uma chamada ja paga por causa de
 * um pico de fila do provedor.
 */
const TIMEOUT_MS = 120_000;

/** As tres formas que o `gpt-image-1` aceita, pelo nome do que sao. */
const TAMANHO: Record<Orientacao | 'quadrada', string> = {
  quadrada: '1024x1024',
  retrato: '1024x1536',
  paisagem: '1536x1024',
};

/**
 * O QUE NAO MUDA NA PECA — valendo para o packshot E para a foto com modelo.
 *
 * ==========================================================================
 * AS PROIBICOES SAO NOMEADAS UMA A UMA PORQUE A REGRA GENERICA JA FALHOU.
 *
 * A versao anterior dizia "mantenha o mesmo numero de pedras e a mesma cor de
 * metal" — e em 31/08/2026 o modelo devolveu uma alianca de metal branco SEM
 * PEDRA como uma alianca DOURADA COM BRILHANTE. A regra estava escrita e foi
 * ignorada.
 *
 * O que mudou aqui: cada falha observada virou uma linha propria, no
 * imperativo, com o caso concreto. Instrucao enumerada e especifica sobrevive
 * melhor que paragrafo generico.
 *
 * ==========================================================================
 * 15/09/2026: A REGRA DO METAL VALIA NUM SENTIDO SO, E O MODELO FOI PELO
 * OUTRO.
 *
 * Teste com o colar de opala CO23322, que e ouro amarelo: nas TRES geracoes a
 * corrente e o aro sairam PRATEADOS. A regra dizia "nunca transforme metal
 * branco em dourado", e o caminho contrario estava aberto.
 *
 * Agora a linha proibe as duas direcoes e nomeia amarelo e rose. E entrou
 * uma linha para o DESENHO DA PEDRA: opala e pedra unica, o veio dela e a
 * identidade da peca, e o modelo repintava o padrao a cada geracao.
 * ==========================================================================
 *
 * ISTO E MITIGACAO, NAO GARANTIA: o `gpt-image-1` REGERA a imagem em vez de
 * edita-la, entao preservar a peca e um resultado provavel, nunca certo. A
 * garantia so viria de nao regerar — recortar a peca e assenta-la no fundo.
 */
const O_QUE_NAO_MUDA =
  '- NÃO ACRESCENTE PEDRAS. Se a peça enviada não tem nenhuma pedra, a imagem ' +
  'de saída não pode ter nenhuma pedra. Se tem três, tem três.\n' +
  '- NÃO MUDE A COR DO METAL, EM NENHUMA DIREÇÃO. Ouro amarelo permanece ' +
  'AMARELO. Ouro rosé permanece ROSÉ. Metal branco, prateado ou cinza ' +
  'permanece branco, prateado ou cinza. NUNCA transforme amarelo em branco ' +
  'nem branco em dourado. A cor do metal é a da foto enviada, mesmo que a ' +
  'luz do ambiente ou o fundo pedido sugiram outra.\n' +
  '- NÃO MUDE o formato, o corte, a espessura, o acabamento, os gravados nem ' +
  'as proporções entre as partes.\n' +
  '- NÃO MUDE O DESENHO DA PEDRA. Opala, madrepérola, ágata e pedras naturais ' +
  'têm veios e manchas ÚNICOS: copie os que estão na foto, não crie um padrão ' +
  'novo nem "melhore" o existente.\n';

/**
 * A REGRA QUE NAO SE NEGOCIA, NO PACKSHOT.
 *
 * Vem primeiro no prompt e e repetida no fim, porque instrucao no meio de
 * texto longo e a que mais se perde.
 */
const REGRA_PECA_INTOCADA =
  'REGRA ABSOLUTA: o objeto da imagem enviada é o único objeto da imagem de ' +
  'saída. Ele não pode ser alterado, substituído, completado nem embelezado.\n' +
  O_QUE_NAO_MUDA +
  '- NÃO POLIR, NÃO LIMPAR, NÃO RESTAURAR. Marcas de uso, riscos e ' +
  'irregularidades da peça são dela e permanecem.\n' +
  'Esta NÃO é uma joia de catálogo idealizada: é ESTA peça específica, como ' +
  'ela é. Você está tratando apenas a APRESENTAÇÃO — fundo, iluminação, ' +
  'sombra, enquadramento e nitidez. Na dúvida entre embelezar e manter, ' +
  'MANTENHA.';

/**
 * A MESMA REGRA, NA FOTO COM MODELO.
 *
 * A abertura muda porque a do packshot ("o objeto enviado e o unico objeto da
 * saida") proibiria a propria modelo e a cena. O que nao muda e a lista: a
 * joia que aparece no corpo e ESTA joia.
 */
const REGRA_PECA_NA_CENA =
  'REGRA ABSOLUTA: a joia da imagem enviada deve aparecer na imagem de saída ' +
  'EXATAMENTE como é. Ela não pode ser alterada, substituída, completada nem ' +
  'embelezada. Quem aparece usa SOMENTE esta joia — nenhuma outra joia, ' +
  'relógio ou acessório de metal.\n' +
  O_QUE_NAO_MUDA +
  'Na dúvida entre embelezar a joia e mantê-la, MANTENHA.';

/**
 * O PADRAO DA CASA, EM TEXTO — QUE E A UNICA FORMA SEGURA DE DIZE-LO.
 *
 * Duas tentativas fracassadas ensinaram isto, as duas em 31/08/2026:
 *
 *   1. o prompt pedia "mesmo fundo e mesma iluminacao das referencias" e
 *      mandava as paginas junto. O modelo copiou o tom do PAPEL da pagina e
 *      devolveu a peca sobre fundo bege, vista de cima.
 *   2. o prompt passou a dizer "use as paginas apenas como referencia". O
 *      modelo recortou um brinco de DENTRO de uma pagina e o devolveu no
 *      lugar da peca enviada.
 *
 * Nao adiantou insistir no texto porque o problema era a chamada: mandar
 * varias `image[]` para `/v1/images/edits` significa "edite estas juntas".
 * Agora vai uma imagem so, e o padrao vem escrito.
 *
 * Conferido nos catalogos reais: a peca aparece recortada, de frente, na
 * altura do olho. Sem cenario, sem superficie, sem mesa.
 */
const ENQUADRAMENTO =
  'Sem cenário, sem mesa, sem superfície visível. Sombra mínima ou nenhuma. ' +
  'A peça deve aparecer DE FRENTE, na altura do olho, como produto ' +
  'fotografado em estúdio — nunca vista de cima nem em perspectiva ' +
  'inclinada. Centralizada, ocupando a maior parte do quadro.';

/**
 * O padrao da casa, e so quando a pessoa nao pedir outro.
 *
 * ==========================================================================
 * O RECORTE FOI TENTADO E DESFEITO NO MESMO DIA — 21/09/2026.
 *
 * O cartao da pagina tematica virou VIDRO, e vidro com um quadrado branco em
 * cima nao e vidro. A saida obvia era pedir a peca SEM FUNDO
 * (`background: transparent` na geracao), e ela funcionou: o PNG voltou RGBA,
 * a peca recortada.
 *
 * SO QUE O PACKSHOT NAO VAI SO PARA O PDF. Ele e a imagem que volta pelo
 * WHATSAPP para alguem aprovar, e transparencia no WhatsApp escuro e um
 * QUADRADO PRETO. Quem aprova deixou de ver a peca. Medido no teste do Lucas
 * as 13:24 — a foto do anel chegou sobre preto.
 *
 * Achatar o recorte sobre branco so para o envio exigiria uma biblioteca de
 * imagem no back (nao ha nenhuma) e um segundo arquivo por peca.
 *
 * ENTAO O BRANCO FICA, e quem apaga o branco e o DESENHO DO PDF: o packshot
 * entra no cartao de vidro em modo Multiply, onde branco vira transparente.
 * Ver `cartaoDeVidro` e `comBrancoTransparente` no montador. De quebra, a
 * peca JA aprovada tambem funciona no vidro — nada depende de regerar foto.
 * ==========================================================================
 */
const FUNDO_PADRAO =
  'FUNDO: BRANCO liso e uniforme, sem textura e sem gradiente.';

/**
 * O que a geracao deve devolver.
 *
 * SAO DOIS NOMES E NAO UM BOOLEANO porque o formato nao e um detalhe de
 * transporte: JPEG e o que vai para PAGINA (foto, pesada em PNG) e PNG e o
 * que vai para o PACKSHOT. Lido no ponto da chamada, `'jpeg'` diz mais do
 * que `true`.
 */
type SaidaDaGeracao =
  /** A peca na modelo e a arte da pagina: foto, sem transparencia. */
  | 'jpeg'
  /** O packshot. */
  | 'png';

const INSTRUCAO_BASE =
  'A imagem enviada é a foto de uma peça, tirada com celular. Produza o ' +
  `packshot dela para catálogo: ${ENQUADRAMENTO} ` +
  'Não escreva texto algum na imagem.';

/**
 * O QUE TODA ARTE SEM PECA PROIBE.
 *
 * Pessoa e joia porque a arte nao pode competir com a peca da pagina nem
 * sugerir uma que a loja nao vende. Texto porque o modelo escreve letra
 * torta — e o texto da capa e nosso, escrito por cima.
 */
const ARTE_SEM =
  'SEM pessoas, SEM texto, letras, números, marcas ou logotipos, e sem ' +
  'nenhum adorno ou objeto de uso pessoal.';

/**
 * A ARTE E PEDIDA PELO QUE ELA TEM, NUNCA PELO QUE NAO TEM — 17/09/2026.
 *
 * O prompt dizia "capa de um catalogo de JOIAS ... SEM joias", e a cena da
 * direcao de arte falava em "verdes-esmeralda das joias". O modelo de imagem
 * leu "joias" e "esmeralda" e desenhou um par de brincos de esmeralda no
 * centro da capa do #0004 — peca que o catalogo nao tem. Proibicao nao segura
 * modelo de imagem: a palavra citada vira o assunto.
 *
 * Entao a palavra nao chega. A arte e descrita como paisagem, e da cena saem
 * as FRASES que falam de joia, peca ou pedra — a luz e o cenario das outras
 * frases continuam. Vale tambem para os planos ja gravados, que o ajuste
 * reaproveita: a limpeza e aqui, na saida para a OpenAI.
 */
const FALA_DE_JOIA =
  /\b(j[oó]ias?|an[eé]is|anel|brincos?|colar(es)?|cord[aã]o|cord[oõ]es|pulseiras?|braceletes?|pingentes?|gargantilhas?|tornozeleiras?|broches?|abotoaduras?|rel[oó]gios?|pe[cç]as?|acess[oó]rios?|adornos?|esmeraldas?|rubis?|safiras?|diamantes?|p[eé]rolas?|gemas?|pedras? preciosas?|ouro|prata)\b/i;

export function cenaParaArte(cena: string): string {
  return cena
    .split(/(?<=[.!?;])\s+/)
    .filter((frase) => frase.trim() && !FALA_DE_JOIA.test(frase))
    .join(' ')
    .trim();
}

/**
 * Tratamento da foto pela API de imagens da OpenAI.
 *
 * HTTP direto, sem SDK — mesmo caminho do `OpenaiTranscricaoClient`. Trazer o
 * pacote da OpenAI so para tres chamadas nao se paga, e o `fetch` do Node da
 * conta.
 *
 * O QUE SAI DAQUI: a foto da peca e a cena do catalogo. Nao vai nome de
 * cliente, telefone, preco nem qualquer dado do ERP — o texto entra depois, e
 * por composicao nossa.
 */
@Injectable()
export class OpenaiTratamentoImagemClient implements ITratamentoImagem {
  private readonly logger = new Logger(OpenaiTratamentoImagemClient.name);

  constructor(private readonly config: ConfigService) {}

  disponivel(): boolean {
    return Boolean(this.config.get<string>('OPENAI_API_KEY'));
  }

  async tratar(pedido: PedidoDeTratamento): Promise<ImagemTratada | null> {
    // ==========================================================================
    // QUADRADA, SEMPRE. O packshot e quadrado — quem tem proporcao 9:16 ou 16:9
    // e a PECA FINAL montada, e nao a foto da joia.
    //
    // Estava pedindo 1024x1536 quando o catalogo era 9:16, e a tela — que
    // desenha a foto num quadrado — cortava o topo e a base da peca. Medido em
    // 01/09/2026: uma garrafa chegou com tampa e fundo fora do quadro.
    // ==========================================================================
    //
    // UMA IMAGEM SO, E ISSO NAO E ECONOMIA: e o que impede o modelo de trocar
    // a joia por outra. Ver a porta (`PedidoDeTratamento.original`).
    return this.editar(
      pedido.original,
      this.montarPrompt(pedido),
      TAMANHO.quadrada,
      'png',
    );
  }

  /**
   * A peca na modelo. A entrada e o packshot aprovado — UMA imagem, pelo
   * mesmo motivo do tratamento.
   *
   * A regra da peca abre e fecha, como no packshot. A cena fica no meio: e o
   * que pode variar.
   *
   * NADA DE TEMA FIXO AQUI — 16/09/2026. Quem aparece e a luz vem da direcao
   * de arte: praia pede luz de fim de tarde, Natal pede luz de vela, Dia dos
   * Pais pede um homem. O que o prompt fixa e so o que vale em qualquer tema:
   * a joia em foco e a cara de fotografia profissional.
   *
   * A PECA MANDA NA PESSOA quando as duas brigam. Um colar delicado num
   * catalogo de Dia dos Pais vai no pescoco de uma mulher — forcar o homem
   * geraria uma imagem estranha, ou o modelo trocaria a peca para caber nele.
   */
  async ambientar(pedido: PedidoDeAmbientacao): Promise<ImagemTratada | null> {
    const prompt = [
      REGRA_PECA_NA_CENA,
      'Crie uma fotografia editorial de campanha de joalheria. ' +
        `Quem aparece: ${pedido.modelo}, usando a joia da imagem enviada ` +
        `${pedido.onde}. Se essa pessoa não combinar com a joia (uma peça ` +
        'claramente feminina num homem, por exemplo), escolha quem combine, ' +
        'mantendo o clima do tema. ' +
        `Cenário, clima e luz: ${pedido.cena}. ` +
        'A joia em foco, nítida, bem iluminada e claramente visível, ocupando ' +
        'uma parte relevante do quadro. Pele real, aparência de fotografia ' +
        'profissional. Não escreva texto algum na imagem.',
      // O PEDIDO DO AJUSTE VEM DEPOIS DA CENA, para poder muda-la ("luz de
      // dia" numa cena de fim de tarde), e ANTES da regra da peca, que
      // continua fechando: nenhum pedido autoriza mexer na joia.
      ...(pedido.pedido?.trim()
        ? [
            `Pedido específico para esta foto (vence a cena acima): ${pedido.pedido.trim()}`,
          ]
        : []),
      REGRA_PECA_NA_CENA,
    ].join('\n\n');

    return this.editar(
      pedido.peca,
      prompt,
      TAMANHO[pedido.orientacao],
      'jpeg',
    );
  }

  /**
   * Capa ou fundo de pagina — geracao do zero, sem imagem de entrada.
   *
   * O FUNDO DEIXA O MEIO LIVRE: a grade de joias vai por cima dele, e
   * elemento decorativo no centro brigaria com as pecas. A cena mora nas
   * bordas.
   */
  async gerarArte(pedido: PedidoDeArte): Promise<ImagemTratada | null> {
    const cores = pedido.cores.join(', ');
    // Se TODA a cena falava de joia, sobra o genérico — melhor que a joia.
    const cena = cenaParaArte(pedido.cena) || 'ambiente sofisticado e sereno';
    const prompt =
      pedido.tipo === 'capa'
        ? 'Fotografia de paisagem e ambiente para a capa de uma revista de ' +
          `luxo. Cenário e clima: ${cena}. Tons que conversem com ${cores}. ` +
          'Só o cenário e seus elementos naturais, em composição elegante e ' +
          'arejada; o centro da imagem fica livre, sem nenhum objeto em ' +
          `destaque, para receber um título. ${ARTE_SEM}`
        : 'Fundo decorativo para a página de uma revista de luxo. ' +
          `Tema: ${cena}. Elementos do tema discretos, suaves e ` +
          'desfocados SOMENTE nas bordas e nos cantos. O CENTRO da imagem ' +
          `amplo, liso e claro, na cor ${pedido.cores[0]}, sem nenhum ` +
          `elemento. Paleta: ${cores}. ${ARTE_SEM}`;
    // O pedido do ajuste antes das proibições: pode mudar o clima, nunca
    // colocar pessoa, joia ou texto na arte.
    const comPedido = pedido.pedido?.trim()
      ? prompt.replace(
          ARTE_SEM,
          `Pedido específico para esta arte: ${pedido.pedido.trim()}. ${ARTE_SEM}`,
        )
      : prompt;

    const chave = this.config.get<string>('OPENAI_API_KEY');
    if (!chave) {
      this.logger.warn('OPENAI_API_KEY ausente — arte nao gerada.');
      return null;
    }

    return this.pedir(ENDPOINT_GERACAO, chave, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelo(),
        prompt: comPedido,
        size: TAMANHO[pedido.orientacao],
        n: 1,
        output_format: 'jpeg',
      }),
    });
  }

  /**
   * `/images/edits` com UMA imagem de entrada.
   *
   * @param saida ver `SaidaDaGeracao`. O que vai para PAGINA (a peca na
   *   modelo, a arte) sai em JPEG: sao imagens fotograficas, sem
   *   transparencia, e em PNG cada uma pesaria uns 3 MB dentro do PDF. O
   *   packshot segue PNG, como sempre foi.
   */
  private async editar(
    imagem: ImagemDeEntrada,
    prompt: string,
    tamanho: string,
    saida: SaidaDaGeracao,
  ): Promise<ImagemTratada | null> {
    const chave = this.config.get<string>('OPENAI_API_KEY');
    if (!chave) {
      this.logger.warn('OPENAI_API_KEY ausente — foto nao tratada.');
      return null;
    }

    const form = new FormData();
    form.append('model', this.modelo());
    form.append('prompt', prompt);
    form.append('size', tamanho);
    form.append('n', '1');
    if (saida === 'jpeg') form.append('output_format', 'jpeg');
    form.append('image[]', this.paraBlob(imagem), 'peca.png');

    return this.pedir(
      ENDPOINT_EDICAO,
      chave,
      { body: form },
      saida === 'jpeg',
    );
  }

  /**
   * A chamada, com UMA nova tentativa quando o erro e passageiro.
   *
   * ==========================================================================
   * SO REPETE O QUE PODE DAR CERTO NA SEGUNDA — 16/09/2026.
   *
   * Fila cheia, limite por minuto (429 comum), erro 5xx e queda de rede
   * costumam passar em segundos. Sem credito (`insufficient_quota`), chave
   * invalida, imagem recusada e timeout NAO repetem: os tres primeiros dao o
   * mesmo erro de novo, e o timeout ja esperou dois minutos — repetir faria a
   * pessoa esperar quatro por uma resposta que ela pode pedir com "tenta de
   * novo".
   * ==========================================================================
   */
  private async pedir(
    endpoint: string,
    chave: string,
    init: { headers?: Record<string, string>; body: FormData | string },
    emJpeg = true,
  ): Promise<ImagemTratada | null> {
    const primeira = await this.tentar(endpoint, chave, init, emJpeg);
    if (primeira.imagem || !primeira.passageira) return primeira.imagem;

    this.logger.warn(
      `OpenAI ${endpoint.split('/v1')[1]}: erro passageiro, tentando de novo em ${primeira.esperarMs} ms.`,
    );
    await new Promise((r) => setTimeout(r, primeira.esperarMs));
    return (await this.tentar(endpoint, chave, init, emJpeg)).imagem;
  }

  /** Espera antes de repetir, quando a OpenAI nao diz quanto. */
  esperaPadraoMs = 5_000;

  private async tentar(
    endpoint: string,
    chave: string,
    init: { headers?: Record<string, string>; body: FormData | string },
    emJpeg: boolean,
  ): Promise<{
    imagem: ImagemTratada | null;
    passageira: boolean;
    esperarMs: number;
  }> {
    const falha = (passageira: boolean, esperarMs = this.esperaPadraoMs) => ({
      imagem: null,
      passageira,
      esperarMs,
    });

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, ...init.headers },
        body: init.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        // Corpo no log: aqui nao ha PII — a resposta de erro fala de modelo,
        // cota e formato, e sem ela nao da para distinguir chave invalida de
        // conteudo recusado.
        const corpo = await resp.text();
        this.logger.error(
          `OpenAI ${endpoint.split('/v1')[1]} ${resp.status}: ${corpo.slice(0, 300)}`,
        );
        const semCredito = /insufficient_quota|credit_balance_exhausted/.test(
          corpo,
        );
        const passageira =
          resp.status >= 500 || (resp.status === 429 && !semCredito);
        // O `retry-after` da OpenAI vem em segundos. Teto de 20 s: mais que
        // isso, a pessoa pede de novo quando quiser.
        const pedido = Number(resp.headers?.get?.('retry-after'));
        return falha(
          passageira,
          pedido > 0 ? Math.min(pedido * 1000, 20_000) : this.esperaPadraoMs,
        );
      }

      const dados = (await resp.json()) as { data?: { b64_json?: string }[] };
      const b64 = dados.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.error('OpenAI devolveu resposta sem imagem.');
        return falha(false);
      }

      return {
        imagem: {
          conteudo: Buffer.from(b64, 'base64'),
          mime: emJpeg ? 'image/jpeg' : 'image/png',
        },
        passageira: false,
        esperarMs: 0,
      };
    } catch (err) {
      this.logger.error(`Falha ao gerar imagem: ${String(err)}`);
      // Timeout ja esperou o teto inteiro; queda de rede costuma passar.
      const timeout = err instanceof Error && err.name === 'TimeoutError';
      return falha(!timeout);
    }
  }

  private modelo(): string {
    return this.config.get<string>('OPENAI_IMAGEM_MODEL') ?? MODELO_PADRAO;
  }

  /**
   * O prompt do packshot.
   *
   * A ordem e deliberada: regra dura, instrucao base, composicao do catalogo,
   * pedido pontual, fundo, regra dura de novo. O pedido da pessoa vem DEPOIS
   * da composicao para poder contraria-la, e a regra da peca fecha porque
   * instrucao no fim pesa mais que no meio.
   */
  private montarPrompt(pedido: PedidoDeTratamento): string {
    const partes = [REGRA_PECA_INTOCADA, INSTRUCAO_BASE];

    if (pedido.padrao?.trim()) {
      partes.push(`Padrão desta coleção: ${pedido.padrao.trim()}`);
    }
    if (pedido.pedidoDaPessoa?.trim()) {
      partes.push(`Pedido para esta peça: ${pedido.pedidoDaPessoa.trim()}`);
    }

    // A COR DO FUNDO, UMA VEZ SO E POR ULTIMO — o conserto do HML-17.
    //
    // O defeito foi haver DUAS ordens de fundo no mesmo texto: um "Fundo
    // BRANCO" fixo, em maiusculas, e outra cor escrita depois. O modelo ficava
    // com a primeira. Agora existe uma linha de fundo apenas.
    partes.push(this.corDoFundo(pedido));

    partes.push(REGRA_PECA_INTOCADA);
    return partes.join('\n\n');
  }

  /**
   * Quem manda no fundo do packshot:
   *
   *   1. o PEDIDO da pessoa, que e sobre esta peca ("fundo rosa")
   *   2. o BRANCO, sempre que ninguem pediu
   *
   * ==========================================================================
   * O TEMA DO CATALOGO SAIU DAQUI — 16/09/2026.
   *
   * Em 15/09 a colecao ganhou vez no fundo: "tema praiano" virava packshot
   * bege. O Lucas corrigiu no dia seguinte: o tema e do CATALOGO — capa,
   * pagina, a peca na modelo —, e nao do fundo da joia. O packshot volta a
   * ser branco, e a pagina tematica o recebe num cartao branco.
   * ==========================================================================
   */
  private corDoFundo(pedido: PedidoDeTratamento): string {
    if (pedido.pedidoDaPessoa?.trim()) {
      return 'FUNDO: siga o "Pedido para esta peça" acima. Sem pedido de cor, BRANCO.';
    }
    return FUNDO_PADRAO;
  }

  private paraBlob(imagem: ImagemDeEntrada): Blob {
    return new Blob([new Uint8Array(imagem.conteudo)], { type: imagem.mime });
  }
}
