/**
 * SAI TUDO? — a pergunta do Lucas em 28/10/2026, respondida por medição.
 *
 * ==========================================================================
 * Para cada leitura de lista das DUAS agentes, contra o banco:
 *
 *   conversa  quantas linhas o MODELO recebe
 *   tabela    quantas a tabela guardada tem
 *   total     quantas existem no recorte
 *   entrega   o que sai sozinho depois da resposta
 *
 * A conta que importa é `tabela == total`: é ela que diz que nada ficou de
 * fora. A conversa ficar curta é de propósito — o modelo escreve uma frase, e
 * a lista sai pelo nosso código.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-sai-tudo.ts
 *
 * Só SELECT, não ocupa a porta 3000, e nenhum nome de cliente sai no
 * terminal — aqui o que se confere é a CONTAGEM.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FerramentasGestaoService } from '../src/modules/atendimentos/application/ferramentas-gestao.service';
import { FerramentasVendedoraService } from '../src/modules/atendimentos/application/ferramentas-vendedora.service';
import { UltimoRelatorioService } from '../src/modules/relatorios/application/ultimo-relatorio.service';
import { EntregarRelatorioUseCase } from '../src/modules/relatorios/application/entregar-relatorio.use-case';

const NL = String.fromCharCode(10);
/** A maior carteira da casa: a Keyciane, erp 005. */
const VENDEDORA_ID = '9b0d8d87-1ecd-4eae-a0ad-dee716758007';
const CODIGO_ERP = '005';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const gestao = app.get(FerramentasGestaoService);
  const vend = app.get(FerramentasVendedoraService);
  const ultimo = app.get(UltimoRelatorioService);
  const entregar = app.get(EntregarRelatorioUseCase);

  const g = (chave: string) =>
    gestao.montar({
      chaveDaConversa: chave,
      solicitante: 'conferência',
      verLoja: true,
    });
  const h = (chave: string) =>
    vend.montar({
      vendedoraId: VENDEDORA_ID,
      codigoErp: CODIGO_ERP,
      chaveDaConversa: chave,
    });

  type Caso = {
    quem: string;
    nome: string;
    rodar: (chave: string) => Promise<{ linhas: number; total?: number }>;
  };

  const casos: Caso[] = [
    {
      quem: 'Anastasia',
      nome: 'vendas da Ylka em 2026',
      rodar: async (k) => {
        const r = await g(k).gestaoVendasDetalhadas({
          vendedora: 'Ylka',
          de: '2026-01-01',
          ate: '2026-12-31',
        });
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'vendas da AT JEWEL desde 2023',
      rodar: async (k) => {
        const r = await g(k).gestaoVendasDetalhadas({
          empresa: 'AT JEWEL LTDA',
          de: '2023-01-01',
          ate: '2026-12-31',
        });
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'compras por ano da Ylka',
      rodar: async (k) => {
        const r = await g(k).gestaoClientesPorAno({
          vendedora: 'Ylka',
          de: '2025-01-01',
          ate: '2026-12-31',
        });
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'melhores clientes da Keyciane',
      rodar: async (k) => {
        const r = await g(k).gestaoMelhores({ vendedora: 'Keyciane' });
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'carteira parada da Keyciane',
      rodar: async (k) => {
        const r = await g(k).gestaoCarteira({
          vendedora: 'Keyciane',
          meses: 6,
        });
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'clientes por epoca (dezembro)',
      rodar: async (k) => {
        const r = await g(k).gestaoEpoca({ vendedora: 'Keyciane', mes: 12 });
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'clientes por fidelidade (loja)',
      rodar: async (k) => {
        const r = await g(k).gestaoFidelidade({});
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'pecas por valor (2026)',
      rodar: async (k) => {
        const r = await g(k).gestaoPecasPorValor({
          valorMinimo: 1,
          de: '2026-01-01',
          ate: '2026-12-31',
        });
        return { linhas: r.linhas.length, total: r.totalDeLinhas };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'itens mais vendidos (ano)',
      rodar: async (k) => {
        const r = await g(k).gestaoItens({ periodo: 'ANO' });
        return {
          linhas: r.linhas.length,
          total: (r as { total?: number }).total,
        };
      },
    },
    {
      quem: 'Anastasia',
      nome: 'leads aguardando',
      rodar: async (k) => {
        const r = await g(k).gestaoLeads({});
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Helena',
      nome: 'clientes sem comprar',
      rodar: async (k) => {
        const r = await h(k).clientesSemComprar({ meses: 6 });
        return { linhas: r.clientes.length, total: r.total };
      },
    },
    {
      quem: 'Helena',
      nome: 'melhores clientes',
      rodar: async (k) => {
        const r = await h(k).melhoresClientes({});
        return { linhas: r.clientes.length, total: r.total };
      },
    },
    {
      quem: 'Helena',
      nome: 'clientes por epoca (dezembro)',
      rodar: async (k) => {
        const r = await h(k).clientesPorEpoca({ mes: 12 });
        return { linhas: r.clientes.length, total: r.total };
      },
    },
    {
      quem: 'Helena',
      nome: 'clientes por fidelidade',
      rodar: async (k) => {
        const r = await h(k).clientesPorFidelidade({});
        return { linhas: r.linhas.length, total: r.total };
      },
    },
    {
      quem: 'Helena',
      nome: 'minhas pecas por valor (2026)',
      rodar: async (k) => {
        const r = await h(k).minhasPecasPorValor({
          valorMinimo: 1,
          de: '2026-01-01',
          ate: '2026-12-31',
        });
        return { linhas: r.linhas.length, total: r.totalDeLinhas };
      },
    },
  ];

  console.log('');
  console.log(
    'agente     lista                            conversa  tabela   total  entrega',
  );
  console.log(
    '---------- -------------------------------- -------- ------- ------- ------------------',
  );

  let falhas = 0;
  for (const caso of casos) {
    const chave = 'saitudo:' + caso.quem + ':' + caso.nome;
    const { linhas, total } = await caso.rodar(chave);
    // O funil conta as linhas da conversa — é o que o `aoResponderConsulta` faz.
    ultimo.guardarTexto(
      chave,
      caso.nome,
      Array.from({ length: linhas }, (_, i) => '- linha ' + (i + 1)).join(NL),
      {},
    );
    const t = ultimo.pegar(chave);
    const naTabela = t?.linhas.length ?? 0;
    const e = await entregar.oQueFaltou(chave, { geradoPor: 'conferência' });
    const entrega = !e
      ? 'nada a acrescentar'
      : e.tipo === 'LISTA'
        ? e.linhas + ' em ' + e.mensagens.length + ' msg'
        : 'PDF ' + (e.arquivo.conteudo.length / 1024).toFixed(0) + ' KB';
    const completa = total === undefined || naTabela >= total;
    if (!completa) falhas += 1;
    console.log(
      caso.quem.padEnd(10) +
        ' ' +
        caso.nome.padEnd(32) +
        String(linhas).padStart(8) +
        String(naTabela).padStart(8) +
        String(total ?? '-').padStart(8) +
        '  ' +
        entrega +
        (completa ? '' : '   <- A TABELA PERDEU LINHAS'),
    );
  }

  console.log('');
  console.log(
    falhas === 0
      ? 'OK — em todas, a tabela tem o total. Nada ficou de fora.'
      : 'FALHOU em ' + falhas + ' lista(s).',
  );
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
