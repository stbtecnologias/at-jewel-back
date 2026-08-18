import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { TipoPessoa } from '../../../clientes/domain/entities/enums';
import { Fornecedor } from '../../domain/entities/fornecedor.entity';
import { FORNECEDOR_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IFornecedorRepository } from '../../domain/ports/repositories/fornecedor-repository.port';
import { normalizarOpcional } from '../utils/normalizadores';

export interface CriarFornecedorInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa?: TipoPessoa;
  cpfCnpj?: string | null;
  inscricaoEstadual?: string | null;
  telefone?: string | null;
  email?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  observacao?: string | null;
}

@Injectable()
export class CriarFornecedorUseCase {
  constructor(
    @Inject(FORNECEDOR_REPOSITORY)
    private readonly repo: IFornecedorRepository,
  ) {}

  async execute(input: CriarFornecedorInput): Promise<Fornecedor> {
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao — imutavel.
    if (input.idErp) {
      const dupIdErp = await this.repo.buscarPorIdErp(input.idErp);
      if (dupIdErp) {
        throw new ConflictException(
          'Ja existe fornecedor com esse id do ERP: ' + dupIdErp.id,
        );
      }
    }

    // `codigo_erp` e UNIQUE e e a chave de idempotencia da sincronizacao.
    // Checar antes devolve 409 com mensagem util em vez de deixar estourar
    // violacao crua como 500.
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) {
        throw new ConflictException(
          `Ja existe fornecedor com esse codigo ERP (id: ${dup.id})`,
        );
      }
    }

    const fornecedor = Fornecedor.create({
      idErp: input.idErp ?? null,
      codigoErp: input.codigoErp ?? null,
      nome: input.nome,
      nomeFantasia: input.nomeFantasia ?? null,
      // Default 'juridica', ao contrario de clientes que assume 'fisica':
      // fornecedor de joalheria e quase sempre empresa.
      tipoPessoa: input.tipoPessoa ?? 'juridica',
      // Somente digitos — ver o comentario em utils/normalizadores.
      cpfCnpj: normalizarOpcional(input.cpfCnpj),
      inscricaoEstadual: input.inscricaoEstadual ?? null,
      telefone: normalizarOpcional(input.telefone),
      email: input.email ?? null,
      logradouro: input.logradouro ?? null,
      numero: input.numero ?? null,
      complemento: input.complemento ?? null,
      bairro: input.bairro ?? null,
      cidade: input.cidade ?? null,
      estado: input.estado ? input.estado.toUpperCase() : null,
      cep: normalizarOpcional(input.cep),
      observacao: input.observacao ?? null,
      ativo: true,
    });

    return this.repo.criar(fornecedor);
  }
}
