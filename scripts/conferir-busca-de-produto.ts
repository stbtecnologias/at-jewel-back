/**
 * A BUSCA DE PRODUTO, CONTRA O BANCO DE VERDADE — 07/10/2026.
 *
 * ==========================================================================
 * OS SPECS PROVAM A ESTRUTURA. ISTO PROVA O NÚMERO.
 *
 * O `so-o-disponivel.spec.ts` garante que o filtro de saldo fica dentro do
 * ramo das palavras e que o código passa por fora. Mas nenhum spec sabe
 * quantas peças sobram de verdade — e o pedido da reunião de 06/10 era
 * exatamente sobre quantidade: "a consulta retorna milhares de itens sem
 * estoque".
 *
 * Aqui o `ProdutoRepository` de verdade roda contra o banco de verdade.
 * Nenhuma consulta é reescrita neste arquivo.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-busca-de-produto.ts
 *
 * Não escreve nada. Só SELECT.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ProdutoOrmEntity } from '../src/modules/erp/infrastructure/database/typeorm/entities/produto.orm-entity';
import { ProdutoRepository } from '../src/modules/erp/infrastructure/database/typeorm/repositories/produto.repository';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [ProdutoOrmEntity],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();

  const repo = new ProdutoRepository(ds.getRepository(ProdutoOrmEntity));
  let falhou = false;

  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(`  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`);
  };

  // O teto some aqui de propósito: o que interessa é QUANTAS existem.
  const buscar = (busca: string, apenasDisponiveis: boolean) =>
    repo.findAll({ busca, ativo: true, apenasDisponiveis, limit: 500 });

  console.log('\nA busca por palavras');
  for (const termo of ['esmeralda', 'anel ouro', 'brinco de diamante']) {
    const todas = await buscar(termo, false);
    const soDisponiveis = await buscar(termo, true);
    const semSaldo = soDisponiveis.filter((p) => p.estoqueAtual <= 0);
    conferir(
      `"${termo}"`,
      semSaldo.length === 0 && soDisponiveis.length <= todas.length,
      `${todas.length} achadas, ${soDisponiveis.length} com saldo` +
        (semSaldo.length ? ` — e ${semSaldo.length} ZERADAS passaram` : ''),
    );
  }

  console.log('\nO código exato, que ignora o filtro');
  for (const frase of [
    'AN24084',
    'An24084 me dá a descrição desse produto',
    'qual o preço do an24084',
  ]) {
    const achados = await buscar(frase, true);
    const peca = achados.find((p) => p.codigoErp?.toUpperCase() === 'AN24084');
    conferir(
      `"${frase}"`,
      peca !== undefined,
      peca
        ? `achou ${peca.codigoErp}, saldo ${peca.estoqueAtual}`
        : 'NÃO achou a peça',
    );
  }

  console.log('\nO catálogo inteiro');
  const ativos = await repo.findAll({ ativo: true, limit: 10000 });
  const disponiveis = await repo.findAll({
    ativo: true,
    apenasDisponiveis: true,
    limit: 10000,
  });
  conferir(
    'ativos x com saldo',
    disponiveis.length > 0 && disponiveis.length < ativos.length,
    `${ativos.length} ativos, ${disponiveis.length} com saldo`,
  );
  conferir(
    'nenhuma zerada na lista de disponíveis',
    disponiveis.every((p) => p.estoqueAtual > 0),
    `${disponiveis.filter((p) => p.estoqueAtual <= 0).length} zeradas`,
  );

  // AS DUAS PERGUNTAS QUE ERRARAM EM 07/10, agora com os números em volta.
  console.log('\nO que a agente passa a ouvir');
  for (const termo of ['esmeralda', 'brinco de diamante']) {
    const comSaldo = await repo.contar({
      busca: termo,
      ativo: true,
      apenasDisponiveis: true,
    });
    const noCatalogo = await repo.contar({ busca: termo, ativo: true });
    conferir(
      `"${termo}"`,
      noCatalogo >= comSaldo,
      `${comSaldo} disponíveis, ${noCatalogo - comSaldo} sem estoque ` +
        `(${noCatalogo} no catálogo)`,
    );
  }

  console.log('\nO padrão joia, e o que ele esconde');
  for (const termo of ['esmeralda', 'anel', 'vaso']) {
    const joia = await repo.contar({
      busca: termo,
      ativo: true,
      apenasDisponiveis: true,
      categoriaSugerida: 'JEWEL',
    });
    const tudo = await repo.contar({
      busca: termo,
      ativo: true,
      apenasDisponiveis: true,
    });
    conferir(
      `"${termo}" com saldo`,
      tudo >= joia,
      `${joia} joias, ${tudo - joia} em outras categorias`,
    );
  }

  // Um cilindro de decoração, para provar que o código exato fura o padrão.
  const porCodigo = await repo.findAll({
    busca: 'me dá a descrição do C795VES',
    ativo: true,
    apenasDisponiveis: true,
    categoriaSugerida: 'JEWEL',
    limit: 10,
  });
  const cilindro = porCodigo.find((p) => p.codigoErp === 'C795VES');
  conferir(
    'código de peça HOME com o padrão JEWEL ligado',
    cilindro !== undefined,
    cilindro ? `achou ${cilindro.codigoErp} (${cilindro.categoria})` : 'NÃO achou',
  );

  await ds.destroy();
  console.log(falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'));
  process.exit(falhou ? 1 : 0);
}

void main();
