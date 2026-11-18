import { ForbiddenException } from '@nestjs/common';
import { PERMISSAO_CHAVES } from '../../../../auth/domain/permissions';
import { WhatsappAdminController } from './whatsapp-admin.controller';

/**
 * O NUMERO DA AGENTE NAO SE DERRUBA DE QUALQUER LUGAR — 18/11/2026.
 *
 * ==========================================================================
 * PEDIDO DO LUCAS: *"ela vai conectar e desconectar as vendedoras.. no caso
 * de agentes da loja.. acredito que ela nao pode tbm cadastrar.. apenas quem
 * tiver permissao"*.
 *
 * A gerente de vendas administra as conexoes DAS VENDEDORAS: religa quem
 * caiu, desliga quem precisa. Os numeros DA CASA — Anastasia e Helena — sao
 * outra coisa: derrubar um deles cala a agente para a loja inteira, e ligar
 * um e escanear o QR com o telefone da empresa, que e o cadastro em si.
 *
 * A REGRA NAO CABE NUM `@Permissions`, e e por isso que ela mora no corpo do
 * metodo: ela depende da SESSAO, e o decorador so enxerga a rota. As tres
 * rotas continuam exigindo `whatsapp:manage` pela classe; a chave nova e uma
 * segunda porta, e so para as sessoes da casa.
 *
 * A DISTINCAO JA EXISTIA NO DADO: `papel: 'LOJA' | 'VENDEDORA' | 'ORFA'`,
 * desde 10/11, e o predicado `ehDaCasa` desde antes. Nada de novo a inventar.
 * ==========================================================================
 */

const DA_CASA = 'default'; // Loja (Anastasia)
const DE_VENDEDORA = 'vd-7f3a';

function montar(temAChave: boolean) {
  const waha = {
    conectar: jest.fn().mockResolvedValue({ ok: true }),
    desconectar: jest.fn().mockResolvedValue(undefined),
    qrDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,xx'),
  };
  const conexoes = {
    exigirValida: jest.fn().mockResolvedValue(undefined),
    ehDeAgente: jest.fn((s: string) => s === DA_CASA),
  };
  const permissions = { possui: jest.fn().mockResolvedValue(temAChave) };

  const controller = new WhatsappAdminController(
    waha as never,
    conexoes as never,
    permissions as never,
  );
  return { controller, waha, permissions };
}

/** O que o guard ja validou: ela tem `whatsapp:manage`. */
const GERENTE_VENDAS = { user: { role: 'GERENTE_VENDAS' } };

describe('mexer no numero das agentes', () => {
  describe('sem a chave, as tres portas da casa fecham', () => {
    /* ESTE E O TESTE. */
    it('desconectar a agente e recusado, e o WAHA nem e chamado', async () => {
      const { controller, waha } = montar(false);

      await expect(
        controller.desconectar(DA_CASA, GERENTE_VENDAS as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // NAO BASTA RECUSAR DEPOIS: o logout no WAHA nao tem volta.
      expect(waha.desconectar).not.toHaveBeenCalled();
    });

    it('conectar a agente e recusado — ligar e escanear o QR, que e o cadastro', async () => {
      const { controller, waha } = montar(false);

      await expect(
        controller.conectar(DA_CASA, GERENTE_VENDAS as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(waha.conectar).not.toHaveBeenCalled();
    });

    it('o QR da agente e recusado — e a porta de verdade do cadastro', async () => {
      const { controller, waha } = montar(false);

      await expect(
        controller.qr(DA_CASA, GERENTE_VENDAS as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(waha.qrDataUrl).not.toHaveBeenCalled();
    });

    it('e a chave perguntada e a certa', async () => {
      const { controller, permissions } = montar(false);

      await expect(
        controller.desconectar(DA_CASA, GERENTE_VENDAS as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(permissions.possui).toHaveBeenCalledWith(
        'GERENTE_VENDAS',
        'whatsapp:agentes',
      );
    });
  });

  describe('as vendedoras seguem como estavam, e e o ponto', () => {
    it.each([
      ['desconectar', (c: WhatsappAdminController) => c.desconectar(DE_VENDEDORA, GERENTE_VENDAS as never)],
      ['conectar', (c: WhatsappAdminController) => c.conectar(DE_VENDEDORA, GERENTE_VENDAS as never)],
      ['qr', (c: WhatsappAdminController) => c.qr(DE_VENDEDORA, GERENTE_VENDAS as never)],
    ] as const)('%s a vendedora passa sem a chave nova', async (_nome, acao) => {
      const { controller, permissions } = montar(false);

      await expect(acao(controller)).resolves.toBeDefined();
      // E NEM PERGUNTA: a chave so entra em cena para sessao da casa.
      expect(permissions.possui).not.toHaveBeenCalled();
    });
  });

  describe('com a chave, a casa abre', () => {
    it.each(['desconectar', 'conectar', 'qr'] as const)(
      '%s a agente passa',
      async (metodo) => {
        const { controller } = montar(true);

        await expect(
          (
            controller[metodo] as (
              s: string,
              r: unknown,
            ) => Promise<unknown>
          ).call(controller, DA_CASA, GERENTE_VENDAS),
        ).resolves.toBeDefined();
      },
    );
  });

  /**
   * PERMISSAO FORA DO CATALOGO E PERMISSAO QUE NINGUEM CONCEDE: a tela de
   * Papeis desenha as caixas a partir dele. Mesmo motivo do
   * `whatsapp-admin.permissoes.spec.ts`.
   */
  it('a chave nova esta no catalogo', () => {
    expect(PERMISSAO_CHAVES).toContain('whatsapp:agentes');
  });
});
