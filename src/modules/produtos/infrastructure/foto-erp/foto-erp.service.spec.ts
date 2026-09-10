import { ConfigService } from '@nestjs/config';
import { FotoErpService } from './foto-erp.service';

function respostaOk(bytes = 'imagem') {
  return {
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => Buffer.from(bytes),
  };
}

function servico(): { alvo: FotoErpService; fetch: jest.Mock } {
  const config = {
    get: (chave: string) =>
      chave === 'ERP_FOTOS_BASE_URL' ? 'http://origem/fotos' : undefined,
  } as unknown as ConfigService;
  return { alvo: new FotoErpService(config), fetch: global.fetch as jest.Mock };
}

describe('FotoErpService', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(respostaOk()) as unknown as typeof fetch;
  });

  it('monta a URL a partir do codigo', async () => {
    const { alvo, fetch } = servico();
    await alvo.buscar('CO26185');

    expect(fetch).toHaveBeenCalledWith('http://origem/fotos/CO26185.png', expect.anything());
  });

  it('normaliza o codigo — minuscula e espaco nao viram outra entrada', async () => {
    const { alvo, fetch } = servico();
    await alvo.buscar(' co26185 ');
    await alvo.buscar('CO26185');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('nao volta na origem quando ja buscou a peca', async () => {
    const { alvo, fetch } = servico();
    await alvo.buscar('CO26185');
    await alvo.buscar('CO26185');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('LEMBRA DA AUSENCIA: 404 nao e repetido a cada renderizacao', async () => {
    const { alvo, fetch } = servico();
    fetch.mockResolvedValue({ ok: false, headers: { get: () => null } });

    await expect(alvo.buscar('SEM_FOTO')).resolves.toBeNull();
    await expect(alvo.buscar('SEM_FOTO')).resolves.toBeNull();

    // 448 pecas sem imagem na origem — sem esta linha, cada uma bate la a cada
    // vez que a tabela desenha.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falha de rede vira ausencia, e nao explode o pedido do painel', async () => {
    const { alvo, fetch } = servico();
    fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(alvo.buscar('CO26185')).resolves.toBeNull();
  });

  it('nao deixa a origem escolher o Content-Type da nossa resposta', async () => {
    const { alvo, fetch } = servico();
    fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => Buffer.from('<script>'),
    });

    await expect(alvo.buscar('CO26185')).resolves.toEqual({
      conteudo: Buffer.from('<script>'),
      mime: 'image/png',
    });
  });

  it('codigo vazio nem chega a origem', async () => {
    const { alvo, fetch } = servico();
    await expect(alvo.buscar('  ')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
