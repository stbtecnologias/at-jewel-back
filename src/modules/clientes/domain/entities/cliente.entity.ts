import { ClientePerfil } from './cliente-perfil.entity';
// As duas sairam deste arquivo em 01/10/2026 — ver o cabecalho de
// `mascara-de-contato.ts`: o perfil passou a precisar delas, e importar de
// volta fecharia um ciclo.
import { mascararEmail, mascararTelefone } from './mascara-de-contato';
import { TabelaPreco, TipoPessoa } from './enums';

export interface ClienteProps {
  id?: string;
  /** Identidade no ERP: chave da tabela LA, imutavel. */
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa: TipoPessoa;
  tabelaPreco: TabelaPreco;
  telefone1?: string | null;
  telefone1Hash?: string | null;
  telefone2?: string | null;
  email?: string | null;
  emailHash?: string | null;
  ativo: boolean;
  limiteCredito?: number | null;
  observacaoGeral?: string | null;
  observacaoCredito?: string | null;
  vendedoraCodigoErp?: string | null;
  criadoEm?: Date;
  atualizadoEm?: Date;
  perfil?: ClientePerfil | null;
}

export class Cliente {
  readonly id: string | undefined;
  readonly idErp: string | null;
  readonly codigoErp: string | null;
  readonly nome: string;
  readonly nomeFantasia: string | null;
  readonly tipoPessoa: TipoPessoa;
  readonly tabelaPreco: TabelaPreco;

  // Descriptografados pela camada de infraestrutura. Os hashes existem so
  // para lookup interno — NUNCA exposto em response DTO.
  readonly telefone1: string | null;
  readonly telefone1Hash: string | null;
  readonly telefone2: string | null;
  readonly email: string | null;
  readonly emailHash: string | null;

  readonly ativo: boolean;
  readonly limiteCredito: number | null;
  readonly observacaoGeral: string | null;
  readonly observacaoCredito: string | null;
  readonly vendedoraCodigoErp: string | null;
  readonly criadoEm: Date | undefined;
  readonly atualizadoEm: Date | undefined;

  // 1:0..1 — nem todo cliente passou pela triagem da Anastasia.
  readonly perfil: ClientePerfil | null;

  private constructor(props: ClienteProps) {
    this.id = props.id;
    this.idErp = props.idErp ?? null;
    this.codigoErp = props.codigoErp ?? null;
    this.nome = props.nome;
    this.nomeFantasia = props.nomeFantasia ?? null;
    this.tipoPessoa = props.tipoPessoa;
    this.tabelaPreco = props.tabelaPreco;
    this.telefone1 = props.telefone1 ?? null;
    this.telefone1Hash = props.telefone1Hash ?? null;
    this.telefone2 = props.telefone2 ?? null;
    this.email = props.email ?? null;
    this.emailHash = props.emailHash ?? null;
    this.ativo = props.ativo;
    this.limiteCredito = props.limiteCredito ?? null;
    this.observacaoGeral = props.observacaoGeral ?? null;
    this.observacaoCredito = props.observacaoCredito ?? null;
    this.vendedoraCodigoErp = props.vendedoraCodigoErp ?? null;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
    this.perfil = props.perfil ?? null;
  }

  static create(props: ClienteProps): Cliente {
    return new Cliente(props);
  }

