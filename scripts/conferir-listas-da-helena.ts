/**
 * AS LISTAS DA HELENA TAMBÉM LEVAM TUDO — 28/10/2026.
 *
 * ==========================================================================
 * *"Isso de todas as consultas, tanto Helena como Anastasia."* — Lucas.
 *
 * O trabalho de 23/10 e 27/10 (o arquivo levar a lista inteira) foi feito só
 * do lado da GESTÃO. Medido na maior carteira da casa antes do conserto:
 *
 *   Helena,    clientes sem comprar:  20 de 127
 *   Anastasia, a mesma consulta:     127 de 127
 *
 * Este script roda as quatro leituras do canal dela contra o banco e mostra,
 * para cada uma: o que o MODELO recebe, o que a TABELA guarda e o total.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-listas-da-helena.ts
 *
 * Só SELECT, e não ocupa a porta 3000. Nenhum nome de cliente sai no
 * terminal — aqui o que se confere é a CONTAGEM.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FerramentasVendedoraService } from '../src/modules/atendimentos/application/ferramentas-vendedora.service';
import { UltimoRelatorioService } from '../src/modules/relatorios/application/ultimo-relatorio.service';
import { MontarArquivoUseCase } from '../src/modules/relatorios/application/montar-arquivo.use-case';

/** A maior carteira da casa em 28/10: 156 clientes. */
const VENDEDORA_ID = process.argv[2] ?? '9b0d8d87-1ecd-4eae-a0ad-dee716758007';
const CODIGO_ERP = process.argv[3] ?? '005';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const ferramentas = app.get(FerramentasVendedoraService);
  const ultimo = app.get(UltimoRelatorioService);
  const montar = app.get(MontarArquivoUseCase);

  const casos: {
    nome: string;
    rodar: (chave: string) => Promise<{ naConversa: number; total: number }>;
  }[] = [
    {
      nome: 'clientes sem comprar',
      rodar: async (chave) => {
        const r = await ferramentas
          .montar({ vendedoraId: VENDEDORA_ID, codigoErp: CODIGO_ERP, chaveDaConversa: chave })
          .clientesSemComprar({ meses: 6 });
        return { naConversa: r.clientes.length, total: r.total };
      },
    },
    {
      nome: 'clientes por época (dezembro)',
      rodar: async (chave) => {
        const r = await ferramentas
          .montar({ vendedoraId: VENDEDORA_ID, codigoErp: CODIGO_ERP, chaveDaConversa: chave })
          .clientesPorEpoca({ mes: 12 });
        return { naConversa: r.clientes.length, total: r.total };
      },
    },
    {
      nome: 'melhores clientes',
      rodar: async (chave) => {
        const r = await ferramentas
          .montar({ vendedoraId: VENDEDORA_ID, codigoErp: CODIGO_ERP, chaveDaConversa: chave })
          .melhoresClientes({});
        return { naConversa: r.clientes.length, total: r.total };
      },
    },
    {
      nome: 'clientes por fidelidade',
      rodar: async (chave) => {
        const r = await ferramentas
          .montar({ vendedoraId: VENDEDORA_ID, codigoErp: CODIGO_ERP, chaveDaConversa: chave })
          .clientesPorFidelidade({});
        return { naConversa: r.linhas.length, total: r.total };
      },
    },
  ];

  console.log('');
  console.log('lista                           conversa   tabela    total   PDF');
  console.log('------------------------------- --------- -------- -------- ------');
  for (const caso of casos) {
    const chave = 'helena:' + caso.nome;
    const { naConversa, total } = await caso.rodar(chave);
    const t = ultimo.pegar(chave);
    const arq = await montar.execute(chave, 'PDF', { geradoPor: 'conferência' });
    if (arq && caso.nome === 'clientes por fidelidade') {
      writeFileSync(join(tmpdir(), arq.nome), arq.conteudo);
    }
    const linhas = t?.linhas.length ?? 0;
    console.log(
      caso.nome.padEnd(31) +
        String(naConversa).padStart(9) +
        String(linhas).padStart(9) +
        String(total).padStart(9) +
        (arq ? '  ' + (arq.conteudo.length / 1024).toFixed(0) + ' KB' : '  —') +
        (linhas === total ? '' : '   <- TABELA INCOMPLETA'),
    );
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
