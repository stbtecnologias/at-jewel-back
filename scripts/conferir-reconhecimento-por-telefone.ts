/**
 * O RECONHECIMENTO POR TELEFONE, CONTRA O BANCO DE VERDADE — RF41, 20/10/2026.
 *
 * ==========================================================================
 * OS SPECS PROVAM A REGRA COM MOCK. ISTO PROVA QUE ELA ACHA GENTE.
 *
 * O defeito era invisivel no teste justamente porque o mock respondia: em
 * producao `clientes_perfil` tem 0 linhas e `clientes.telefone_1_hash` esta
 * preenchida em 774 de 1.110 — e o lookup olhava so a primeira. Mock nenhum
 * reproduz uma tabela vazia que ninguem esperava vazia.
 *
 * E a licao de 09/10, de novo: prova no repositorio e no teste nao vale se o
 * caminho de verdade nao for exercitado.
 * ==========================================================================
 *
 *   npx ts-node --transpile-only scripts/conferir-reconhecimento-por-telefone.ts
 *
 * SO LE. Nao escreve nada, nao apaga nada.
 *
 * NAO IMPRIME TELEFONE, NOME NEM HASH — so contagens e sim/nao. O numero
 * trafega em memoria porque e o que a funcao recebe; nada dele sai na tela.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BuscarClientePorWhatsappUseCase } from '../src/modules/clientes/application/use-cases/buscar-cliente-por-whatsapp.use-case';
import { CLIENTE_REPOSITORY } from '../src/modules/clientes/domain/ports/injection-tokens';
import type { IClienteRepository } from '../src/modules/clientes/domain/ports/repositories/cliente-repository.port';

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const vermelho = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const uc = app.get(BuscarClientePorWhatsappUseCase);
  const repo = app.get<IClienteRepository>(CLIENTE_REPOSITORY);
  const ds = app.get(DataSource);

  // CALA O LOG DE QUERY DO TYPEORM. O `.env` local liga `logging`, e cada
  // SELECT de cliente sai com as 20 colunas — o resultado da conferencia
  // ficava ilegivel no meio delas. Conferencia que ninguem consegue ler nao
  // confere nada.
  const mudo = () => undefined;
  (ds as unknown as { logger: Record<string, () => void> }).logger = {
    logQuery: mudo,
    logQueryError: mudo,
    logQuerySlow: mudo,
    logSchemaBuild: mudo,
    logMigration: mudo,
    log: mudo,
  };

  let falhou = false;
  const conferir = (rotulo: string, ok: boolean, detalhe: string) => {
    if (!ok) falhou = true;
    console.log(
      `  ${ok ? verde('ok  ') : vermelho('FALHOU')} ${rotulo} — ${detalhe}`,
    );
  };

  try {
    // ======================================================================
    // O TAMANHO DO PROBLEMA, medido agora e nao lembrado.
    // ======================================================================
    const [n] = await ds.query<
      { total: string; com_telefone: string; perfis: string }[]
    >(`select (select count(*) from clientes) total,
              (select count(telefone_1_hash) from clientes) com_telefone,
              (select count(*) from clientes_perfil) perfis`);
    console.log(
      `\nclientes: ${n.total} · com telefone_1_hash: ${n.com_telefone} · linhas em clientes_perfil: ${n.perfis}\n`,
    );

    const [amb] = await ds.query<{ numeros: string; clientes: string }[]>(
      `select count(*) numeros, coalesce(sum(n), 0) clientes from (
         select count(*) n from clientes
          where telefone_1_hash is not null
          group by telefone_1_hash having count(*) > 1) t`,
    );
    console.log(
      `telefones que servem a mais de um cliente: ${amb.numeros} (${amb.clientes} clientes)\n`,
    );

    // ======================================================================
    // UM CLIENTE DE TELEFONE EXCLUSIVO: TEM DE SER ACHADO.
    //
    // E o caso dos 728. Antes do RF41 todos eles davam `null`, e a conversa
    // deles tomava o galho do lead.
    // ======================================================================
    const [exclusivo] = await ds.query<{ id: string }[]>(
      `select id from clientes c
        where telefone_1_hash is not null
          and (select count(*) from clientes o
                where o.telefone_1_hash = c.telefone_1_hash) = 1
        order by criado_em limit 1`,
    );
    const cliente = exclusivo ? await repo.buscarPorId(exclusivo.id) : null;
    if (!cliente?.telefone1) {
      console.log(
        vermelho(
          'Nao achei cliente com telefone exclusivo e decifravel — nada a conferir.',
        ),
      );
    } else {
      console.log('Cliente de telefone exclusivo');
      const achado = await uc.execute(cliente.telefone1);
      conferir(
        'o reconhecimento acha, mesmo sem perfil',
        achado?.id === exclusivo.id,
        achado ? 'achou o mesmo id' : 'devolveu null',
      );
      conferir(
        'e ele mesmo nao tem linha em clientes_perfil',
        achado?.perfil == null,
        `perfil: ${achado?.perfil == null ? 'nenhum' : 'existe'}`,
      );

      // A VARIANTE, no caminho de verdade: o WhatsApp entrega com o 55 e o
      // cadastro do ERP guarda sem.
      const digitos = cliente.telefone1.replace(/\D/g, '');
      if (digitos.length === 11) {
        const comDdi = await uc.execute(`55${digitos}`);
        conferir(
          'acha tambem quando o numero chega COM DDI',
          comDdi?.id === exclusivo.id,
          comDdi ? 'achou' : 'devolveu null',
        );
      }
    }

    // ======================================================================
    // UM TELEFONE COMPARTILHADO: NAO PODE ESCOLHER NINGUEM.
    //
    // Sao 19 numeros, e um deles serve a oito clientes. `buscarPorTelefone1Hash`
    // devolveria o mais antigo — e a conversa iria para a pessoa errada sem
    // ninguem notar.
    // ======================================================================
    const compartilhados = await ds.query<{ id: string; n: string }[]>(
      `select c.id, (select count(*) from clientes o
                      where o.telefone_1_hash = c.telefone_1_hash) n
         from clientes c
        where c.telefone_1_hash is not null
          and (select count(*) from clientes o
                where o.telefone_1_hash = c.telefone_1_hash) > 1
        order by n desc limit 1`,
    );
    const dividido = compartilhados[0]
      ? await repo.buscarPorId(compartilhados[0].id)
      : null;
    if (dividido?.telefone1) {
      console.log(`\nTelefone dividido por ${compartilhados[0].n} clientes`);
      conferir(
        'devolve null em vez de adivinhar',
        (await uc.execute(dividido.telefone1)) === null,
        'ambiguidade respeitada',
      );
      conferir(
        'e a busca unitaria ESCOLHERIA — e por isso que ela nao serve aqui',
        (await repo.buscarPorTelefone1Hash(dividido.telefone1Hash!)) !== null,
        'o mais antigo, em silencio',
      );
    } else {
      console.log('\nSem telefone compartilhado decifravel nesta base.');
    }

    // ======================================================================
    // QUANTOS PASSARIAM A SER RECONHECIDOS — a conta que interessa a gestao.
    // ======================================================================
    const [ganho] = await ds.query<{ exclusivos: string }[]>(
      `select count(*) exclusivos from clientes c
        where telefone_1_hash is not null
          and (select count(*) from clientes o
                where o.telefone_1_hash = c.telefone_1_hash) = 1`,
    );
    console.log(
      `\nClientes que passam a ser reconhecidos pelo telefone: ${verde(ganho.exclusivos)}`,
    );
  } finally {
    await app.close();
  }

  console.log(
    falhou ? vermelho('\nAlguma coisa falhou.\n') : verde('\nTudo certo.\n'),
  );
  process.exit(falhou ? 1 : 0);
}

void main();
