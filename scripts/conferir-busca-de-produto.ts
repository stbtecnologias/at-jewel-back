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

  console.log('\nA tabela de preço que a gestora pediu');
  const ate20 = await repo.contar({
    ativo: true,
    apenasDisponiveis: true,
    precoAte: 20000,
  });
  const faixa = await repo.findAll({
    ativo: true,
    apenasDisponiveis: true,
    precoDe: 5000,
    precoAte: 20000,
    limit: 500,
  });
  conferir(
    'com saldo até 20 mil',
    ate20 > 0,
    `${ate20} peças (307 na medição de 07/10)`,
  );
  conferir(
    'faixa de 5 a 20 mil, e a ordem é do mais barato',
    faixa.every((p) => p.valorVenda >= 5000 && p.valorVenda <= 20000) &&
      faixa.every(
        (p, i) => i === 0 || faixa[i - 1].valorVenda <= p.valorVenda,
      ),
    `${faixa.length} peças, de ${faixa[0]?.valorVenda} a ${faixa[faixa.length - 1]?.valorVenda}`,
  );

  // A PÁGINA 2 É A PÁGINA 2 — a armadilha de 05/10, agora com preço, onde o
  // empate é regra e não exceção.
  console.log('\nPaginando sem repetir nem pular');
  const pagina = (deslocamento: number) =>
    repo.findAll({
      ativo: true,
      apenasDisponiveis: true,
      precoAte: 20000,
      limit: 20,
      deslocamento,
    });
  const p1 = await pagina(0);
  const p2 = await pagina(20);
  const p3 = await pagina(40);
  const ids = [...p1, ...p2, ...p3].map((p) => p.id);
  const inteiro = await repo.findAll({
    ativo: true,
    apenasDisponiveis: true,
    precoAte: 20000,
    limit: 60,
  });
  conferir(
    'três páginas de 20 sem repetir',
    new Set(ids).size === ids.length,
    `${ids.length} peças, ${new Set(ids).size} distintas`,
  );
  conferir(
    'e na mesma ordem da lista inteira',
    ids.join() === inteiro.map((p) => p.id).join(),
    ids.length === inteiro.length ? 'idênticas' : 'tamanhos diferentes',
  );

  await ds.destroy();
  console.log(falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'));
  process.exit(falhou ? 1 : 0);
}

void main();
