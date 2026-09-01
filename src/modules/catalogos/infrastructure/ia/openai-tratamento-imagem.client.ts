import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ImagemDeEntrada,
  ImagemTratada,
  ITratamentoImagem,
  PedidoDeTratamento,
} from '../../domain/ports/tratamento-imagem.port';

const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const MODELO_PADRAO = 'gpt-image-1';

/**
 * Geracao de imagem e lenta — 10 a 30 segundos e normal. O timeout e generoso
 * de proposito: cortar em 30s desperdicaria uma chamada ja paga por causa de
 * um pico de fila do provedor.
 */
const TIMEOUT_MS = 120_000;

/**
 * A REGRA QUE NAO SE NEGOCIA.
 *
 * Vem primeiro no prompt e e repetida no fim, porque instrucao no meio de
 * texto longo e a que mais se perde.
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
 * imperativo, com o caso concreto ("se nao tem pedra, a saida nao tem
 * pedra"; "nunca transforme metal branco em dourado"). Instrucao enumerada e
 * especifica sobrevive melhor que paragrafo generico.
 *
 * E O RISCO CONTINUA. Isto e mitigacao, nao garantia: o `gpt-image-1` no
 * `/images/edits` REGERA a imagem em vez de edita-la, entao preservar a peca e
 * um resultado provavel, nunca certo. Quem for conferir o catalogo tem de
 * saber disso — a aprovacao na conversa existe tambem para isto.
 *
 * A unica forma de garantir seria nao regerar: recortar a peca da foto e
 * assenta-la no fundo. Decisao do Lucas em 31/08 foi seguir com a geracao.
 * ==========================================================================
 */
const REGRA_PECA_INTOCADA =
  'REGRA ABSOLUTA: o objeto da imagem enviada é o único objeto da imagem de ' +
  'saída. Ele não pode ser alterado, substituído, completado nem embelezado.\n' +
  '- NÃO ACRESCENTE PEDRAS. Se a peça enviada não tem nenhuma pedra, a imagem ' +
  'de saída não pode ter nenhuma pedra. Se tem três, tem três.\n' +
  '- NÃO MUDE A COR DO METAL. Metal branco, prateado ou cinza permanece ' +
  'branco, prateado ou cinza. NUNCA transforme metal branco em dourado.\n' +
  '- NÃO MUDE o formato, o corte, a espessura, o acabamento, os gravados nem ' +
  'as proporções entre as partes.\n' +
  '- NÃO POLIR, NÃO LIMPAR, NÃO RESTAURAR. Marcas de uso, riscos e ' +
  'irregularidades da peça são dela e permanecem.\n' +
  'Esta NÃO é uma joia de catálogo idealizada: é ESTA peça específica, como ' +
  'ela é. Você está tratando apenas a APRESENTAÇÃO — fundo, iluminação, ' +
  'sombra, enquadramento e nitidez. Na dúvida entre embelezar e manter, ' +
  'MANTENHA.';

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
 * Conferido nos catalogos reais: a peca aparece recortada sobre BRANCO, de
 * frente, na altura do olho. Sem cenario, sem superficie, sem mesa.
 */
const PADRAO_PACKSHOT =
  'Fundo BRANCO liso e uniforme. Sem cenário, sem mesa, sem superfície ' +
  'visível, sem gradiente, sem textura e sem cor de papel. Sombra mínima ou ' +
  'nenhuma. A peça deve aparecer DE FRENTE, na altura do olho, como produto ' +
  'fotografado em estúdio — nunca vista de cima nem em perspectiva inclinada. ' +
  'Centralizada, ocupando a maior parte do quadro.';

const INSTRUCAO_BASE =
  'A imagem enviada é a foto de uma peça, tirada com celular. Produza o ' +
  `packshot dela para catálogo: ${PADRAO_PACKSHOT} ` +
  'Não escreva texto algum na imagem.';

