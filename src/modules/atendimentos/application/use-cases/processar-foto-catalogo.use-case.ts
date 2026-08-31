import { Inject, Injectable, Logger } from '@nestjs/common';
import { WHATSAPP_GATEWAY } from '../../../atendimento/domain/ports/injection-tokens';
import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { TratarFotoUseCase } from '../../../catalogos/application/use-cases/tratar-foto.use-case';
import {
  LIMITE_BYTES,
  MIMES_IMAGEM,
  PASTA_ORIGINAIS,
  PASTA_PENDENTES,
  pastaDoCatalogo,
  type IArmazenamento,
} from '../../../catalogos/domain/ports/armazenamento.port';
import {
  ARMAZENAMENTO,
  CATALOGO_REPOSITORY,
} from '../../../catalogos/domain/ports/injection-tokens';
import type {
  CatalogoAberto,
  ICatalogoRepository,
} from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';
import { PRODUTO_REPOSITORY } from '../../../erp/domain/ports/injection-tokens';
import type { IProdutoRepository } from '../../../erp/domain/ports/repositories/produto-repository.port';
import {
  SessaoCatalogoService,
  type FotoPendente,
} from '../sessao-catalogo.service';

/**
 * Parcelamento padrao.
 *
 * O ERP nao guarda parcelamento — so o preco. Nos catalogos reais conferidos
 * no levantamento, 10X aparece em quase tudo e 6X em duas pecas. Assumir 10X
 * erra o VALOR DA PARCELA nos casos raros, nunca o preco; quem souber que a
 * peca e 6X escreve "6x" na legenda.
 */
const PARCELAS_PADRAO = 10;

/**
 * Permissao que habilita o assunto catalogo no canal interno. Mora aqui, e
 * nao no modulo de auth, porque quem define o que e "poder mandar foto de
 * peca" e este fluxo.
 */
export const PERMISSAO_CATALOGO = 'catalogo:write';

/** `CO26185`, `BR26252` — duas letras e digitos. E o formato dos catalogos da casa. */
const RE_CODIGO = /\b([A-Z]{2}\d{3,})\b/i;

/** `10x`, `6 X` — parcelamento informado na legenda. */
const RE_PARCELAS = /\b(\d{1,2})\s*x\b/i;

/** `0042`, `#42`, `42` — o numero do catalogo. */
const RE_NUMERO = /#?\b(\d{1,6})\b/;

/**
 * Palavras que sao COMANDO, nao estilo.
 *
 * A fronteira de palavra nos dois lados e essencial: sem ela, "cat" casaria
 * dentro de "catalogo" (deixando "alogo") e "foto" dentro de "fotografia".
 */
const PALAVRAS_DE_COMANDO =
  /\b(catalogo|catálogo|cat|ref|referencia|referência|codigo|código|peca|peça|foto)\b/gi;

/**
 * O que sobra da legenda vira pedido de estilo para a IA — "fundo rosa",
 * "mais claro". Menos de tres caracteres e ruido de pontuacao, nao instrucao.
 */
