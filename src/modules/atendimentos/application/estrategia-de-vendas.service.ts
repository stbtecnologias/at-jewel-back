import { Injectable, Logger } from '@nestjs/common';
import { ConsultarDesempenhoVendedoraUseCase } from './use-cases/consultar-desempenho-vendedora.use-case';
import { ConsultarCarteiraVendedoraUseCase } from './use-cases/consultar-carteira-vendedora.use-case';
import { ConsultarVendasUseCase } from '../../movimentacoes/application/use-cases/consultar-vendas.use-case';
import { moeda } from '../../../shared/formato/moeda';

/** Quantos dias parados contam como "cliente parado" para o plano. */
const DIAS_PARADO = 90;

/** Quantas linhas de cada bloco. O plano é para a semana, não um relatório. */
const POR_BLOCO = 8;

/**
 * O DOSSIÊ QUE VIRA PLANO DE VENDAS — RF38, 22/10/2026.
 *
 * ==========================================================================
 * A DEFINIÇÃO DE "ESTRATÉGIA" VEIO COMO RECEITA, e ela é do Lucas:
 *
 *   *"Você pode usar as ferramentas que tem: clientes que estão há algum
 *   tempo sem comprar, clientes que sempre compram no mês em que estamos, as
 *   peças que a vendedora mais solicita. E fazer um plano estratégico de
 *   vendas, com sugestão com base no perfil da vendedora."*
 *
 * E o alcance, no mesmo dia: *"se ela perguntar 'monte uma estratégia de
 * venda para mim', ou a gerente perguntar 'monte uma estratégia para a
 * Camila' — você tem acesso às vendas delas e à carteira de clientes delas"*.
 * ==========================================================================
 *
 * O QUE ESTE SERVIÇO FAZ, E O QUE ELE NÃO FAZ.
 *
 * Ele junta cinco leituras que já existiam e devolve TEXTO — nomes, datas e
 * números, como o banco os deu. **Ele não escreve o plano.** Quem escreve é a
 * agente, em cima disto.
 *
 * É a mesma divisão da concepção de 24/09, aplicada a outra coisa: o dado não
 * passa pelo modelo, a redação passa. Plano é opinião, e opinião é o que ele
 * sabe fazer; nome de cliente, não.
 *
 * MORA AQUI, E NÃO EM CADA CANAL, porque a receita é uma só e os dois canais
 * a pedem — a vendedora para si, a gestão para alguém da equipe. Duas cópias
 * virariam duas estratégias diferentes no dia em que uma delas mudasse.
 */
@Injectable()
export class EstrategiaDeVendasService {
  private readonly logger = new Logger(EstrategiaDeVendasService.name);

  constructor(
    private readonly desempenho: ConsultarDesempenhoVendedoraUseCase,
    private readonly carteira: ConsultarCarteiraVendedoraUseCase,
    private readonly vendas: ConsultarVendasUseCase,
  ) {}

