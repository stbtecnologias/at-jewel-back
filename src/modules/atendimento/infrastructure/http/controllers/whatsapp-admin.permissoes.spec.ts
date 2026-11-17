import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../../auth/infrastructure/http/decorators/permissions.decorator';
import { PERMISSAO_CHAVES } from '../../../../auth/domain/permissions';
import { WhatsappAdminController } from './whatsapp-admin.controller';

/**
 * ADMINISTRAR A CONEXAO E LER A CONVERSA VIRARAM DUAS COISAS — 17/11/2026.
 *
 * ==========================================================================
 * UMA CHAVE SO ABRIA O QR E A CONVERSA DA CLIENTE.
 *
 * O `whatsapp:manage` guardava as oito rotas deste controller, e entre elas
 * ha duas naturezas MUITO diferentes: religar um numero que caiu, e ler o que
 * a vendedora falou com a cliente. Dar a primeira obrigava a dar a segunda.
 *
 * O pedido do Lucas em 17/11 foi exatamente esse corte: a gerente de vendas
 * precisa conectar, desconectar e atualizar — e NAO pode ler os chats.
 *
 * Este teste nao exercita HTTP: ele le o metadado que o `PermissionsGuard`
 * consulta. E isso que importa, porque o guard usa `getAllAndOverride` — a
 * permissao do METODO SUBSTITUI a da classe. Se alguem um dia apagar a linha
 * de uma destas tres rotas, ela volta silenciosamente para o `whatsapp:manage`
 * da classe e o recorte deixa de existir sem nenhum erro. E este teste que
 * percebe.
 * ==========================================================================
 */
describe('as permissoes do controller de WhatsApp', () => {
  const reflector = new Reflector();

  /** O que o guard leria para um metodo — metodo primeiro, classe depois. */
  const exigidaEm = (metodo: keyof WhatsappAdminController): string[] =>
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      WhatsappAdminController.prototype[metodo] as unknown as () => unknown,
      WhatsappAdminController,
    ]) ?? [];

  describe('ler conversa exige a permissao nova, e SO ela', () => {
    // So ela de proposito: a lista e um OU. Listar as duas faria o
    // `whatsapp:manage` continuar passando, e o recorte nao valeria nada.
    it.each(['chats', 'mensagens', 'midia'] as const)(
      '%s pede whatsapp:conversas',
      (metodo) => {
        expect(exigidaEm(metodo)).toEqual(['whatsapp:conversas']);
      },
    );
  });

  describe('administrar a conexao continua no whatsapp:manage', () => {
    it.each(['listar', 'status', 'conectar', 'qr', 'desconectar'] as const)(
      '%s pede whatsapp:manage',
      (metodo) => {
        expect(exigidaEm(metodo)).toEqual(['whatsapp:manage']);
      },
    );
  });

  /**
   * O QR E O MAIS PESADO DOS CINCO QUE FICAM, e fica por decisao do Lucas em
   * 17/11: *"ela vai poder desconectar e conectar quem nao esta"*. Registrado
   * aqui para que a escolha seja vista por quem mexer, e nao redescoberta.
   */
  it('o qr fica do lado de administrar, e isso e deliberado', () => {
    expect(exigidaEm('qr')).toEqual(['whatsapp:manage']);
    expect(exigidaEm('qr')).not.toContain('whatsapp:conversas');
  });

  /**
   * PERMISSAO FORA DO CATALOGO E PERMISSAO QUE NINGUEM CONCEDE: a tela de
   * Papeis desenha as caixas a partir dele, e a validacao do `AtualizarRole`
   * recusa chave que nao esta ali. Foi o buraco do `atendimentos:read` ate
   * 08/09/2026 — existia no banco e nao existia na tela.
   */
  it('a permissao nova esta no catalogo', () => {
    expect(PERMISSAO_CHAVES).toContain('whatsapp:conversas');
  });
});
