import type { IWhatsappGateway } from '../../../atendimento/domain/ports/whatsapp-gateway.port';
import { PermissionsService } from '../../../auth/application/permissions.service';
import type { IAdminUserRepository } from '../../../auth/domain/ports/repositories/admin-user-repository.port';
import type { Lead } from '../../domain/ports/repositories/lead-repository.port';
import { AvisarGestaoDeLeadUseCase } from './avisar-gestao-de-lead.use-case';

function leadFake(over: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    nome: 'Marina Souza',
    apelido: null,
    whatsapp: '5585944443333',
    origemContato: 'instagram',
    ocasiao: 'NOIVADO',
    produtosDesejados: 'aliança de ouro branco, par',
    resumoTriagem:
      'Marina procura aliança de noivado em ouro branco. Casamento marcado para março.',
    vendedoraSugeridaCodigo: null,
    estado: 'READY_FOR_ROUTING',
    estadoAtualizadoEm: new Date(),
    clienteId: null,
    vinculadoEm: null,
    direcionadoGestaoEm: new Date(),
    vendedoraAprovadaCodigo: null,
    direcionadoVendedoraEm: null,
    fechadoEm: null,
    criadoEm: new Date(),
    ...over,
  };
}

const ADMIN = {
  id: 'a1',
  nome: 'Lucas',
  role: 'ADMIN',
  telefone: '5585911112222',
};
const VENDEDORA_COM_LOGIN = {
  id: 'a2',
  nome: 'Camila',
  role: 'VENDEDORA',
  telefone: '5585933334444',
};
const SEM_TELEFONE = { id: 'a3', nome: 'Ana', role: 'ADMIN', telefone: null };

describe('AvisarGestaoDeLeadUseCase', () => {
  let useCase: AvisarGestaoDeLeadUseCase;
  let admins: jest.Mocked<IAdminUserRepository>;
  let permissoes: jest.Mocked<PermissionsService>;
  let whatsapp: jest.Mocked<IWhatsappGateway>;

  beforeEach(() => {
    admins = {
      listarTodos: jest.fn().mockResolvedValue([ADMIN]),
    } as unknown as jest.Mocked<IAdminUserRepository>;

    permissoes = {
      // Só a gestão tem `vendas:read_all`.
      possui: jest.fn().mockImplementation((role: string) => role === 'ADMIN'),
    } as unknown as jest.Mocked<PermissionsService>;

    whatsapp = {
      resolverChatId: jest.fn().mockResolvedValue('5585911112222@c.us'),
      enviarTexto: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IWhatsappGateway>;

    useCase = new AvisarGestaoDeLeadUseCase(admins, permissoes, whatsapp);
  });

  it('avisa quem tem telefone e permissao de gestao', async () => {
    const enviados = await useCase.execute(leadFake());

    expect(enviados).toBe(1);
    expect(whatsapp.enviarTexto).toHaveBeenCalledTimes(1);
  });

  it('NAO avisa vendedora que tem login no painel', async () => {
    // Ela tem linha em `admin_users`, mas nao a permissao — e veria a carteira
    // das colegas se este filtro nao existisse.
    admins.listarTodos.mockResolvedValue([VENDEDORA_COM_LOGIN] as never);

    expect(await useCase.execute(leadFake())).toBe(0);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('ignora quem nao tem telefone cadastrado', async () => {
    admins.listarTodos.mockResolvedValue([SEM_TELEFONE] as never);

    expect(await useCase.execute(leadFake())).toBe(0);
  });

  it('a mensagem traz o essencial e NAO traz o telefone da cliente', async () => {
    await useCase.execute(leadFake());

    const texto = whatsapp.enviarTexto.mock.calls[0][1];

    expect(texto).toContain('Marina Souza');
    expect(texto).toContain('aliança de ouro branco');
    expect(texto).toContain('noivado');
    expect(texto).toContain('Para qual vendedora encaminho?');

    // O numero esta no CRM para quem for atender; num aviso ele so serviria
    // para ser repassado adiante sem controle.
    expect(texto).not.toContain('5585944443333');
  });

  it('um destinatario com problema nao cala os outros', async () => {
    admins.listarTodos.mockResolvedValue([
      ADMIN,
      { ...ADMIN, id: 'a9', nome: 'Thiago', telefone: '5585955556666' },
    ] as never);
    whatsapp.enviarTexto
      .mockRejectedValueOnce(new Error('WAHA fora do ar'))
      .mockResolvedValueOnce(undefined);

    expect(await useCase.execute(leadFake())).toBe(1);
  });

  it('numero sem conta de WhatsApp e pulado, nao quebra', async () => {
    whatsapp.resolverChatId.mockResolvedValue(null);

    expect(await useCase.execute(leadFake())).toBe(0);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('lead sem nome ainda gera aviso legivel', async () => {
    await useCase.execute(leadFake({ nome: null }));

    expect(whatsapp.enviarTexto.mock.calls[0][1]).toContain(
      'Cliente sem nome informado',
    );
  });
});