  /**
   * @param nome como chamá-la no plano — "Camila", ou "você" no canal dela.
   * @param codigoErp a chave da CARTEIRA. Sem ele, os dois blocos de cliente
   *   saem vazios, e o plano sai só com o que ela vende — que ainda é plano.
   */
  async montar(
    vendedoraId: string,
    nome: string,
    codigoErp: string | null,
    agora: Date = new Date(),
  ): Promise<string> {
    const mes = agora.getMonth() + 1;
    const desde = new Date(agora);
    desde.setDate(desde.getDate() - DIAS_PARADO);

    // AS CINCO DE UMA VEZ: são leituras independentes, e em série a resposta
    // demoraria cinco idas ao banco enquanto ela olha o "digitando...".
    const [vendasDoMes, metas, parados, daEpoca, maisVendidas] =
      await Promise.all([
        this.desempenho.vendas(vendedoraId, 'MES', agora),
        this.desempenho.metas(vendedoraId),
        codigoErp
          ? this.carteira.semComprar(codigoErp, desde, 0)
          : Promise.resolve({ clientes: [], total: 0 }),
        codigoErp
          ? this.carteira.porEpoca(codigoErp, { mes })
          : Promise.resolve({ clientes: [], total: 0 }),
        this.vendas.itens('ANO', POR_BLOCO, vendedoraId, agora),
      ]);

    const blocos: string[] = [];

    // ------------------------------------------------------------------
    // 1. COMO ELA ESTÁ. É o que faz o plano ser DELA e não um modelo.
    // ------------------------------------------------------------------
    blocos.push(
      `Como ${nome} está no mês:\n` +
        (vendasDoMes.quantidade === 0
          ? '- nenhuma venda ainda neste mês'
          : `- ${vendasDoMes.quantidade} ${vendasDoMes.quantidade === 1 ? 'venda' : 'vendas'}, ` +
            `${moeda(vendasDoMes.receita)} em receita, ticket médio ${moeda(vendasDoMes.ticketMedio)}`),
    );

    if (metas.length > 0) {
      blocos.push(
        'Meta:\n' +
          metas
            .map((m) =>
              m.batida
                ? `- ${m.descricao}: batida — ${moeda(m.realizado)} de ${moeda(m.alvo)}`
                : `- ${m.descricao}: faltam ${moeda(m.restante)} de ${moeda(m.alvo)} até ${m.prazo.toLocaleDateString('pt-BR')}`,
            )
            .join('\n'),
      );
    }

    // ------------------------------------------------------------------
    // 2. QUEM CHAMAR. Os dois blocos de cliente são o miolo do plano: um
    //    diz quem esfriou, o outro diz quem tem HÁBITO de comprar agora.
    // ------------------------------------------------------------------
    if (parados.clientes.length > 0) {
      blocos.push(
        `Clientes da carteira dela sem comprar há mais de ${DIAS_PARADO} dias ` +
          `(${parados.clientes.length} de ${parados.total}):\n` +
          parados.clientes
            .slice(0, POR_BLOCO)
            .map((c) => `- ${linhaDoParado(c)}`)
            .join('\n'),
      );
    }

    if (daEpoca.clientes.length > 0) {
      blocos.push(
        `Clientes da carteira dela que costumam comprar em ${nomeDoMes(mes)} ` +
          `(${daEpoca.clientes.length} de ${daEpoca.total}):\n` +
          daEpoca.clientes
            .slice(0, POR_BLOCO)
            .map((c) => `- ${linhaDaEpoca(c)}`)
            .join('\n'),
      );
    }

    // ------------------------------------------------------------------
    // 3. O QUE OFERECER — o perfil dela, lido do que ela vendeu no ano.
    // ------------------------------------------------------------------
    if (maisVendidas.linhas.length > 0) {
      blocos.push(
        `O que ${nome} mais vendeu nos últimos 12 meses:\n` +
          maisVendidas.linhas
            .map(
              (i) =>
                `- ${i.codigoErp ? `${i.codigoErp} ` : ''}${i.descricao ?? i.familia ?? 'peça'}` +
                ` — ${i.quantidade} ${i.quantidade === 1 ? 'peça' : 'peças'}, ${moeda(i.valor)}`,
            )
            .join('\n'),
      );
    }

    if (blocos.length <= 1 && vendasDoMes.quantidade === 0) {
      // NADA PARA PLANEJAR É UMA RESPOSTA, e não um plano vazio: sem carteira
      // e sem venda, qualquer sugestão aqui seria invenção.
      this.logger.debug(`Sem dados para a estratégia de ${vendedoraId}.`);
      return (
        'Não há de onde tirar um plano para ela: nenhuma venda no mês, ' +
        'nenhum cliente parado e nenhum histórico de peça. Diga isso, e ' +
        'ofereça olhar outro período ou a carteira de outra pessoa.'
      );
    }

    return blocos.join('\n\n');
  }
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function nomeDoMes(mes: number): string {
  return MESES[mes - 1] ?? 'neste mês';
}

/**
 * AS LINHAS SÃO AS MESMAS QUE ELA JÁ LÊ NAS CONSULTAS SOLTAS.
 *
 * Não é economia de código: é para o plano e a consulta direta contarem a
 * mesma coisa do mesmo jeito. Duas formatações divergiriam no dia em que uma
 * delas ganhasse um campo, e aí a mesma cliente apareceria diferente em dois
 * lugares — que é o tipo de diferença que faz quem lê duvidar das duas.
 */
function linhaDoParado(c: {
  nome: string;
  ultimaCompra: Date | null;
  quantidade: number;
}): string {
  return c.ultimaCompra
    ? `${c.nome} — última compra em ${c.ultimaCompra.toLocaleDateString('pt-BR')}, ` +
        `${c.quantidade} ${c.quantidade === 1 ? 'compra' : 'compras'} no total`
    : `${c.nome} — nunca comprou`;
}

function linhaDaEpoca(c: {
  nome: string;
  quantidade: number;
  anos: number;
  valorTotal: number;
  ultimaCompra: Date | null;
}): string {
  return (
    `${c.nome} — ${c.quantidade} ${c.quantidade === 1 ? 'compra' : 'compras'}` +
    // EM QUANTOS ANOS, e não só o total: três compras em três dezembros é
    // hábito; três no mesmo dezembro é uma tarde de compras.
    `${c.anos > 1 ? ` em ${c.anos} anos diferentes` : ' (num ano só)'}` +
    `, ${moeda(c.valorTotal)}` +
    `${c.ultimaCompra ? `, a última em ${c.ultimaCompra.toLocaleDateString('pt-BR')}` : ''}`
  );
}
