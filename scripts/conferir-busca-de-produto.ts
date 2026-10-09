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
import { FotosDeProdutoService } from '../src/modules/atendimentos/application/fotos-de-produto.service';

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

  // O DICIONÁRIO — RF6 e RF7, 08/10/2026. O número ao lado é o que a base
  // devolvia ANTES de a sigla entrar, e por isso o "de" fica no rótulo: se
  // alguém desfizer a expansão, a conta volta para ele e isto falha.
  console.log('\nA palavra dela, a sigla do catálogo');
  for (const [termo, antes, esperado] of [
    ['diamante', 0, 268],
    ['brinco de diamante', 0, 74],
    ['esmeralda', 9, 45],
    ['ouro amarelo', 0, 164],
    ['ouro branco', 5, 193],
    ['riviera', 2, 23],
    ['safira', 0, 8],
    ['topázio', 0, 7],
    ['tanzanita', 0, 6],
  ] as const) {
    const achadas = await repo.contar({
      busca: termo,
      ativo: true,
      apenasDisponiveis: true,
    });
    conferir(
      `"${termo}"`,
      achadas === esperado,
      `${achadas} com saldo — de ${antes} para ${esperado} na medição de 08/10`,
    );
  }

  // A FRONTEIRA DE PALAVRA, que é o que separa a correção do estrago. Como
  // substring, `ON` casaria 4.682 peças (cONjunto, cONcha, ONÇA) e `OR`
  // casaria 1.025 (cOR, flOR, cORação). Este é o teste que falha EM SILÊNCIO
  // se alguém trocar o `~*` por ILIKE: a busca não quebra, só devolve o
  // catálogo inteiro.
  for (const [termo, teto] of [
    ['ouro negro', 100],
    ['ouro rosé', 300],
  ] as const) {
    const achadas = await repo.contar({ busca: termo, ativo: true });
    conferir(
      `"${termo}" não traz o catálogo inteiro`,
      achadas > 0 && achadas < teto,
      `${achadas} no catálogo (abaixo de ${teto}; por substring seriam milhares)`,
    );
  }

  // "quilate" sozinho casa quase tudo, e é justamente por isso que ele entra:
  // num E, palavra que casa tudo é inofensiva, mas palavra que não casa NADA
  // zera a busca inteira. Sem a tradução, isto devolvia zero.
  const comQuilate = await repo.contar({
    busca: 'anel 2 quilates',
    ativo: true,
    apenasDisponiveis: true,
    categoriaSugerida: 'JEWEL',
  });
  conferir(
    '"anel 2 quilates" não zera a busca',
    comQuilate > 0,
    `${comQuilate} anéis com quilatagem e saldo`,
  );

  // AS FOTOS, CONTRA A CONEXA DE VERDADE. O serviço é o mesmo que o canal
  // usa; o que se mede aqui é quanta foto existe, que é o que decide se a
  // resposta da agente sai com imagem ou com desculpa.
  console.log('\nAs fotos, pela Conexa');
  const fotos = new FotosDeProdutoService();
  const comSaldo = await repo.findAll({
    ativo: true,
    apenasDisponiveis: true,
    categoriaSugerida: 'JEWEL',
    precoAte: 20000,
    limit: 10,
  });
  const r = await fotos.buscar(
    comSaldo.map((p) => ({
      codigo: p.codigoErp ?? '',
      url: p.fotoUrl ?? null,
      legenda: p.descricaoEtiqueta ?? '',
    })),
  );
  conferir(
    'a tabela até 20 mil, como a gestora pede',
    r.fotos.every((f) => f.conteudo.length > 0),
    `${comSaldo.length} peças, ${r.tinhamUrl} com URL, ${r.fotos.length} com foto de verdade`,
  );

  // As três do relatório que a Cida imprime: estas TÊM foto, e são a prova
  // de que o caminho funciona quando o cadastro existe.
  const doRelatorio = await repo.findAll({ busca: 'AN22083 AN22150 AN25190', ativo: true, limit: 5 });
  const r2 = await fotos.buscar(
    doRelatorio.map((p) => ({
      codigo: p.codigoErp ?? '',
      url: p.fotoUrl ?? null,
      legenda: p.descricaoEtiqueta ?? '',
    })),
  );
  conferir(
    'as três do relatório do Safira',
    r2.fotos.length === doRelatorio.length && doRelatorio.length === 3,
    `${r2.fotos.length} de ${doRelatorio.length} vieram` +
      (r2.fotos.length
        ? ` (${r2.fotos.map((f) => (f.conteudo.length / 1024).toFixed(0) + ' KB').join(', ')})`
        : ''),
  );

  await ds.destroy();
  console.log(falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'));
  process.exit(falhou ? 1 : 0);
}

void main();
