import { MemoriaConversaService } from './memoria-conversa.service';

/**
 * A memoria de conversa do canal interno.
 *
 * O TESTE QUE MAIS IMPORTA e o do isolamento entre chaves. Se duas pessoas
 * dividissem memoria, uma receberia a conversa da outra — e num canal onde a
 * vendedora so pode ver o que e dela, isso nao seria confusao, seria vazamento.
 * Os demais protegem o teto e o vencimento, que existem para a memoria nao
 * crescer sem fim nem responder com contexto velho.
 */
describe('MemoriaConversaService', () => {
  let memoria: MemoriaConversaService;

  beforeEach(() => {
    memoria = new MemoriaConversaService();
    jest.useRealTimers();
  });

  it('conversa nova comeca vazia', () => {
    expect(memoria.carregar('vendedora:vd-1')).toEqual([]);
  });

  it('guarda o par pergunta/resposta na ordem', () => {
    memoria.registrar('vendedora:vd-1', 'minha agenda?', 'Helena às 10h.');

    expect(memoria.carregar('vendedora:vd-1')).toEqual([
      { role: 'user', content: 'minha agenda?' },
      { role: 'assistant', content: 'Helena às 10h.' },
    ]);
  });

  it('DUAS PESSOAS NAO SE ENXERGAM — o teste de escopo', () => {
    memoria.registrar('vendedora:vd-1', 'minha agenda?', 'Helena às 10h.');
    memoria.registrar('vendedora:vd-2', 'e a minha?', 'Nada hoje.');

    const daPrimeira = memoria.carregar('vendedora:vd-1');
    expect(daPrimeira).toHaveLength(2);
    expect(JSON.stringify(daPrimeira)).not.toContain('Nada hoje');
  });

  it('vendedora e gestao com o mesmo id sao conversas diferentes', () => {
    // A chave carrega o CANAL, nao so o id. Sem isso, alguem que fosse os dois
    // veria a conversa de um lado no outro.
    memoria.registrar(MemoriaConversaService.chaveVendedora('x'), 'a', 'b');
    memoria.registrar(MemoriaConversaService.chaveGestao('x'), 'c', 'd');

    expect(memoria.carregar(MemoriaConversaService.chaveVendedora('x'))).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]);
    expect(memoria.carregar(MemoriaConversaService.chaveGestao('x'))).toEqual([
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ]);
  });

  it('corta no teto, mantendo os turnos mais RECENTES', () => {
    for (let i = 1; i <= 10; i++) {
      memoria.registrar('vendedora:vd-1', `pergunta ${i}`, `resposta ${i}`);
    }

    const turnos = memoria.carregar('vendedora:vd-1');
    expect(turnos).toHaveLength(12); // MAX_TURNOS
    expect(turnos[0]).toEqual({ role: 'user', content: 'pergunta 5' });
    expect(turnos[11]).toEqual({ role: 'assistant', content: 'resposta 10' });
  });

  it('o corte mantem a alternancia — nunca comeca com uma resposta solta', () => {
    // A API recusa historico fora da ordem user/assistant. Cortar em numero
    // impar deixaria um `assistant` na frente.
    for (let i = 1; i <= 20; i++) {
      memoria.registrar('vendedora:vd-1', `p${i}`, `r${i}`);
    }

    const turnos = memoria.carregar('vendedora:vd-1');
    turnos.forEach((t, i) => {
      expect(t.role).toBe(i % 2 === 0 ? 'user' : 'assistant');
    });
  });

  it('esquecer zera a conversa daquela pessoa so', () => {
    memoria.registrar('vendedora:vd-1', 'a', 'b');
    memoria.registrar('vendedora:vd-2', 'c', 'd');

    memoria.esquecer('vendedora:vd-1');

    expect(memoria.carregar('vendedora:vd-1')).toEqual([]);
    expect(memoria.carregar('vendedora:vd-2')).toHaveLength(2);
  });

  it('vence por inatividade e volta vazia', () => {
    memoria.registrar('vendedora:vd-1', 'a', 'b');

    // Duas horas e um minuto depois.
    const depois = Date.now() + 2 * 60 * 60_000 + 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(depois);

    expect(memoria.carregar('vendedora:vd-1')).toEqual([]);

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('mensagem depois do vencimento comeca conversa nova, sem o passado', () => {
    memoria.registrar('vendedora:vd-1', 'antiga', 'antiga');

    const depois = Date.now() + 3 * 60 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(depois);
    memoria.registrar('vendedora:vd-1', 'nova', 'nova');
    const turnos = memoria.carregar('vendedora:vd-1');
    jest.spyOn(Date, 'now').mockRestore();

    expect(turnos).toHaveLength(2);
    expect(turnos[0].content).toBe('nova');
  });

  it('respeita o teto de conversas, descartando a menos recente', () => {
    // 200 e o MAX_CONVERSAS; a 201a entra e a mais antiga sai.
    for (let i = 0; i < 200; i++) {
      memoria.registrar(`vendedora:v${i}`, 'a', 'b');
    }
    memoria.registrar('vendedora:nova', 'a', 'b');

    expect(memoria.carregar('vendedora:v0')).toEqual([]);
    expect(memoria.carregar('vendedora:nova')).toHaveLength(2);
  });
});
