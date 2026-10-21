import { randomBytes } from 'crypto';
import { hashField } from '../../../shared/database/transformers/encrypted-column.transformer';
import { GenteDaCasaService } from './gente-da-casa.service';

/**
 * QUEM E GENTE DA CASA — RF29 e RF30, 20/10/2026.
 *
 * ============================================================================
 * O QUE ESTES TESTES PROTEGEM sao tres coisas que ja deram errado no projeto:
 *
 *   1. O `@c.us`. `chat_id_hash` nao e o hash do telefone, e o do CHAT ID. A
 *      conferencia de 20/10 devolveu ZERO conversas de gente de dentro por
 *      causa disso — e zero tinha cara de "nao tem".
 *   2. As VARIANTES. O WhatsApp entrega com DDI e o cadastro guarda sem; hash
 *      de formas diferentes nunca casa.
 *   3. OS TRES LUGARES. Telefone de gente da casa mora em `whatsapp_interno`,
 *      em `whatsapp_externo` e em `admin_users.telefone`. Olhar um so deixa a
 *      maior parte passando.
 * ============================================================================
 */
describe('GenteDaCasaService', () => {
  const ORIGINAL_ENV = { ...process.env };

  let vendedoras: { listar: jest.Mock };
  let admins: { listarTodos: jest.Mock };
  let servico: GenteDaCasaService;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.HASH_SECRET = randomBytes(32).toString('hex');
    vendedoras = { listar: jest.fn().mockResolvedValue([]) };
    admins = { listarTodos: jest.fn().mockResolvedValue([]) };
    servico = new GenteDaCasaService(vendedoras as never, admins as never);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('sem ninguém com telefone, o mapa é vazio — e quem chama não faz nada', async () => {
    const mapa = await servico.mapa();

    expect(mapa.vazio()).toBe(true);
    expect(mapa.hashes()).toHaveLength(0);
  });

  it('o CORPORATIVO da vendedora entra, e ela é VENDEDORA', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '85986467241' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoHash(hashField('85986467241'))).toBe('VENDEDORA');
  });

  it('o PESSOAL também entra — são dois telefones, e os dois valem', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: '85911112222', whatsappExterno: '85986467241' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoHash(hashField('85911112222'))).toBe('VENDEDORA');
    expect(mapa.papelDoHash(hashField('85986467241'))).toBe('VENDEDORA');
  });

  // ==========================================================================
  // O `@c.us` — a armadilha que devolveu zero em 20/10.
  // ==========================================================================
  it('o CHAT ID casa, e não só o telefone solto', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '5585986467241' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoChat('5585986467241@c.us')).toBe('VENDEDORA');
  });

  // ==========================================================================
  // AS VARIANTES — o WhatsApp manda com DDI, o cadastro guarda sem.
  // ==========================================================================
  it('acha o cadastro SEM DDI quando o chat chega COM DDI', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '85986467241' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoChat('5585986467241@c.us')).toBe('VENDEDORA');
  });

  it('acha o cadastro COM nono dígito quando o chat chega SEM', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '5585986467241' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoChat('558586467241@c.us')).toBe('VENDEDORA');
  });

  it('o papel do ADMIN vem do `role` da conta', async () => {
    admins.listarTodos.mockResolvedValue([
      { telefone: '85933334444', role: 'GERENTE_VENDAS' },
      { telefone: '85955556666', role: 'SUPERADMIN' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoHash(hashField('85933334444'))).toBe('GERENTE_VENDAS');
    expect(mapa.papelDoHash(hashField('85955556666'))).toBe('SUPERADMIN');
  });

  // VALIDADO, E NAO CONVERTIDO: papel inventado na tela de Papeis nao vira
  // etiqueta inventada na timeline — cai em ADMIN, que e verdade.
  it('`role` desconhecido vira ADMIN, e não some do mapa', async () => {
    admins.listarTodos.mockResolvedValue([
      { telefone: '85933334444', role: 'COORDENADOR_DE_ALGO' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoHash(hashField('85933334444'))).toBe('ADMIN');
  });

  // A VENDEDORA GANHA: a gerente de vendas tem conta de painel E faixa na
  // timeline. Na faixa dela, o rotulo que faz sentido e "vendedora".
  it('quem é vendedora E tem conta de painel aparece como VENDEDORA', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '85986467241' },
    ]);
    admins.listarTodos.mockResolvedValue([
      { telefone: '85986467241', role: 'GERENTE_VENDAS' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoHash(hashField('85986467241'))).toBe('VENDEDORA');
  });

  it('quem não é da casa não é marcado', async () => {
    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '85986467241' },
    ]);

    const mapa = await servico.mapa();

    expect(mapa.papelDoChat('5511999990000@c.us')).toBeNull();
    expect(mapa.papelDoChat(null)).toBeNull();
    expect(mapa.papelDoChat('')).toBeNull();
  });

  // SEM CACHE, de propósito: pedido do Lucas em 20/10 — "quando elas
  // cadastrarem novos telefones, já sejam lidos também".
  it('lê o cadastro A CADA pergunta — telefone novo vale na próxima tela', async () => {
    vendedoras.listar.mockResolvedValue([]);
    expect((await servico.mapa()).vazio()).toBe(true);

    vendedoras.listar.mockResolvedValue([
      { whatsappInterno: null, whatsappExterno: '85986467241' },
    ]);
    expect((await servico.mapa()).papelDoHash(hashField('85986467241'))).toBe(
      'VENDEDORA',
    );
  });
});
