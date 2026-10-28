import { EntregarRelatorioUseCase } from './entregar-relatorio.use-case';
import { MontarMensagensUseCase } from './montar-mensagens.use-case';
import { UltimoRelatorioService } from './ultimo-relatorio.service';
import type { Relatorio } from '../domain/relatorio';

/**
 * ==========================================================================
 * A LISTA INTEIRA PASSOU A SER O PADRÃO — 28/10/2026.
 *
 * *"Por padrão toda lista ou consulta deve listar tudo. Se ela pedir 'traga
 * os últimos 10', aí você limita a quantidade — mas se não tiver, deve vir
 * tudo de uma vez no WhatsApp."* — Lucas, 27/10/2026.
 *
 * ERA UMA ESCOLHA, E VIROU O PADRÃO. Até aqui a lista inteira dependia de o
 * modelo oferecer e a pessoa responder — dois turnos para entregar o que já
 * estava pronto no primeiro. O teste dele, em 28/10, mostrou isso em
 * produção: 20 de 36 e *"quer a lista inteira aqui na conversa?"*.
 *
 * AGORA QUEM DECIDE É UMA SUBTRAÇÃO: a tabela tem a lista inteira, o texto da
 * conversa tem a página, e a diferença é o que a pessoa não viu. Se há
 * diferença, a lista sai — sem passar pelo modelo.
 *
 * Medido contra o banco no mesmo dia:
 *
 *   padrão, Ylka 2026           conversa  10 | tabela    38 -> LISTA, 1 msg
 *   "as últimas 5"              conversa   5 | tabela     5 -> nada
 *   padrão, Ylka desde 2023     conversa  10 | tabela   223 -> LISTA, 2 msgs
 *   padrão, AT JEWEL desde 2023 conversa  10 | tabela 1.110 -> ARQUIVO
 * ==========================================================================
 */

function tabela(linhas: number): Relatorio {
  return {
    titulo: 'Vendas da Ylka — 2026',
    posicao: 'Posição em 28/10/2026 12:00',
    colunas: [
      { chave: 'data', titulo: 'Data', peso: 1 },
      { chave: 'cliente', titulo: 'Cliente', peso: 2 },
      { chave: 'valor', titulo: 'Total', peso: 1 },
    ],
    linhas: Array.from({ length: linhas }, (_, i) => ({
      data: '11/08/2026',
      cliente: 'CLIENTE ' + i,
      valor: 'R$ 52.500,00',
    })),
  };
}

/** O texto que a ferramenta devolveu ao modelo, com N linhas de lista. */
const textoCom = (n: number) =>
  Array.from({ length: n }, (_, i) => `- linha ${i + 1}`).join(
    String.fromCharCode(10),
  );

function montar() {
  const ultimo = new UltimoRelatorioService();
  const mensagens = new MontarMensagensUseCase(ultimo);
  const arquivo = {
    execute: jest.fn().mockResolvedValue({
      conteudo: Buffer.from('%PDF-1.3'),
      mime: 'application/pdf',
      nome: 'vendas.pdf',
      legenda: 'Vendas',
    }),
  };
  const entregar = new EntregarRelatorioUseCase(arquivo as never, mensagens);
  return { ultimo, entregar, arquivo };
}

describe('a lista inteira por padrão', () => {
  /* ESTE É O TESTE. */
  it('a conversa mostrou 10 de 38 — as 38 saem sozinhas', async () => {
    const { ultimo, entregar } = montar();
    ultimo.guardar('gestao:ad-1', tabela(38));
    // O funil conta as linhas do texto da ferramenta.
    ultimo.guardarTexto('gestao:ad-1', 'Vendas', textoCom(10), {});

    expect(ultimo.quantasNaoForamMostradas('gestao:ad-1')).toBe(28);

    const e = await entregar.oQueFaltou('gestao:ad-1');

    expect(e?.tipo).toBe('LISTA');
    expect(e?.tipo === 'LISTA' && e.linhas).toBe(38);
  });

  it('ela pediu 5 e a tabela tem 5 — não há o que mandar', async () => {
    // O `quantas` corta a CONSULTA, não a frase: a tabela também fica com 5,
    // e aí a subtração dá zero sozinha. É o que faz o PDF seguinte levar as
    // cinco que ela pediu.
    const { ultimo, entregar } = montar();
    ultimo.guardar('gestao:ad-1', tabela(5));
    ultimo.guardarTexto('gestao:ad-1', 'Vendas', textoCom(5), {});

    expect(ultimo.quantasNaoForamMostradas('gestao:ad-1')).toBe(0);
    expect(await entregar.oQueFaltou('gestao:ad-1')).toBeNull();
  });

  it('a conversa mostrou tudo — também não há o que mandar', async () => {
    const { ultimo, entregar } = montar();
    ultimo.guardar('gestao:ad-1', tabela(7));
    ultimo.guardarTexto('gestao:ad-1', 'Vendas', textoCom(7), {});

    expect(await entregar.oQueFaltou('gestao:ad-1')).toBeNull();
  });

  it('lista grande demais para mensagem vira ARQUIVO sozinha', async () => {
    // As 1.110 vendas da AT JEWEL passariam de três mensagens. O RF-12 limita
    // 30 por destino/hora, e conta bloqueada não se desfaz.
    const { ultimo, entregar, arquivo } = montar();
    ultimo.guardar('gestao:ad-1', tabela(5000));
    ultimo.guardarTexto('gestao:ad-1', 'Vendas', textoCom(10), {});

    const e = await entregar.oQueFaltou('gestao:ad-1');

    expect(e?.tipo).toBe('ARQUIVO');
    // E o arquivo pedido é PDF, não a planilha: é o que se abre em qualquer
    // lugar.
    expect(arquivo.execute).toHaveBeenCalledWith(
      'gestao:ad-1',
      'PDF',
      undefined,
    );
  });

  /**
   * SEM TABELA RICA NÃO SE MANDA NADA, e isso é a guarda que evita a lista
   * duplicada.
   *
   * A tabela pobre do funil de texto É a conversa — ela nasce das linhas que
   * a pessoa acabou de ler. Mandá-la de volta repetiria o que está na tela.
   */
  it('tabela que veio do próprio texto não se repete', async () => {
    const { ultimo, entregar } = montar();
    // Sem `guardar` antes: só o caminho de texto.
    ultimo.guardarTexto('gestao:ad-1', 'Clientes', textoCom(12), {});

    expect(ultimo.quantasNaoForamMostradas('gestao:ad-1')).toBe(0);
    expect(await entregar.oQueFaltou('gestao:ad-1')).toBeNull();
  });

  it('sem ninguém contar a conversa, não se arrisca', async () => {
    // Tabela rica guardada e nenhum texto depois: não se sabe quantas a
    // pessoa viu. Mandar as 38 poderia duplicar; ficar quieto, não.
    const { ultimo, entregar } = montar();
    ultimo.guardar('gestao:ad-1', tabela(38));

    expect(ultimo.quantasNaoForamMostradas('gestao:ad-1')).toBe(0);
    expect(await entregar.oQueFaltou('gestao:ad-1')).toBeNull();
  });

  it('sem chave não há conversa, e nada acontece', async () => {
    const { entregar } = montar();

    expect(await entregar.oQueFaltou(null)).toBeNull();
    expect(await entregar.oQueFaltou(undefined)).toBeNull();
  });
});
