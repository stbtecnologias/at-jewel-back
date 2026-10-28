/**
 * A LISTA INTEIRA NA CONVERSA, CONTRA O BANCO — 28/10/2026.
 *
 * ==========================================================================
 * *"Se não tiver [quantidade] deve vir tudo de uma vez no WhatsApp."*
 *
 * Roda a consulta, pede o formato LISTA e mostra o que SAIRIA no WhatsApp:
 * quantas mensagens, quantos caracteres cada uma, e as primeiras linhas.
 * Sem o modelo no meio, e sem mandar nada para ninguém.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-lista-na-conversa.ts
 *
 * Só SELECT. Os nomes de cliente das amostras saem MASCARADOS no terminal —
 * a regra da casa para log; na mensagem de verdade vão inteiros, porque é
 * ela que se lê.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FerramentasGestaoService } from '../src/modules/atendimentos/application/ferramentas-gestao.service';
import { EntregarRelatorioUseCase } from '../src/modules/relatorios/application/entregar-relatorio.use-case';

const M = '>> ';
const NL = String.fromCharCode(10);

/** Troca o nome do cliente por [cliente] na amostra do terminal. */
function semNome(linha: string): string {
  return linha.replace(/\| [A-ZÁÉÍÓÚÃÕÂÊÔÇ][A-ZÁÉÍÓÚÃÕÂÊÔÇ ]{4,} \|/g, '| [cliente] |');
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ferramentas = app.get(FerramentasGestaoService);
  const entregar = app.get(EntregarRelatorioUseCase);

  const casos: { nome: string; pedido: Record<string, unknown> }[] = [
    { nome: 'vendas da Ylka em 2026', pedido: { vendedora: 'Ylka', de: '2026-01-01', ate: '2026-12-31' } },
    { nome: 'vendas da Ylka desde 2023', pedido: { vendedora: 'Ylka', de: '2023-01-01', ate: '2026-12-31' } },
    { nome: 'vendas da AT JEWEL LTDA desde 2023', pedido: { empresa: 'AT JEWEL LTDA', de: '2023-01-01', ate: '2026-12-31' } },
  ];

  for (const caso of casos) {
    const chave = 'lista:' + caso.nome;
    const r = await ferramentas
      .montar({ chaveDaConversa: chave, solicitante: 'conferência', verLoja: true })
      .gestaoVendasDetalhadas(caso.pedido as never);
    if (r.status !== 'OK') {
      console.log(M + caso.nome + ': ' + r.status);
      continue;
    }
    const entregue = await entregar.execute(chave, 'LISTA', {
      geradoPor: 'conferência',
    });
    console.log('');
    console.log(M + '=== ' + caso.nome + ' ===');
    if (!entregue) {
      console.log(M + 'nada guardado');
      continue;
    }
    if (entregue.tipo === 'ARQUIVO') {
      console.log(
        M + 'NAO CABE EM MENSAGEM -> virou arquivo: ' + entregue.arquivo.nome +
          ' (' + (entregue.arquivo.conteudo.length / 1024).toFixed(0) + ' KB)',
      );
      continue;
    }
    console.log(M + 'linhas: ' + entregue.linhas + ' de ' + entregue.total);
    console.log(M + 'mensagens: ' + entregue.mensagens.length);
    entregue.mensagens.forEach((m, i) => {
      console.log(M + '  parte ' + (i + 1) + ': ' + m.length + ' caracteres');
    });
    const primeiras = entregue.mensagens[0].split(NL).slice(0, 5);
    for (const l of primeiras) console.log(M + '  | ' + semNome(l));
    const fim = entregue.mensagens.at(-1)!.split(NL).slice(-3);
    for (const l of fim) console.log(M + '  | ' + semNome(l));
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
