import { Inject, Injectable } from '@nestjs/common';
import { CLIENTE_REPOSITORY } from '../../../clientes/domain/ports/injection-tokens';
import type {
  ClienteDaCarteira,
  IClienteRepository,
} from '../../../clientes/domain/ports/repositories/cliente-repository.port';

/** Teto de resultados. Lista longa nao ajuda numa conversa de WhatsApp. */
const MAXIMO = 8;

/**
 * A carteira da vendedora: quem esta parado e quem mais compra.
 *
 * ESCOPO PELO CODIGO DO ERP. A carteira e `clientes.vendedora_codigo_erp`, o
 * mesmo campo que o `avisar_vendedora` usa para decidir quem avisar. O codigo
 * e parametro obrigatorio das consultas — nao existe versao sem recorte, entao
 * nao existe caminho para a carteira de outra pessoa.
 *
 * O QUE SAI DAQUI NAO TEM TELEFONE NEM E-MAIL. Ela ve nome, quando comprou pela
 * ultima vez, quanto e quantas vezes. Contato ela ja tem no proprio celular; o
 * que o canal nao precisa carregar, nao carrega.
 *
 * Vendedora sem `codigo_erp` nao tem carteira — devolve vazio em vez de
 * explodir, e o agente diz que nao encontrou clientes.
 */
@Injectable()
export class ConsultarCarteiraVendedoraUseCase {
  constructor(
    @Inject(CLIENTE_REPOSITORY)
    private readonly clientes: IClienteRepository,
  ) {}

  /** Quem esta ha `meses` sem comprar — inclui quem nunca comprou. */
  async semComprar(
    vendedoraCodigoErp: string | null,
    meses: number,
  ): Promise<ClienteDaCarteira[]> {
    if (!vendedoraCodigoErp) return [];
    return this.clientes.inativosDaCarteira(vendedoraCodigoErp, meses, MAXIMO);
  }

  /**
   * Quem mais comprou. Com `categoria` a conta e de ITENS daquele tipo
   * ("quem comprou mais aneis"); sem ela, de COMPRAS ("quem mais compra de
   * mim"). Sao perguntas diferentes e a unidade muda junto.
   */
  async maioresCompradores(
    vendedoraCodigoErp: string | null,
    opcoes: { categoria?: string; ultimosMeses?: number },
  ): Promise<ClienteDaCarteira[]> {
    if (!vendedoraCodigoErp) return [];

    let desde: Date | undefined;
    if (opcoes.ultimosMeses && opcoes.ultimosMeses > 0) {
      desde = new Date();
      desde.setMonth(desde.getMonth() - opcoes.ultimosMeses);
    }

    return this.clientes.maioresCompradoresDaCarteira(vendedoraCodigoErp, {
      categoria: opcoes.categoria,
      desde,
      limite: MAXIMO,
    });
  }
}
