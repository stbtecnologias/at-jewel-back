import { ProcessarFotoCatalogoUseCase } from './processar-foto-catalogo.use-case';
import { SessaoCatalogoService } from '../sessao-catalogo.service';
import type { CatalogoAberto } from '../../../catalogos/domain/ports/repositories/catalogo-repository.port';

/**
 * O que se testa aqui e a LEITURA DA LEGENDA, e nao o caminho feliz inteiro.
 *
 * E onde mora a unica regra de verdade desta rodada, e onde um erro e caro: se
 * o codigo `BR26252` for lido como o numero de catalogo `26252`, a foto vai
 * para a colecao errada — ou para nenhuma — sem ninguem perceber, porque a
 * resposta no WhatsApp continua parecendo certa.
 */
describe('ProcessarFotoCatalogoUseCase — leitura da legenda', () => {
  const ABERTOS: CatalogoAberto[] = [
    { id: 'uuid-2', numero: '0002', nome: 'Catálogo Rosa Pink' },
    { id: 'uuid-3', numero: '0003', nome: 'Catálogo Inverno' },
  ];

  let useCase: ProcessarFotoCatalogoUseCase;

  // `lerLegenda` e privado de proposito — e detalhe do fluxo, nao contrato.
  // O teste alcança por indexacao, que e o preco de nao expor so para testar.
  function ler(texto: string) {
    return (
      useCase as unknown as {
        lerLegenda: (
          t: string,
          a: CatalogoAberto[],
        ) => { catalogo: CatalogoAberto | null; codigo: string | null; parcelas: number | null };
      }
    ).lerLegenda(texto, ABERTOS);
  }

  beforeEach(() => {
    useCase = new ProcessarFotoCatalogoUseCase(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new SessaoCatalogoService(),
    );
  });

  it('numero e codigo juntos — o caso que a gente pede que seja usado', () => {
    const r = ler('0002 BR26252');
    expect(r.catalogo?.numero).toBe('0002');
    expect(r.codigo).toBe('BR26252');
  });

  it('o codigo NAO e confundido com o numero do catalogo', () => {
    // Sem a extracao do codigo primeiro, o `26252` de dentro de BR26252 seria
    // lido como numero de catalogo.
    const r = ler('BR26252');
    expect(r.codigo).toBe('BR26252');
    expect(r.catalogo).toBeNull();
  });

  it('aceita o numero sem os zeros a esquerda e com cerquilha', () => {
    expect(ler('#2 CO26185').catalogo?.numero).toBe('0002');
    expect(ler('2').catalogo?.numero).toBe('0002');
  });

  it('reconhece pelo nome, sem acento e em minusculas', () => {
    expect(ler('catalogo inverno').catalogo?.numero).toBe('0003');
    expect(ler('ROSA PINK').catalogo?.numero).toBe('0002');
  });

  it('nome ambiguo nao decide sozinho — cai na pergunta', () => {
    // "catálogo" casa com os dois; melhor perguntar do que chutar.
    expect(ler('catalogo').catalogo).toBeNull();
  });

  it('le o parcelamento quando informado, e ignora o resto', () => {
    const r = ler('0003 CO26185 6x');
    expect(r.catalogo?.numero).toBe('0003');
    expect(r.codigo).toBe('CO26185');
    expect(r.parcelas).toBe(6);
  });

  it('sem parcelamento na legenda devolve nulo — quem decide o padrao e o fluxo', () => {
    expect(ler('0002 BR26252').parcelas).toBeNull();
  });

  it('legenda vazia nao inventa nada', () => {
    const r = ler('');
    expect(r.catalogo).toBeNull();
    expect(r.codigo).toBeNull();
    expect(r.parcelas).toBeNull();
  });

  it('numero de catalogo que nao esta aberto nao casa', () => {
    expect(ler('0099 BR26252').catalogo).toBeNull();
  });
});
