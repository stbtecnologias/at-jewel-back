import type { ConfigService } from '@nestjs/config';
import { SessoesDaCasaService } from './sessoes-da-casa.service';

/**
 * QUAL NUMERO E DE QUEM — a peca de onde tudo o mais depende.
 *
 * ==========================================================================
 * O TESTE MAIS IMPORTANTE DESTE ARQUIVO E O PRIMEIRO: sem
 * `WAHA_SESSION_ELENA`, `separadas` e falso e NADA MUDA.
 *
 * O codigo dos dois numeros sobe antes de o segundo chip existir. Se
 * `separadas` fosse verdadeiro por engano, a primeira vendedora a escrever
 * depois do deploy ouviria "me chama no outro numero" apontando para um chip
 * que ninguem conectou — e o canal dela estaria morto ate alguem perceber.
 * ==========================================================================
 *
 * O segundo em importancia e a lista de permissao: sessao de vendedora, de
 * teste ou criada na mao NAO e da casa. O `atwpp` aprendeu isso do jeito ruim
 * em 09/09/2026, quando "qualquer outra sessao -> Anastasia" fez a IA
 * responder a uma cliente pelo numero PESSOAL de uma vendedora.
 */
describe('SessoesDaCasaService', () => {
  const comEnv = (env: Record<string, string | undefined>) =>
    new SessoesDaCasaService({
      get: (k: string) => env[k],
    } as unknown as ConfigService);

  describe('um numero so — como producao vive ate o segundo chip', () => {
    const service = comEnv({ WAHA_SESSION: 'default' });

    it('nao esta separada', () => {
      expect(service.separadas).toBe(false);
      expect(service.elena).toBeNull();
    });

    it('lista uma linha so para a tela de Conexoes', () => {
      expect(service.todas).toEqual(['default']);
    });

    it('a Elena fala pela sessao unica — senao o aviso dela sairia por uma sessao inexistente', () => {
      expect(service.sessaoDe('ELENA')).toBe('default');
      expect(service.sessaoDe('ANASTASIA')).toBe('default');
    });

    it('o rotulo continua sendo o de sempre', () => {
      expect(service.rotuloDe('default')).toBe('Loja (Anastasia)');
    });
  });

  describe('dois numeros', () => {
    const service = comEnv({
      WAHA_SESSION: 'default',
      WAHA_SESSION_ELENA: 'elena',
    });

    it('esta separada', () => {
      expect(service.separadas).toBe(true);
      expect(service.elena).toBe('elena');
    });

    it('reconhece de quem e cada sessao', () => {
      expect(service.agenteDa('default')).toBe('ANASTASIA');
      expect(service.agenteDa('elena')).toBe('ELENA');
    });

    it('cada agente fala pelo seu', () => {
      expect(service.sessaoDe('ANASTASIA')).toBe('default');
      expect(service.sessaoDe('ELENA')).toBe('elena');
    });

    it('os rotulos dizem quem atende o que', () => {
      expect(service.rotuloDe('default')).toBe('Anastasia (gestão)');
      expect(service.rotuloDe('elena')).toBe('Elena (vendedoras e catálogo)');
    });

    it('a ordem da tela e Anastasia primeiro', () => {
      expect(service.todas).toEqual(['default', 'elena']);
    });
  });

  /*
   * LISTA DE PERMISSAO, e nao "e diferente da loja?". O que nao for
   * reconhecido cai em `null`, que e o unico valor seguro — quem recebe
   * `null` registra e cala.
   */
  describe('o que NAO e da casa', () => {
    const service = comEnv({
      WAHA_SESSION: 'default',
      WAHA_SESSION_ELENA: 'elena',
    });

    it.each([
      ['vend-65f69487-85a1-4a77-800e-4b6d386ac7e1', 'sessao de vendedora'],
      ['teste-2a-sessao', 'sessao de teste'],
      ['', 'vazio'],
      ['DEFAULT', 'so muda a caixa'],
      ['default2', 'comeca igual'],
    ])('%s (%s) nao e da casa', (sessao) => {
      expect(service.agenteDa(sessao)).toBeNull();
      expect(service.ehDaCasa(sessao)).toBe(false);
    });
  });

  /*
   * Apontar as duas para a MESMA sessao nao e separacao — e o mesmo numero
   * com dois nomes. Fingir que ha dois seria pior que ignorar: a vendedora
   * ouviria "me chama no outro numero" no proprio numero certo, sem saida.
   */
  it('as duas na mesma sessao contam como uma so', () => {
    const service = comEnv({
      WAHA_SESSION: 'default',
      WAHA_SESSION_ELENA: 'default',
    });

    expect(service.separadas).toBe(false);
    expect(service.todas).toEqual(['default']);
    expect(service.agenteDa('default')).toBe('ANASTASIA');
  });

  it('sem env nenhum, a sessao e "default" — como o WAHA nomeia a primeira', () => {
    expect(comEnv({}).anastasia).toBe('default');
  });

  it('espaco em volta nao cria uma sessao diferente', () => {
    const service = comEnv({
      WAHA_SESSION: '  default  ',
      WAHA_SESSION_ELENA: ' elena ',
    });

    expect(service.anastasia).toBe('default');
    expect(service.elena).toBe('elena');
  });
});