function limparPedido(resto: string): string | null {
  const limpo = resto
    .replace(PALAVRAS_DE_COMANDO, ' ')
    .replace(/[#\s]+/g, ' ')
    .trim();
  return limpo.length >= 3 ? limpo : null;
}

/**
 * A imagem como a APLICACAO a conhece. Espelha o que o webhook extrai, mas
 * declarada aqui: o mesmo criterio do audio — a camada de aplicacao nao
 * importa tipo da infra, senao trocar de provedor de WhatsApp mexeria nos
 * casos de uso.
 */
export interface ImagemInterna {
  /** Endereco do arquivo ja decifrado pelo provedor. Nulo = nao deu para baixar. */
  url: string | null;
  mimetype: string;
}

export interface FotoDoCanal {
  /** Identificador do remetente ja resolvido (contem telefone). */
  de: string;
  /** Rotulo de quem fotografou. Nome do staff, nunca o telefone. */
  nomeRemetente: string;
  legenda: string;
  imagem: ImagemInterna;
}

export interface RespostaFoto {
  resposta: string | null;
  motivo: string;
}

/**
 * A foto da peca chegando pelo WhatsApp.
 *
 * ==========================================================================
 * A ORDEM DAS OPERACOES NAO E ARBITRARIA: BAIXAR PRIMEIRO, PERGUNTAR DEPOIS.
 *
 * O WAHA apaga a midia decifrada em 30 minutos. Se o fluxo fosse "perguntar de
 * qual catalogo e, e so entao baixar", bastaria a pessoa sair para almocar
 * para a foto sumir — e ela nao teria como saber, porque ja tinha mandado.
 * Entao grava-se o arquivo assim que ele chega, e a classificacao acontece
 * depois, sobre um arquivo que ja e nosso.
 * ==========================================================================
 *
 * ESTA RODADA NAO TEM IA. A foto entra como veio do celular, em status
 * RECEBIDA. O tratamento pela IA e a aprovacao na conversa sao a proxima
 * etapa; ate la a tela mostra o packshot cru, que ja e util para conferir
 * enquadramento e se a peca certa foi fotografada.
 */
@Injectable()
export class ProcessarFotoCatalogoUseCase {
  private readonly logger = new Logger(ProcessarFotoCatalogoUseCase.name);

  constructor(
    @Inject(CATALOGO_REPOSITORY)
    private readonly catalogos: ICatalogoRepository,
    @Inject(ARMAZENAMENTO)
    private readonly armazenamento: IArmazenamento,
    @Inject(PRODUTO_REPOSITORY)
    private readonly produtos: IProdutoRepository,
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsapp: IWhatsappGateway,
    private readonly sessao: SessaoCatalogoService,
    private readonly tratar: TratarFotoUseCase,
  ) {}

  /**
   * Trata a foto e manda o resultado para quem a enviou.
   *
   * RODA FORA DA RESPOSTA, e por isso nao tem `await` de quem a chama: gerar
   * imagem leva 10 a 30 segundos, e segurar o webhook por esse tempo faria o
   * WAHA reenviar o evento — a mesma foto entraria duas vezes.
   *
   * Nada aqui pode estourar para fora: a foto ja esta gravada, e a pessoa ja
   * recebeu a confirmacao. Falhar custa a versao tratada, nunca a imagem.
   */
  private async tratarEAvisar(
    fotoId: string,
    pedidoDeEstilo: string | null,
    chat: string,
  ): Promise<void> {
    try {
      const r = await this.tratar.execute(fotoId, pedidoDeEstilo);
      if (!r) return;

      if (r.recado) {
        await this.whatsapp.enviarTexto(chat, r.recado);
        return;
      }
      if (r.foto.status !== 'EM_APROVACAO' || !r.foto.arquivoId) return;

      const tratada = await this.armazenamento.ler(r.foto.arquivoId);
      if (!tratada) return;

      await this.whatsapp.enviarImagem(
        chat,
        tratada.conteudo,
        tratada.mime,
        'Ficou assim. Se aprovar, me responde "aprovo" — se quiser mudar algo, é só dizer o quê.',
      );
    } catch (err) {
      this.logger.error(
        `Falha ao tratar/avisar a foto ${fotoId}: ${String(err)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Chegou uma foto
  // ---------------------------------------------------------------------------
  async foto(msg: FotoDoCanal): Promise<RespostaFoto> {
    await this.varrerExpiradas();

    const abertos = await this.catalogos.listarAbertos();
    if (abertos.length === 0) {
      return {
        resposta:
          'Recebi a foto, mas não há nenhum catálogo liberado para receber fotos. ' +
          'Crie ou libere um no painel e me manda de novo.',
        motivo: 'catalogo_nenhum_aberto',
      };
    }

    if (!msg.imagem.url) {
      // O WAHA reconheceu a imagem mas nao entregou o arquivo. Avisar e melhor
      // que silencio: quem mandou acha que deu certo.
      return {
        resposta:
          'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?',
        motivo: 'imagem_sem_arquivo',
      };
    }

    const arquivo = await this.whatsapp.baixarMidia(msg.imagem.url);
    if (!arquivo) {
      return {
        resposta:
          'Chegou sua foto mas não consegui baixar o arquivo. Pode mandar de novo?',
        motivo: 'imagem_download_falhou',
      };
    }

    const mime = arquivo.mimetype.startsWith('image/')
      ? arquivo.mimetype
      : msg.imagem.mimetype;
    if (!MIMES_IMAGEM.includes(mime as (typeof MIMES_IMAGEM)[number])) {
      return {
        resposta: `Não consigo usar esse formato (${mime}). Manda como foto normal (JPEG ou PNG).`,
        motivo: 'imagem_formato_recusado',
      };
    }
    if (arquivo.conteudo.length > LIMITE_BYTES) {
      return {
        resposta: 'Essa imagem é grande demais. Manda uma versão menor.',
        motivo: 'imagem_grande_demais',
      };
    }

    // GRAVA ANTES DE QUALQUER PERGUNTA — ver o cabecalho.
    const chave = await this.armazenamento.guardar(
      { conteudo: arquivo.conteudo, mime, nomeOriginal: 'whatsapp' },
      PASTA_PENDENTES,
    );

    const analise = this.lerLegenda(msg.legenda, abertos);
    const catalogo = analise.catalogo ?? this.sessao.catalogoAtual(msg.de);

    if (!catalogo) {
      const pendurou = this.sessao.pendurar(msg.de, {
        arquivoId: chave,
        mime,
        codigoErp: analise.codigo,
        parcelas: analise.parcelas,
        pedidoDeEstilo: analise.pedidoDeEstilo,
      });
      if (!pendurou) {
        await this.armazenamento.remover(chave);
        return {
          resposta:
            'Tem foto demais esperando resposta. Me diz de qual catálogo são antes de mandar mais.',
          motivo: 'fila_cheia',
        };
      }
      return {
        resposta: this.perguntarCatalogo(abertos),
        motivo: 'aguardando_catalogo',
      };
    }

    this.sessao.lembrarCatalogo(msg.de, catalogo);
    const guardada = await this.guardarFoto(
      catalogo,
      msg.nomeRemetente,
      {
        arquivoId: chave,
        mime,
        codigoErp: analise.codigo,
        parcelas: analise.parcelas,
        pedidoDeEstilo: analise.pedidoDeEstilo,
        em: Date.now(),
      },
      msg.de,
    );

    return { resposta: guardada, motivo: 'foto_guardada' };
  }

  // ---------------------------------------------------------------------------
  // Chegou um texto enquanto havia foto esperando
  // ---------------------------------------------------------------------------
  async resposta(
    de: string,
    nomeRemetente: string,
    texto: string,
  ): Promise<RespostaFoto> {
    const abertos = await this.catalogos.listarAbertos();
    const analise = this.lerLegenda(texto, abertos);

    if (!analise.catalogo) {
      return {
        resposta: 'Não achei esse catálogo. ' + this.perguntarCatalogo(abertos),
        motivo: 'catalogo_nao_reconhecido',
      };
    }

    const catalogo = analise.catalogo;
    this.sessao.lembrarCatalogo(de, catalogo);

    const fila = this.sessao.recolherPendentes(de);
    if (fila.length === 0) {
      return {
        resposta: `Certo — as próximas fotos vão para o #${catalogo.numero} ${catalogo.nome}.`,
        motivo: 'catalogo_lembrado',
      };
    }

    const linhas: string[] = [];
    for (const pendente of fila) {
      // O codigo da legenda de agora vale para as fotos que vieram sem codigo.
      const comCodigo: FotoPendente = {
        ...pendente,
        codigoErp: pendente.codigoErp ?? analise.codigo,
        parcelas: pendente.parcelas ?? analise.parcelas,
      };
      linhas.push(
        await this.guardarFoto(catalogo, nomeRemetente, comCodigo, de),
      );
    }

    return {
      resposta:
        fila.length === 1
          ? linhas[0]
          : `${fila.length} fotos foram para o #${catalogo.numero} ${catalogo.nome}.`,
      motivo: 'fotos_classificadas',
    };
  }

  temFotoEsperando(de: string): boolean {
    return this.sessao.temPendentes(de);
  }

  // ---------------------------------------------------------------------------
  // Interno
  // ---------------------------------------------------------------------------

  /**
   * Grava a linha e monta a confirmacao. O descritivo vem do ERP pelo codigo —
   * ninguem redigita preco, que e onde o erro caro acontece.
   */
  private async guardarFoto(
    catalogo: CatalogoAberto,
    remetente: string,
    foto: FotoPendente,
    // Para onde mandar a versao tratada quando ela ficar pronta.
    chat: string,
  ): Promise<string> {
    let descricao: string | null = null;
    let preco: number | null = null;

    if (foto.codigoErp) {
      const produto = await this.produtos.findByCodigoErp(foto.codigoErp);
      if (produto) {
        descricao =
          produto.descricaoEtiqueta ??
          `${produto.familia} ${produto.categoria}`.trim();
        // `valorVenda` do ERP e o preco A VISTA — confirmado com o Lucas em
        // 28/08. O parcelado e derivado dele, nunca guardado.
        preco = produto.valorVenda;
      } else {
        // Nao e erro: a peca pode ainda nao ter sido sincronizada. A foto entra
        // com o codigo escrito e sem descricao — por isso a tabela nao tem FK.
        this.logger.warn(
          `Peca ${foto.codigoErp} nao encontrada no ERP — foto sem descritivo.`,
        );
      }
    }

    // AGORA sabemos de qual catalogo a foto e, e so agora ela pode ir para a
    // pasta dele. Ate aqui viveu em `catalogo/pendentes/` — ver o cabecalho:
    // gravar antes de perguntar e o que impede a imagem de se perder enquanto
    // a vendedora responde.
    //
    // Se o `mover` falhar, ele devolve a chave ORIGINAL, e a linha aponta para
    // a area de espera. Imagem no lugar errado e melhor que linha sem imagem.
    const arquivoId = await this.armazenamento.mover(
      foto.arquivoId,
      pastaDoCatalogo(catalogo.numero, PASTA_ORIGINAIS),
    );

    const criada = await this.catalogos.criarFoto({
      catalogoId: catalogo.id,
      codigoErp: foto.codigoErp,
      descricao,
      precoAVista: preco,
      parcelas: foto.codigoErp ? (foto.parcelas ?? PARCELAS_PADRAO) : null,
      origem: 'WHATSAPP',
      remetente,
      arquivoOriginalId: arquivoId,
      // Aponta para o ORIGINAL ate a IA responder. Se o tratamento falhar, a
      // tela mostra o packshot cru — que ja serve para conferir enquadramento
      // e se a peca certa foi fotografada.
      arquivoId,
      mime: foto.mime,
      status: 'RECEBIDA',
    });

    // O TRATAMENTO NAO SEGURA A RESPOSTA. Gerar imagem leva 10 a 30 segundos, e
    // a pessoa fica olhando o WhatsApp — ela recebe "guardei" agora e a versao
    // tratada quando ficar pronta, podendo mandar a proxima peca no intervalo.
    void this.tratarEAvisar(criada.id, foto.pedidoDeEstilo ?? null, chat);

    const alvo = `#${catalogo.numero} ${catalogo.nome}`;
    if (!foto.codigoErp) {
      return `Foto guardada em ${alvo}. Se quiser, me manda o código da peça que eu completo o descritivo.`;
    }
    if (!descricao) {
      return `Foto guardada em ${alvo} com o código ${foto.codigoErp} — essa peça ainda não está no sistema, então ficou sem descrição e sem preço.`;
    }
    return `Foto guardada em ${alvo}.\n${foto.codigoErp} · ${descricao}\n${this.emReais(preco)} à vista`;
  }

  /**
   * Lê catálogo e código de um texto livre.
   *
   * A ORDEM IMPORTA: o código sai PRIMEIRO. `BR26252` tem dígitos dentro, e
   * procurar o número do catálogo antes acharia "26252" ali e mandaria a foto
   * para um catálogo que não existe — ou, pior, para um que existe.
   */
  private lerLegenda(
    texto: string,
    abertos: CatalogoAberto[],
  ): {
    catalogo: CatalogoAberto | null;
    codigo: string | null;
    parcelas: number | null;
    pedidoDeEstilo: string | null;
  } {
    const bruto = (texto ?? '').trim();

    const mCodigo = bruto.match(RE_CODIGO);
    const codigo = mCodigo ? mCodigo[1].toUpperCase() : null;
    let resto = mCodigo ? bruto.replace(mCodigo[0], ' ') : bruto;

    const mParcelas = resto.match(RE_PARCELAS);
    const parcelas = mParcelas ? Number(mParcelas[1]) : null;
    if (mParcelas) resto = resto.replace(mParcelas[0], ' ');

    // Numero: casa contra os catalogos abertos, comparando sem os zeros a
    // esquerda — quem digita "2" quer o "0002".
    const mNumero = resto.match(RE_NUMERO);
    let catalogo: CatalogoAberto | null = null;
    if (mNumero) {
      const alvo = String(Number(mNumero[1]));
      catalogo = abertos.find((c) => String(Number(c.numero)) === alvo) ?? null;
      if (catalogo) resto = resto.replace(mNumero[0], ' ');
    }

    // Nome: so se o numero nao resolveu. Exige 3 caracteres para "de", "do" e
    // afins nao casarem com meio catalogo.
    if (!catalogo) {
      const termo = normalizar(resto);
      if (termo.length >= 3) {
        const candidatos = abertos.filter((c) =>
          normalizar(c.nome).includes(termo),
        );
        // Ambiguo nao decide sozinho — cai na pergunta.
        if (candidatos.length === 1) catalogo = candidatos[0];
      }
    }

    return {
      catalogo,
      codigo,
      parcelas: parcelas && parcelas > 0 ? parcelas : null,
      // O QUE SOBROU E PEDIDO DE ESTILO. Tirados catalogo, codigo e parcelas, o
      // resto so pode ser instrucao para a imagem: "fundo rosa", "mais claro".
      // As palavras de comando saem — ninguem quer "catalogo" no prompt.
      pedidoDeEstilo: limparPedido(resto),
    };
  }

  private perguntarCatalogo(abertos: CatalogoAberto[]): string {
    const lista = abertos.map((c) => `#${c.numero} — ${c.nome}`).join('\n');
    return `De qual catálogo é?\n${lista}\n\nResponde com o número ou o nome.`;
  }

  private emReais(valor: number | null): string {
    if (valor === null) return '—';
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  /** Apaga do disco o que expirou sem ninguem dizer a que catalogo pertencia. */
  private async varrerExpiradas(): Promise<void> {
    const orfaos = this.sessao.limpar();
    await Promise.all(orfaos.map((c) => this.armazenamento.remover(c)));
  }
}

/** Minusculas, sem acento e sem pontuacao — para casar nome digitado no celular. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento, ja separadas pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
