import { Cliente } from './cliente.entity';
import { ClientePerfil } from './cliente-perfil.entity';

/**
 * O PERFIL FURAVA A MASCARA DO CLIENTE — 01/10/2026.
 *
 * ==========================================================================
 * O OBJETO SAIA MEIO ESCONDIDO E MEIO ABERTO.
 *
 * O `Cliente.toPublic` mascara `telefone1`, `telefone2` e `email` desde 28/09
 * (RF-10) — e anexava o perfil INTEIRO logo depois, com o WhatsApp legivel.
 * Quem lesse aquele metodo via a mascara funcionando.
 *
 * E o WhatsApp do perfil nao e um telefone a mais: e o numero pelo qual a
 * cliente FALA com a loja, e a chave pela qual a agente a reconhece. Esconder
 * os outros tres e entregar este nao esconde ninguem.
 *
 * Atinge quem tem `clientes:read` sem `clientes:contato` — hoje o
 * `GERENTE_VENDAS`, que a migracao 70 deixou de fora de proposito, e que tem
 * senha e entra no painel.
 * ==========================================================================
 */

const WHATSAPP = '(85) 98846-1045';
const TELEFONE = '(85) 3232-4455';

const comPerfil = () =>
  Cliente.create({
    nome: 'Ana Paula Prado',
    tipoPessoa: 'FISICA',
    tabelaPreco: 'VAREJO',
    ativo: true,
    telefone1: TELEFONE,
    email: 'ana.prado@gmail.com',
    perfil: ClientePerfil.create({
      clienteId: 'c-1',
      whatsapp: WHATSAPP,
      origemContato: 'instagram',
      estadoConversa: 'TRIAGE_IN_PROGRESS',
    }),
  } as never);

describe('Cliente.toPublic — o WhatsApp do perfil', () => {
  const perfilDe = (r: Record<string, unknown>) =>
    r.perfil as Record<string, unknown>;

  /* ESTE E O TESTE. O resto e contorno. */
  it('mascarado, o WhatsApp do perfil NÃO sai legível', () => {
    const r = comPerfil().toPublic(true);

    expect(perfilDe(r).whatsapp).not.toBe(WHATSAPP);
    expect(perfilDe(r).whatsapp).not.toContain('98846');
  });

  it('é o DEFAULT: quem esquecer de passar entrega menos', () => {
    const r = comPerfil().toPublic();

    expect(perfilDe(r).whatsapp).not.toContain('98846');
  });

  it('a máscara é a MESMA do telefone — dois dígitos no fim', () => {
    // Uma segunda forma de esconder faria o mesmo numero aparecer de dois
    // jeitos na mesma resposta.
    const r = comPerfil().toPublic(true);

    expect(perfilDe(r).whatsapp).toBe('(••) •••••-••45');
    expect(r.telefone1).toBe('(••) ••••-••55');
  });

  it('sem máscara, o número volta inteiro', () => {
    const r = comPerfil().toPublic(false);

    expect(perfilDe(r).whatsapp).toBe(WHATSAPP);
    expect(r.telefone1).toBe(TELEFONE);
  });

  it('o resto do perfil não é tocado', () => {
    const p = perfilDe(comPerfil().toPublic(true));

    expect(p.clienteId).toBe('c-1');
    expect(p.origemContato).toBe('instagram');
  });

  it('cliente sem perfil continua devolvendo `null`', () => {
    const semPerfil = Cliente.create({
      nome: 'João',
      tipoPessoa: 'FISICA',
      tabelaPreco: 'VAREJO',
      ativo: true,
    } as never);

    expect(semPerfil.toPublic(true).perfil).toBeNull();
  });

  it('o número não aparece em NENHUM lugar da resposta mascarada', () => {
    // A asserção mais larga, e a que pega o campo novo que alguém acrescentar
    // no perfil um dia carregando o mesmo número.
    const json = JSON.stringify(comPerfil().toPublic(true));

    expect(json).not.toContain('98846');
    expect(json).not.toContain('1045');
  });
});
