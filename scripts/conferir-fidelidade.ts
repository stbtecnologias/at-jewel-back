/**
 * A FIDELIDADE DO CLIENTE, CONTRA O BANCO DE VERDADE — 09/10/2026.
 *
 * ==========================================================================
 * OS SPECS PROVAM A ESTRUTURA. ISTO PROVA O NÚMERO.
 *
 * E aqui o número é o requisito: a gestora pediu "a lista de clientes Ouro",
 * o painel já mostrava 48 no cartão, e a agente passa a responder a mesma
 * pergunta. Se os dois caminhos derem números diferentes, a palavra "Ouro"
 * perde sentido — então este arquivo compara os dois contra a mesma base.
 *
 * O `ClienteRepository` de verdade roda contra o banco de verdade. Nenhuma
 * consulta é reescrita aqui, e NENHUM NOME é impresso: a lista tem PII e o
 * que interessa conferir é a contagem.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-fidelidade.ts
 *
 * Não escreve nada. Só SELECT.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ClienteRepository } from '../src/modules/clientes/infrastructure/database/typeorm/repositories/cliente.repository';
import { ClienteOrmEntity } from '../src/modules/clientes/infrastructure/database/typeorm/entities/cliente.orm-entity';
import { ClientePerfilOrmEntity } from '../src/modules/clientes/infrastructure/database/typeorm/entities/cliente-perfil.orm-entity';
import {
  MINIMO_OURO,
  MINIMO_PRATA,
  nivelPorCompras,
} from '../src/shared/clientes/fidelidade';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [ClienteOrmEntity, ClientePerfilOrmEntity],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();

  const repo = new ClienteRepository(ds.getRepository(ClienteOrmEntity), ds);
  let falhou = false;
  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(`  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`);
  };

  console.log(`\nOs cortes em uso: Prata a partir de ${MINIMO_PRATA}, Ouro a partir de ${MINIMO_OURO}`);

  // =========================================================================
  // O CARTÃO DO PAINEL E A LISTA DA AGENTE TÊM DE DAR O MESMO NÚMERO.
  //
  // São dois caminhos diferentes — `distribuicaoTiers` agrega e
  // `clientesPorFidelidade` lista — e desde hoje os dois geram o CASE a
  // partir das mesmas constantes. Se alguém reescrever um dos dois à mão,
  // isto falha.
  // =========================================================================
  console.log('\nO painel e a agente, sobre a mesma base');
  const tiers = await repo.distribuicaoTiers();
  const doPainel = new Map(tiers.map((t) => [t.tier, t.total]));

  for (const nivel of ['Ouro', 'Prata', 'Bronze', 'Sem compras'] as const) {
    const lista = await repo.clientesPorFidelidade(
      { tipo: 'LOJA' },
      { nivel, limite: 1 },
    );
    const noCartao = doPainel.get(nivel) ?? 0;
    conferir(
      `"${nivel}"`,
      lista.total === noCartao,
      `painel ${noCartao}, agente ${lista.total}` +
        (lista.semVendedora ? ` — ${lista.semVendedora} sem vendedora` : ''),
    );
  }

  // =========================================================================
  // O NÍVEL DE CADA LINHA BATE COM A REGRA EM TYPESCRIPT?
  //
  // O SQL e a função `nivelPorCompras` são gerados do mesmo arquivo, mas de
  // formas diferentes. Esta é a conferência que pega uma divergência entre as
  // duas — por exemplo um `>=` que virou `>` só num dos lados.
  // =========================================================================
  console.log('\nA regra em SQL e a regra em TypeScript');
  const amostra = await repo.clientesPorFidelidade({ tipo: 'LOJA' }, { limite: 300 });
  const divergentes = amostra.clientes.filter(
    (c) => c.nivel !== nivelPorCompras(c.compras),
  );
  conferir(
    'cada linha tem o nível que a função daria',
    divergentes.length === 0,
    divergentes.length === 0
      ? `${amostra.clientes.length} linhas conferidas, nenhuma divergente`
      : `${divergentes.length} divergentes — ex.: ${divergentes[0].compras} compras ` +
        `vieram "${divergentes[0].nivel}" e a função diz "${nivelPorCompras(divergentes[0].compras)}"`,
  );

  // A ORDEM: do mais fiel para o menos, e nunca ao contrário.
  const ordens = amostra.clientes.map((c) => c.compras);
  conferir(
    'a lista vem do mais fiel para o menos',
    ordens.every((n, i) => i === 0 || ordens[i - 1] >= n),
    `de ${ordens[0]} a ${ordens[ordens.length - 1]} compras`,
  );

  // =========================================================================
  // PAGINAR SEM REPETIR NEM PULAR — a armadilha de 05/10, e aqui ela é pior:
  // o empate em "6 compras" é regra, não exceção. Sem o desempate por nome a
  // página 2 traz gente da página 1.
  // =========================================================================
  console.log('\nPaginando sem repetir nem pular');
  const p = (deslocamento: number) =>
    repo.clientesPorFidelidade({ tipo: 'LOJA' }, { limite: 15, deslocamento });
  const [p1, p2, p3] = await Promise.all([p(0), p(15), p(30)]);
  const ids = [...p1.clientes, ...p2.clientes, ...p3.clientes].map((c) => c.id);
  const inteiro = await repo.clientesPorFidelidade({ tipo: 'LOJA' }, { limite: 45 });
  conferir(
    'três páginas de 15 sem repetir',
    new Set(ids).size === ids.length,
    `${ids.length} linhas, ${new Set(ids).size} distintas`,
  );
  conferir(
    'e na mesma ordem da lista inteira',
    ids.join() === inteiro.clientes.map((c) => c.id).join(),
    ids.length === inteiro.clientes.length ? 'idênticas' : 'tamanhos diferentes',
  );

  // =========================================================================
  // O ADORMECIDO. É o recorte que faz a gestão AGIR em vez de só saber, e
  // tem de excluir quem nunca comprou: "não compra desde maio" não descreve
  // quem nunca comprou nada.
  // =========================================================================
  console.log('\nO cliente Ouro que parou de comprar');
  const seisMeses = new Date();
  seisMeses.setMonth(seisMeses.getMonth() - 6);
  const ouro = await repo.clientesPorFidelidade({ tipo: 'LOJA' }, { nivel: 'Ouro', limite: 100 });
  const adormecidos = await repo.clientesPorFidelidade(
    { tipo: 'LOJA' },
    { nivel: 'Ouro', semCompraDesde: seisMeses, limite: 100 },
  );
  conferir(
    'os adormecidos são um subconjunto dos Ouro',
    adormecidos.total <= ouro.total && adormecidos.total > 0,
    `${adormecidos.total} de ${ouro.total} Ouro não compram há 6 meses`,
  );
  conferir(
    'e todos têm data de última compra',
    adormecidos.clientes.every((c) => c.ultimaCompra !== null),
    `${adormecidos.clientes.filter((c) => c.ultimaCompra === null).length} sem data`,
  );
  const semCompras = await repo.clientesPorFidelidade(
    { tipo: 'LOJA' },
    { nivel: 'Sem compras', semCompraDesde: seisMeses, limite: 10 },
  );
  conferir(
    'quem nunca comprou NÃO entra em "não compra desde"',
    semCompras.total === 0,
    `${semCompras.total} linhas (tem de ser zero)`,
  );

  // =========================================================================
  // O ESCOPO. A soma por vendedora NÃO fecha com a loja, e é por isso que
  // `semVendedora` existe: medido em 09/10, 19 dos 48 Ouro não têm dona.
  // =========================================================================
  console.log('\nA carteira, e o que ela não alcança');
  const codigos = await ds.query<{ codigo_erp: string }[]>(
    `SELECT DISTINCT c.vendedora_codigo_erp AS codigo_erp
     FROM clientes c WHERE c.vendedora_codigo_erp IS NOT NULL AND c.ativo`,
  );
  let somaDasCarteiras = 0;
  for (const { codigo_erp } of codigos) {
    const r = await repo.clientesPorFidelidade(
      { tipo: 'CARTEIRA', vendedoraCodigoErp: codigo_erp },
      { nivel: 'Ouro', limite: 1 },
    );
    somaDasCarteiras += r.total;
  }
  conferir(
    'a soma das carteiras + os sem dona = a loja',
    somaDasCarteiras + ouro.semVendedora === ouro.total,
    `${somaDasCarteiras} nas carteiras + ${ouro.semVendedora} sem dona = ${ouro.total} ` +
      `(a loja tem ${ouro.total})`,
  );
  conferir(
    'a carteira NUNCA devolve a loja inteira',
    codigos.length === 0 || somaDasCarteiras < ouro.total,
    `${codigos.length} vendedoras com cliente, maior carteira < ${ouro.total}`,
  );

  // E o valor: líquido, abatendo devolução. Um cliente que devolveu tudo não
  // pode aparecer com o valor cheio.
  console.log('\nO valor é líquido');
  const comValor = ouro.clientes.filter((c) => c.valorLiquido > 0);
  const bruto = await ds.query<{ bruto: string }[]>(
    `SELECT COALESCE(SUM(m.valor), 0) AS bruto FROM movimentacoes m WHERE m.saida AND m.ativo`,
  );
  const liquido = await ds.query<{ liquido: string }[]>(
    `SELECT COALESCE(SUM(m.valor) FILTER (WHERE m.saida AND m.ativo), 0)
          - COALESCE(SUM(m.valor) FILTER (WHERE m.entrada AND m.ativo), 0) AS liquido
     FROM movimentacoes m`,
  );
  conferir(
    'a base tem devolução, então líquido < bruto',
    Number(liquido[0].liquido) < Number(bruto[0].bruto),
    `bruto ${Math.round(Number(bruto[0].bruto))}, líquido ${Math.round(Number(liquido[0].liquido))}`,
  );
  conferir(
    'e as linhas Ouro trazem valor',
    comValor.length > 0,
    `${comValor.length} de ${ouro.clientes.length} com valor positivo`,
  );

  await ds.destroy();
  console.log(falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'));
  process.exit(falhou ? 1 : 0);
}

void main();
