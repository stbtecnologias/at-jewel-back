import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { OperacaoClasse } from '../../domain/entities/enums';
import { OperacaoEntity } from '../../domain/entities/operacao.entity';
import { OPERACAO_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IOperacaoRepository } from '../../domain/ports/repositories/operacao-repository.port';
import { normalizarIdErp } from '../../../../shared/erp/normalizar-id-erp';

export interface SincronizarOperacaoInput {
  idErp: string;
  codigoErp?: string | null;
  nome: string;
  /**
   * So e considerada na CRIACAO. Ver o comentario do use case — o ERP nao
   * sobrescreve o de-para.
   */
  classificacao?: OperacaoClasse;
  ativo?: boolean;
}

export interface SincronizarOperacaoResultado {
  operacao: OperacaoEntity;
  criada: boolean;
}

/**
 * Upsert por `id_erp` — o caminho da integracao, no padrao do
 * `PUT /estoque` (migracao 32).
 *
 * POR QUE UPSERT E NAO POST/PATCH: o cadastro de operacoes e pequeno, fechado e
 * inteiramente do ERP. Mandar o catalogo inteiro de novo tem de ser barato e
 * sem efeito — com POST, a segunda remessa seria uma parede de 409.
 *
 * ==========================================================================
 * O ERP NAO SOBRESCREVE A `classificacao`.
 *
 * Ela e o unico campo desta tabela que e NOSSO: o de-para entre o cadastro
 * aberto do Safira e o vocabulario que o codigo entende. Se a ressincronizacao
 * a reescrevesse, toda operacao voltaria para OUTRA na proxima remessa e a
 * receita pararia de ser projetada — sem erro, sem log, sem ninguem notar ate
 * o fechamento do mes.
 *
 * E o mesmo cuidado que o RF-INT-11 pediu para o cadastro de vendedoras:
 * "upsert PARCIAL que preserve `whatsapp_interno` e `especialidades` — dados
 * que so existem no CRM".
 *
 * Para corrigir uma classificacao errada existe o PATCH, que e acao de gestao.
 * ==========================================================================
 */
@Injectable()
export class SincronizarOperacaoUseCase {
  constructor(
    @Inject(OPERACAO_REPOSITORY)
    private readonly repo: IOperacaoRepository,
  ) {}

  async execute(
    input: SincronizarOperacaoInput,
  ): Promise<SincronizarOperacaoResultado> {
    const idErp = normalizarIdErp(input.idErp);
    if (!idErp) {
      throw new BadRequestException(
        'idErpOperacao e obrigatorio para sincronizar — e a identidade no ERP',
      );
    }

    const codigoErp = normalizarIdErp(input.codigoErp);
    const existente = await this.repo.buscarPorIdErp(idErp);

    if (!existente) {
      const nova = OperacaoEntity.create({
        idErp,
        codigoErp,
        nome: input.nome,
        classificacao: input.classificacao ?? 'OUTRA',
        ativo: input.ativo ?? true,
      });
      return { operacao: await this.repo.criar(nova), criada: true };
    }

    const atualizada = OperacaoEntity.create({
      id: existente.id,
      idErp,
      codigoErp,
      nome: input.nome,
      // Preservada. Ver o cabecalho.
      classificacao: existente.classificacao,
      ativo: input.ativo ?? existente.ativo,
    });

    return { operacao: await this.repo.atualizar(atualizada), criada: false };
  }
}
