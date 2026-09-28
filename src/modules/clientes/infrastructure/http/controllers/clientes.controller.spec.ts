import { ClientesController } from './clientes.controller';
import { Cliente } from '../../../domain/entities/cliente.entity';

/**
 * A MASCARA VALE EM TODA PORTA — requisito RF-10, 28/09/2026.
 *
 * ==========================================================================
 * ESTE ARQUIVO NASCEU DE UM ERRO, E ELE VALE SER CONTADO.
 *
 * Na primeira volta eu mascarei o `Cliente.toPublic()` e dei por feito. So que
 * a TABELA do painel nao usa `toPublic()`: a rota `/clientes/listagem` monta
 * um payload proprio, reduzido, com o telefone dentro. O Lucas abriu a tela
 * como gerente e viu mil telefones inteiros.
 *
 * A licao: campo sensivel nao se protege no serializador, se protege em TODA
 * porta por onde ele sai. E a unica forma de nao repetir isso e um teste que
 * percorra as portas — que e o que este arquivo faz.
 *
 * QUANDO ACRESCENTAR UMA ROTA QUE DEVOLVA CONTATO, acrescente o caso aqui.
 * ==========================================================================
 */

const CLIENTE = Cliente.create({
  id: 'c-1',
  codigoErp: '01160',
  nome: 'Rafaela Favorito Santos',
  tipoPessoa: 'fisica',
  tabelaPreco: 'varejo',
  telefone1: '11972158791',
  telefone2: '8599925137',
  email: 'rafaela@gmail.com',
  ativo: true,
  vendedoraCodigoErp: null,
});

/** O controller com tudo dublado menos o que cada teste exercita. */
function montar(opcoes: { mascarar: boolean; restrito?: string }) {
  const escopo = {
    codigoErpRestrito: jest.fn().mockResolvedValue(opcoes.restrito),
    mascararContato: jest.fn().mockResolvedValue(opcoes.mascarar),
    podeVer: jest.fn().mockReturnValue(true),
  };
  const listar = { execute: jest.fn().mockResolvedValue([CLIENTE]) };
  const buscar = { execute: jest.fn().mockResolvedValue(CLIENTE) };

  const controller = new ClientesController(
    { execute: jest.fn() } as never, // criar
    buscar as never,
    escopo as never,
    { execute: jest.fn() } as never, // buscarPorIdErp
    { execute: jest.fn() } as never, // buscarPorWhatsapp
    listar as never,
    { execute: jest.fn() } as never, // atualizarPerfil
    { execute: jest.fn() } as never, // buscarHistorico
    { execute: jest.fn() } as never, // monitoramentoSla
    { execute: jest.fn() } as never, // distribuicaoTiers
    { execute: jest.fn() } as never, // atualizarCadastro
    { execute: jest.fn() } as never, // remover
  );

  return { controller, escopo };
}

const REQ = { user: { sub: 'u-1', role: 'GERENTE_VENDAS' } } as never;

describe('o contato do cliente pelas portas do painel', () => {
  describe('GET /clientes/listagem — A TABELA, e a que passou batido', () => {
    it('mascara o telefone para quem ve a base inteira', async () => {
      const { controller } = montar({ mascarar: true });

      const [linha] = (await controller.listagem({} as never, REQ)) as {
        telefone1: string;
      }[];

      expect(linha.telefone1).toBe('•••••••••91');
      expect(linha.telefone1).not.toContain('9721587');
    });

    it('nao mascara para quem esta restrito a propria carteira', async () => {
      // A vendedora: os clientes da resposta sao dela, entao nao ha o que
      // esconder. Ver `EscopoClientesService.mascararContato`.
      const { controller } = montar({ mascarar: false, restrito: 'VD01' });

      const [linha] = (await controller.listagem({} as never, REQ)) as {
        telefone1: string;
      }[];

      expect(linha.telefone1).toBe('11972158791');
    });

    it('pergunta ao escopo — nao decide por conta propria', async () => {
      const { controller, escopo } = montar({ mascarar: true });

      await controller.listagem({} as never, REQ);

      expect(escopo.mascararContato).toHaveBeenCalled();
    });
  });

  describe('GET /clientes — a listagem completa', () => {
    it('mascara telefone e e-mail', async () => {
      const { controller } = montar({ mascarar: true });

      const [linha] = (await controller.listarClientes({} as never, REQ)) as {
        telefone1: string;
        telefone2: string;
        email: string;
      }[];

      expect(linha.telefone1).toBe('•••••••••91');
      expect(linha.telefone2).toBe('••••••••37');
      expect(linha.email).toBe('r••••••@gmail.com');
    });
  });

  describe('GET /clientes/:id — o detalhe', () => {
    it('mascara tambem', async () => {
      // O detalhe e por onde se pega UM telefone — o caso em que a mascara
      // mais importa, porque quem quer um numero especifico vem por aqui.
      const { controller } = montar({ mascarar: true });

      const r = (await controller.buscarPorId('c-1', REQ)) as {
        telefone1: string;
      };

      expect(r.telefone1).toBe('•••••••••91');
    });
  });
});
