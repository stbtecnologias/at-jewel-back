import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { SincronizarMovimentacaoDto } from './sincronizar-movimentacao.dto';

/**
 * O UUID VAZIO QUE BARRAVA A MOVIMENTAÇÃO — 17/11/2026.
 *
 * ==========================================================================
 * 16 MOVIMENTAÇÕES RECUSADAS, E A CULPA ERA DE DUAS ASPAS.
 *
 * O integrador mandou, e o Lucas colou o payload inteiro em 17/11:
 *
 *   "idVendedora": ""
 *
 * A resposta era `{"statusCode":400,"message":["idVendedora must be a UUID"]}`.
 *
 * E O MOTIVO É UMA LINHA DO class-validator: o `@IsOptional()` pula as outras
 * validações quando o valor é `null` ou `undefined`, **e só nesses dois
 * casos**. Campo ausente chega como `undefined` e passa; `null` passa; `""`
 * não é nenhum dos dois, então o `@IsUUID()` roda e recusa.
 *
 * Para um humano, "não mandei", "mandei nulo" e "mandei vazio" dizem a mesma
 * coisa. Para a biblioteca, os dois primeiros são ausência e o terceiro é um
 * valor — um valor que não tem forma de UUID.
 *
 * MEDIDO EM 17/11: o payload dele falha por ESSA razão e só por ela. Os itens,
 * os pagamentos, o `debitoCredito`, e até o `"entrada": 0.0` e `"saida": 1.0`
 * — números onde o DTO pede booleano — passam todos.
 *
 * E ERAM SETE CAMPOS, não um: `idOperacao`, `idEmpresa`, `idGrupoOrigem`,
 * `idGrupoDestino`, `idEntidadeOrigem`, `idEntidadeDestino` e `idVendedora`
 * recusavam `""` igual. Hoje ele só manda vazio na vendedora; no dia em que
 * mandar na empresa, é o mesmo 400 com outro nome.
 * ==========================================================================
 */

/** O payload do integrador, copiado como veio em 17/11/2026. */
const DO_INTEGRADOR = {
  idErpMovimentacao: '000000578212',
  numero: 635.0,
  dataMovimentacao: '2025-06-11T15:46:57',
  idEmpresa: '9ee6f101-31c7-4152-955c-c692972bd196',
  idOperacao: '044da52b-8499-4c8f-9d37-f97cdb6370da',
  idGrupoOrigem: 'd50433dd-dcbe-46f9-89ce-f908423a4244',
  idGrupoDestino: '8d55f505-fe18-41cd-893f-6bb2130b501f',
  idEntidadeOrigem: 'dd334e1c-f013-4353-aba1-95f87a08d2ce',
  idEntidadeDestino: '0631ba74-8643-412a-a337-0b1a1798a069',
  idVendedora: '',
  valor: 13000.0,
  entrada: 0.0,
  saida: 1.0,
  itens: [
    {
      idErpItem: '000000578212',
      nItem: 1.0,
      quantidade: 1.0,
      valorUnitario: 13000.0,
      idProduto: 'e5f62d31-d813-47a3-9c82-e53d48f20f0d',
    },
  ],
  pagamentos: [
    {
      idErpPagamento: '000000578212',
      valor: 13000.0,
      debitoCredito: 'D',
      idErpFormaPagamento: '5181fb52-e8ad-4524-b35e-c96b5663aa70',
    },
  ],
};

const UUID_DE_VERDADE = '044da52b-8499-4c8f-9d37-f97cdb6370da';

/** Os sete campos que o ERP preenche com o NOSSO uuid. */
const CAMPOS_DE_UUID = [
  'idOperacao',
  'idEmpresa',
  'idGrupoOrigem',
  'idGrupoDestino',
  'idEntidadeOrigem',
  'idEntidadeDestino',
  'idVendedora',
] as const;

