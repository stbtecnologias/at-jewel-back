import { Cliente } from './cliente.entity';
import { ClientePerfil } from './cliente-perfil.entity';

describe('Cliente.toAgenteContexto', () => {
  // Chaves que JAMAIS podem aparecer na view do agente (vao para o LLM
  // externo via n8n). Ver C-001 da revisao anti-prompt-injection.
  const CHAVES_PROIBIDAS = [
    'telefone1',
    'telefone2',
    'email',
    'whatsapp',
    'limiteCredito',
    'observacaoCredito',
    'observacaoGeral',
    'notasInternas',
    'nome',
    'nomeFantasia',
    'codigoErp',
    'tipoPessoa',
    'tabelaPreco',
    'telefone1Hash',
    'emailHash',
    'whatsappHash',
    'perfil',
  ];

  const CHAVES_PERMITIDAS = [
    'clienteId',
    'primeiroNome',
    'origemContato',
    'estadoConversa',
    'tipoCompra',
    'urgencia',
    'nivelConhecimento',
    'motivacaoCompra',
    'tags',
    'scorePerfil',
    'intencaoCompra',
    'resumoTriagem',
  ];

  function clienteCompleto(): Cliente {
    const perfil = ClientePerfil.create({
      clienteId: 'uuid-cliente',
      whatsapp: '85988887777',
      whatsappHash: 'hash-secreto',
      origemContato: 'whatsapp',
      estadoConversa: 'TRIAGE_IN_PROGRESS',
      tipoCompra: 'presente',
      urgencia: 'imediata',
      nivelConhecimento: 'iniciante',
      motivacaoCompra: 'presente',
      tags: ['noivado', 'ouro'],
      scorePerfil: 87,
      intencaoCompra: 'Anel de noivado em ouro branco',
      resumoTriagem: 'Cliente busca alianca para pedido de casamento',
      notasInternas: 'NOTA INTERNA SENSIVEL',
    });
    return Cliente.create({
      id: 'uuid-cliente',
      codigoErp: 'ERP-123',
      nome: 'Maria Aparecida da Silva',
      nomeFantasia: 'Maria Joias',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      telefone1: '8533334444',
      telefone1Hash: 'hash-tel',
      telefone2: '8599998888',
      email: 'maria@email.com',
      emailHash: 'hash-email',
      ativo: true,
      limiteCredito: 5000,
      observacaoGeral: 'observacao livre',
      observacaoCredito: 'credito aprovado pela gerencia',
      vendedoraCodigoErp: 'V-1',
      perfil,
    });
  }

  it('NAO expoe nenhuma chave proibida (PII, financeiro, notas, hashes, nome completo)', () => {
    const ctx = clienteCompleto().toAgenteContexto();
    for (const chave of CHAVES_PROIBIDAS) {
      expect(ctx).not.toHaveProperty(chave);
    }
  });

  it('expoe exatamente as chaves permitidas', () => {
    const ctx = clienteCompleto().toAgenteContexto();
    expect(Object.keys(ctx).sort()).toEqual([...CHAVES_PERMITIDAS].sort());
  });

  it('reduz o nome completo apenas ao primeiro nome', () => {
    const ctx = clienteCompleto().toAgenteContexto();
    expect(ctx.primeiroNome).toBe('Maria');
  });

  it('mapeia os campos do perfil quando ele existe', () => {
    const ctx = clienteCompleto().toAgenteContexto();
    expect(ctx).toMatchObject({
      clienteId: 'uuid-cliente',
      origemContato: 'whatsapp',
      estadoConversa: 'TRIAGE_IN_PROGRESS',
      tipoCompra: 'presente',
      urgencia: 'imediata',
      nivelConhecimento: 'iniciante',
      motivacaoCompra: 'presente',
      tags: ['noivado', 'ouro'],
      scorePerfil: 87,
      intencaoCompra: 'Anel de noivado em ouro branco',
      resumoTriagem: 'Cliente busca alianca para pedido de casamento',
    });
  });

  it('degrada com seguranca quando o cliente nao tem perfil', () => {
    const semPerfil = Cliente.create({
      id: 'uuid-cliente',
      nome: 'Joao Pedro',
      tipoPessoa: 'fisica',
      tabelaPreco: 'varejo',
      ativo: true,
    });
    const ctx = semPerfil.toAgenteContexto();

    expect(ctx).toEqual({
      clienteId: 'uuid-cliente',
      primeiroNome: 'Joao',
      origemContato: null,
      estadoConversa: null,
      tipoCompra: null,
      urgencia: null,
      nivelConhecimento: null,
      motivacaoCompra: null,
      tags: [],
      scorePerfil: null,
      intencaoCompra: null,
      resumoTriagem: null,
    });
    // Reforco: sem perfil tambem nao pode vazar nada proibido.
    for (const chave of CHAVES_PROIBIDAS) {
      expect(ctx).not.toHaveProperty(chave);
    }
  });
});