  /**
   * Helper para a camada HTTP — produz objeto sem campos *_hash.
   * E sem campo `perfil` (que vai serializado separadamente se carregado).
   *
   * ========================================================================
   * O CONTATO PODE VIR MASCARADO — 28/09/2026, requisito RF-10.
   *
   * A matriz do documento de requisitos diz: "Telefone do cliente sem
   * mascara — Vendedora: apenas dos proprios clientes. Gerente: mascarado.
   * Equipe AT: sim".
   *
   * MASCARA, E NAO AUSENCIA, e a diferenca importa aqui — ao contrario do
   * custo da peca, que some do objeto. Telefone e o campo que identifica a
   * pessoa na tela: some-lo faria duas clientes homonimas virarem a mesma
   * linha, e quem precisa DISTINGUIR sem precisar LIGAR fica sem saida. O
   * final visivel resolve isso e nao serve para discar.
   *
   * @param mascarar `true` esconde telefone e e-mail. O padrao e mascarar —
   *   mesma regra do `Produto.toPublic`: quem esquecer de passar a opcao
   *   entrega menos, e nao mais.
   * ========================================================================
   */
  toPublic(mascarar = true): Record<string, unknown> {
    return {
      id: this.id,
      idErpCliente: this.idErp,
      codigoErp: this.codigoErp,
      nome: this.nome,
      nomeFantasia: this.nomeFantasia,
      tipoPessoa: this.tipoPessoa,
      tabelaPreco: this.tabelaPreco,
      telefone1: mascarar ? mascararTelefone(this.telefone1) : this.telefone1,
      telefone2: mascarar ? mascararTelefone(this.telefone2) : this.telefone2,
      email: mascarar ? mascararEmail(this.email) : this.email,
      ativo: this.ativo,
      limiteCredito: this.limiteCredito,
      observacaoGeral: this.observacaoGeral,
      observacaoCredito: this.observacaoCredito,
      vendedoraCodigoErp: this.vendedoraCodigoErp,
      criadoEm: this.criadoEm,
      atualizadoEm: this.atualizadoEm,
      // ====================================================================
      // O `mascarar` TEM DE ATRAVESSAR — 01/10/2026.
      //
      // Ate aqui o perfil era anexado inteiro, com o WhatsApp legivel, logo
      // depois de os tres campos de cima terem sido mascarados. O objeto saia
      // meio escondido e meio aberto — e quem lesse este metodo veria a
      // mascara funcionando.
      //
      // E o WhatsApp do perfil nao e um telefone a mais: e o numero pelo qual
      // a cliente FALA com a loja, e a chave que faz a agente reconhece-la.
      // Esconder `telefone1` e entregar este nao esconde ninguem.
      //
      // Atinge quem tem `clientes:read` sem `clientes:contato` — hoje o
      // `GERENTE_VENDAS`, que a migracao 70 deixou de fora de proposito.
      // ====================================================================
      perfil: this.perfil?.toPublic(mascarar) ?? null,
    };
  }

  // Serializacao REDUZIDA para o agente (n8n/Anastasia), consumida pelo
  // endpoint de lookup por API Key. O retorno deste metodo viaja para o
  // contexto do LLM externo (OpenAI) a cada turno, entao expoe SOMENTE o
  // minimo necessario para a triagem. NUNCA inclui PII de contato
  // (telefone1/2, email, whatsapp), dados financeiros (limiteCredito,
  // observacaoCredito), notas internas, endereco, documentos ou o nome
  // completo — minimizacao de dados e barreira anti-injecao indireta
  // (LGPD Art. 6 III). Espelha o padrao de Vendedora.toAgentePublic().
  toAgenteContexto(): Record<string, unknown> {
    const p = this.perfil;
    return {
      clienteId: this.id,
      // Apenas o primeiro nome — o nome completo e minimizado.
      primeiroNome: this.extrairPrimeiroNome(this.nome),
      origemContato: p?.origemContato ?? null,
      estadoConversa: p?.estadoConversa ?? null,
      tipoCompra: p?.tipoCompra ?? null,
      urgencia: p?.urgencia ?? null,
      nivelConhecimento: p?.nivelConhecimento ?? null,
      motivacaoCompra: p?.motivacaoCompra ?? null,
      tags: p?.tags ?? [],
      scorePerfil: p?.scorePerfil ?? null,
      intencaoCompra: p?.intencaoCompra ?? null,
      resumoTriagem: p?.resumoTriagem ?? null,
    };
  }

  private extrairPrimeiroNome(nomeCompleto: string): string {
    return nomeCompleto.trim().split(/\s+/)[0] ?? '';
  }
}

