/**
 * Local de estoque — o lugar FISICO onde a peca esta.
 * Ex.: Armario 01 · Armario 02 · Cofre.
 *
 * Criado na migracao 32, a partir do modelo do ERP descrito pelo Lucas em
 * 17/08/2026: a chave do estoque e (empresa, grupo, local, produto).
 *
 * SO LUGARES. No ERP a mesma coluna guarda tambem pessoa ("Ana") e fornecedor,
 * porque la tudo e texto. Aqui nao: quando a peca esta com alguem, o saldo
 * aponta para `clientes`, `vendedoras` ou `fornecedores` por FK de verdade, na
 * propria tabela `estoque`. Gravar "Ana" como nome de local perderia o vinculo
 * e obrigaria a casar por nome depois.
 *
 * MINIMO DE PROPOSITO: codigo do ERP, nome e ativo.
 */
export interface LocalEstoqueProps {
  id?: string;
  /** ID da linha no ERP: chave tecnica, imutavel. NORMALIZADO (migracao 65). */
  idErp?: string | null;
  /** O mesmo id COMO O INTEGRADOR MANDOU. So para o eco da resposta. */
  idErpBruto?: string | null;
  codigoErp?: string | null;
  nome: string;
  ativo: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export class LocalEstoque {
  readonly id: string | undefined;
  readonly idErp: string | null;
  readonly idErpBruto: string | null;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly ativo: boolean;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  private constructor(props: LocalEstoqueProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.idErpBruto = props.idErpBruto ?? null;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.ativo = props.ativo;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static create(props: LocalEstoqueProps): LocalEstoque {
    return new LocalEstoque(props);
  }

  toPublic(): Record<string, unknown> {
    return {
      id: this.id,
      // Exposto com o sufixo da tabela para quem integra saber a que
      // cadastro o id pertence ao montar o payload.
      //
      // O BRUTO VENCE, E ESSE E O PONTO DA MIGRACAO 65: quem mandou
      // "009000000018" recebe "009000000018" de volta. O `idErp` e o canonico,
      // e so aparece aqui para as linhas antigas, gravadas antes da coluna
      // existir — elas voltam a ecoar a grafia original no proximo reenvio.
      idErpLocal: this.idErpBruto ?? this.idErp,
      codigoErp: this.codigoErp,
      nome: this.nome,
      ativo: this.ativo,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
    };
  }
}