function mensagens(corpo: Record<string, unknown>): string[] {
  const dto = plainToInstance(SincronizarMovimentacaoDto, corpo);
  // ACHATA OS FILHOS: o erro de um item vem em `children`, e sem isto um
  // item invalido passaria o teste em silencio.
  const achatar = (e: ValidationError, prefixo = ""): string[] => [
    ...Object.values(e.constraints ?? {}).map((m) => prefixo + String(m)),
    ...(e.children ?? []).flatMap((f) =>
      achatar(f, prefixo + e.property + "."),
    ),
  ];
  return validateSync(dto).flatMap((e) => achatar(e));
}

function instancia(
  corpo: Record<string, unknown>,
): SincronizarMovimentacaoDto {
  return plainToInstance(SincronizarMovimentacaoDto, corpo);
}

describe('a movimentação que o ERP manda sem vendedora', () => {
  it('o payload do integrador, como veio, entra', () => {
    expect(mensagens(DO_INTEGRADOR)).toEqual([]);
  });

  /**
   * VAZIO VIRA AUSENTE, e não string vazia: o campo guarda o NOSSO uuid, e
   * `''` não é uuid. Quem recebe tem de ver "não informado".
   */
  it('a vendedora vazia chega como não informada', () => {
    expect(instancia(DO_INTEGRADOR).idVendedora).toBeUndefined();
  });

  it('os sete campos de uuid aceitam vazio, espaço e nulo', () => {
    for (const campo of CAMPOS_DE_UUID) {
      for (const vazio of ['', '   ', null]) {
        expect(mensagens({ ...DO_INTEGRADOR, [campo]: vazio })).toEqual([]);
      }
    }
  });

  /**
   * ============================================================
   * O QUE NÃO É VAZIO CONTINUA SENDO 400, E ISSO É DELIBERADO.
   *
   * Em 16/11 eu havia proposto que `0` e `"0"` também virassem "não
   * informado". Mudei em 17/11, medindo: há prova de que o ERP manda `""` e
   * nenhuma de que mande `0`.
   *
   * `0` não é vazio, é um valor. Se eu aceitar `0` como "nenhuma" e ele
   * significar outra coisa, a movimentação entra errada e CALADA. Recusando,
   * o 400 conta — que é exatamente como este defeito apareceu.
   * ============================================================
   */
  it('zero, código do ERP e lixo continuam recusados', () => {
    for (const ruim of [0, '0', '000000009599', 'nenhuma', '123']) {
      expect(mensagens({ ...DO_INTEGRADOR, idVendedora: ruim })).toContain(
        'idVendedora must be a UUID',
      );
    }
  });

  it('o uuid de verdade continua passando e continua chegando', () => {
    const corpo = { ...DO_INTEGRADOR, idVendedora: UUID_DE_VERDADE };

    expect(mensagens(corpo)).toEqual([]);
    expect(instancia(corpo).idVendedora).toBe(UUID_DE_VERDADE);
  });

  /**
   * O LADO QUE JÁ FUNCIONAVA não pode mudar: o `idErpVendedora` tem
   * `@Transform(idErpEntrada)` desde antes e aceita vazio.
   */
  it('o código do ERP da vendedora segue aceitando vazio', () => {
    expect(
      mensagens({ ...DO_INTEGRADOR, idVendedora: '', idErpVendedora: '' }),
    ).toEqual([]);
  });
  /**
   * OS FILHOS DO MESMO PAYLOAD. O integrador manda `itens` e `pagamentos` na
   * mesma chamada, e os dois tinham o mesmo defeito: `idProduto` no item e
   * `formaPagamentoId` no pagamento. Se um dia ele mandar vazio ali, era o
   * mesmo 400 com outro nome.
   */
  it('o item e o pagamento também aceitam uuid vazio', () => {
    const corpo = {
      ...DO_INTEGRADOR,
      itens: [{ ...DO_INTEGRADOR.itens[0], idProduto: '' }],
      pagamentos: [{ ...DO_INTEGRADOR.pagamentos[0], formaPagamentoId: '' }],
    };

    expect(mensagens(corpo)).toEqual([]);
  });

  it('e o item com lixo no uuid continua recusado', () => {
    const corpo = {
      ...DO_INTEGRADOR,
      itens: [{ ...DO_INTEGRADOR.itens[0], idProduto: '000000578212' }],
    };

    expect(mensagens(corpo).length).toBeGreaterThan(0);
  });
});
