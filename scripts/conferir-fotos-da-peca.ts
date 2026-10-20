/**
 * AS FOTOS DA PEÇA, CONTRA O BANCO DE VERDADE — RF33, 20/10/2026.
 *
 * ==========================================================================
 * OS SPECS PROVAM O CONTORNO. ISTO PROVA AS GARANTIAS QUE SÃO DO BANCO.
 *
 * Uma capa por peça e a mesma imagem não repetida na mesma peça não são `if`
 * do serviço: são os índices `idx_produto_fotos_uma_capa` e
 * `idx_produto_fotos_sem_repetir`, da migração 74. Um mock não os reproduz —
 * reproduziria a minha ideia deles.
 *
 * E é a lição de 09/10: prova no repositório e no teste não vale se o caminho
 * de verdade não for exercitado.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-fotos-da-peca.ts
 *
 * ESCREVE, e limpa tudo no fim — inclusive os arquivos no armazenamento.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FotosDaPecaUseCase } from '../src/modules/produtos/application/use-cases/fotos-da-peca.use-case';
import { PRODUTO_FOTO_REPOSITORY } from '../src/modules/erp/domain/ports/injection-tokens';
import { ARMAZENAMENTO } from '../src/modules/catalogos/domain/ports/injection-tokens';
import type { IProdutoFotoRepository } from '../src/modules/erp/domain/ports/repositories/produto-foto-repository.port';
import { DataSource } from 'typeorm';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

const imagem = (nome: string) =>
  ({
    buffer: Buffer.from(`fake-jpeg-${nome}`),
    mimetype: 'image/jpeg',
    originalname: nome,
    size: 20,
  }) as never;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const uc = app.get(FotosDaPecaUseCase);
  const repo = app.get<IProdutoFotoRepository>(PRODUTO_FOTO_REPOSITORY);
  const ds = app.get(DataSource);

  let falhou = false;
  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(`  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`);
  };

  // `<> ''` E NAO SO `is not null` — a base tem peca com codigo VAZIO, e foi
  // exatamente ela que esta conferencia pegou da primeira vez.
  const [a, b] = await ds.query<{ id: string; codigo_erp: string }[]>(
    `select id, codigo_erp from produtos
      where codigo_erp is not null and btrim(codigo_erp) <> ''
        and not exists (select 1 from produto_fotos f where f.produto_id = produtos.id)
      order by codigo_erp limit 2`,
  );
  console.log(`\nPeças de teste: ${a.codigo_erp} e ${b.codigo_erp}\n`);

  try {
    console.log('Mandar três fotos');
    const envio = await uc.adicionar(
      a.id,
      [imagem('um.jpg'), imagem('dois.jpg'), imagem('tres.jpg')],
      'Conferencia',
      'PAINEL',
    );
    conferir('guardou as três', envio.guardadas.length === 3, `${envio.guardadas.length}`);
    conferir(
      'UMA capa, e é a primeira',
      envio.guardadas.filter((f) => f.capa).length === 1 && envio.guardadas[0].capa,
      envio.guardadas.map((f) => (f.capa ? 'CAPA' : '-')).join(' '),
    );
    conferir(
      'posições em sequência',
      envio.guardadas.map((f) => f.posicao).join(',') === '0,1,2',
      envio.guardadas.map((f) => f.posicao).join(','),
    );

    console.log('\nTrocar a capa');
    const depois = await uc.definirCapa(a.id, envio.guardadas[2].id);
    conferir(
      'continua havendo UMA capa',
      depois.filter((f) => f.capa).length === 1,
      `${depois.filter((f) => f.capa).length}`,
    );
    conferir('e é a que eu escolhi', depois[0].id === envio.guardadas[2].id, depois[0].id);

    console.log('\nApagar a capa');
    const sobraram = await uc.excluir(a.id, envio.guardadas[2].id);
    conferir('restaram duas', sobraram.length === 2, `${sobraram.length}`);
    conferir(
      'e a peça NÃO ficou sem capa',
      sobraram.filter((f) => f.capa).length === 1,
      sobraram.map((f) => (f.capa ? 'CAPA' : '-')).join(' '),
    );

    console.log('\nA MESMA imagem em outra peça — o RF34');
    const chave = (await repo.listar(a.id))[0].arquivoId;
    await repo.adicionar({
      produtoId: b.id,
      arquivoId: chave,
      mime: 'image/jpeg',
      bytes: 20,
      origem: 'PAINEL',
      enviadoPor: 'Conferencia',
    });
    conferir('a segunda peça aceitou a mesma chave', (await repo.contar(b.id)) === 1, chave);

    const naPeca = (await repo.listar(a.id)).find((f) => f.arquivoId === chave)!;
    await uc.excluir(a.id, naPeca.id);
    const arq = app.get<{ ler: (c: string) => Promise<unknown> }>(ARMAZENAMENTO);
    conferir(
      'e o ARQUIVO sobreviveu, porque a outra ainda o usa',
      (await arq.ler(chave)) !== null,
      chave,
    );

    console.log('\nO que a peça recusa');
    try {
      await repo.adicionar({
        produtoId: b.id,
        arquivoId: chave,
        mime: 'image/jpeg',
        bytes: 20,
        origem: 'PAINEL',
        enviadoPor: 'Conferencia',
      });
      conferir('a mesma imagem duas vezes na mesma peça', false, 'PASSOU, e não devia');
    } catch (e) {
      conferir(
        'a mesma imagem duas vezes na mesma peça',
        /sem_repetir/.test((e as Error).message),
        'recusada pelo índice',
      );
    }
  } finally {
    // LIMPA TUDO: as linhas e os arquivos. Conferência que suja a base vira
    // ruído na próxima medição.
    for (const peca of [a.id, b.id]) {
      for (const f of await repo.listar(peca)) {
        await uc.excluir(peca, f.id).catch(() => undefined);
      }
    }
    const resto = await ds.query<{ n: string }[]>(
      `select count(*) n from produto_fotos where enviado_por = 'Conferencia'`,
    );
    console.log(`\nLimpeza: sobraram ${resto[0].n} linhas (tem de ser 0)`);
    await app.close();
  }

  console.log(falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'));
  process.exit(falhou ? 1 : 0);
}

void main();