/**
 * Tratamento da foto pela API de imagens da OpenAI.
 *
 * HTTP direto, sem SDK — mesmo caminho do `OpenaiTranscricaoClient`. Trazer o
 * pacote da OpenAI so para duas chamadas nao se paga, e o `fetch` do Node 22 da
 * conta.
 *
 * SEGUNDO ponto do backend que fala com provedor fora da Anthropic, e pelo
 * mesmo motivo do primeiro: a Anthropic nao gera imagem.
 *
 * O QUE SAI DAQUI: a foto da peca e as referencias do catalogo. Nao vai nome de
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
    const chave = this.config.get<string>('OPENAI_API_KEY');
    if (!chave) {
      this.logger.warn('OPENAI_API_KEY ausente — foto nao tratada.');
      return null;
    }

    const form = new FormData();
    form.append(
      'model',
      this.config.get<string>('OPENAI_IMAGEM_MODEL') ?? MODELO_PADRAO,
    );
    form.append('prompt', this.montarPrompt(pedido));
    // ==========================================================================
    // QUADRADA, SEMPRE. O packshot e quadrado — quem tem proporcao 9:16 ou 16:9
    // e a PECA FINAL montada, e nao a foto da joia. Esta na definicao do enum,
    // com todas as letras.
    //
    // Estava pedindo 1024x1536 quando o catalogo era 9:16, e a tela — que
    // desenha a foto num quadrado — cortava o topo e a base da peca. Medido em
    // 01/09/2026: uma garrafa chegou com tampa e fundo fora do quadro.
    //
    // Nao adianta so consertar a exibicao: a imagem alta seria montada no PDF
    // com o mesmo corte, e o arquivo entregue ao marketing tambem.
    // ==========================================================================
    form.append('size', '1024x1024');
    form.append('n', '1');

    // UMA IMAGEM SO, E ISSO NAO E ECONOMIA: e o que impede o modelo de trocar
    // a joia por outra. Ver a porta (`PedidoDeTratamento.original`) — mandar
    // as paginas de referencia junto fez o modelo devolver um brinco recortado
    // de dentro de uma delas.
    form.append('image[]', this.paraBlob(pedido.original), 'peca.png');

    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!resp.ok) {
        // Corpo no log: aqui nao ha PII — a resposta de erro fala de modelo,
        // cota e formato, e sem ela nao da para distinguir chave invalida de
        // conteudo recusado.
        const corpo = await resp.text();
        this.logger.error(
          `OpenAI /images/edits ${resp.status}: ${corpo.slice(0, 300)}`,
        );
        return null;
      }

      const dados = (await resp.json()) as { data?: { b64_json?: string }[] };
      const b64 = dados.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.error('OpenAI devolveu resposta sem imagem.');
        return null;
      }

      return { conteudo: Buffer.from(b64, 'base64'), mime: 'image/png' };
    } catch (err) {
      this.logger.error(`Falha ao tratar a foto: ${String(err)}`);
      return null;
    }
  }

  /**
   * O prompt e montado do CATALOGO, nao fixado aqui.
   *
   * O que muda entre coleções — fonte, composição, cor, iluminação — vive nas
   * referencias de texto, e quem edita e o marketing pelo painel. Fixar isso em
   * constante obrigaria deploy a cada coleção nova.
   *
   * A ordem e deliberada: regra dura, instrucao base, padrao do catalogo,
   * pedido pontual, regra dura de novo. O pedido da pessoa vem DEPOIS do padrao
   * para poder contraria-lo ("fundo rosa" numa coleção de fundo branco), e a
   * regra da peca fecha porque instrucao no fim pesa mais que no meio.
   */
  private montarPrompt(pedido: PedidoDeTratamento): string {
    const partes = [REGRA_PECA_INTOCADA, INSTRUCAO_BASE];

    if (pedido.padrao?.trim()) {
      partes.push(`Padrão desta coleção: ${pedido.padrao.trim()}`);
    }
    if (pedido.pedidoDaPessoa?.trim()) {
      partes.push(`Pedido para esta peça: ${pedido.pedidoDaPessoa.trim()}`);
    } else {
      partes.push('Fundo branco liso, se a coleção não indicar outro.');
    }

    partes.push(REGRA_PECA_INTOCADA);
    return partes.join('\n\n');
  }

  private paraBlob(imagem: ImagemDeEntrada): Blob {
    return new Blob([new Uint8Array(imagem.conteudo)], { type: imagem.mime });
  }
}
