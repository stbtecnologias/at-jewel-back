import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import {
  normalizarTelefone,
  variantesTelefone,
} from '../../../clientes/application/utils/normalizadores';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type { TipoVendedora } from '../../domain/entities/enums';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

export interface CriarVendedoraInput {
  idErp?: string | null;
  codigoErp?: string | null;
  nome: string;
  tipo?: TipoVendedora;
  especialidades?: string[];
  email?: string | null;
  whatsappInterno?: string | null;
  /** O numero corporativo, o que aparece para a cliente. Ver a migracao 39. */
  whatsappExterno?: string | null;
  adminUserId?: string | null;
}

@Injectable()
export class CriarVendedoraUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(input: CriarVendedoraInput): Promise<Vendedora> {
    // `id_erp` e a IDENTIDADE no ERP e a chave da sincronizacao — imutavel.
    if (input.idErp) {
      const dupIdErp = await this.repo.buscarPorIdErp(input.idErp);
      if (dupIdErp) {
        throw new ConflictException(
          'Ja existe vendedora com esse id do ERP: ' + dupIdErp.id,
        );
      }
    }

    const emailHash = input.email ? hashField(input.email) : null;
    const whatsappInternoHash = input.whatsappInterno
      ? hashField(normalizarTelefone(input.whatsappInterno))
      : null;
    const whatsappExternoHash = input.whatsappExterno
      ? hashField(normalizarTelefone(input.whatsappExterno))
      : null;

    // ====================================================================
    // O MESMO NUMERO NOS DOIS CAMPOS NAO E ERRO INOFENSIVO DE DIGITACAO.
    //
    // Significaria que o celular PESSOAL dela esta exposto a cliente, ou
    // que o corporativo virou canal da IA sem ninguem ter decidido isso.
    // O banco tem um CHECK para isso (ck_vendedoras_whatsapps_distintos);
    // recusar aqui e o que da uma frase em vez de um erro de constraint.
    // ====================================================================
    if (whatsappInternoHash && whatsappInternoHash === whatsappExternoHash) {
      throw new ConflictException('O WhatsApp interno e o corporativo precisam ser numeros diferentes');
    }

    if (emailHash) {
      const dup = await this.repo.buscarPorEmailHash(emailHash);
      if (dup) throw new ConflictException('Email ja cadastrado em outra vendedora');
    }
    // OS DOIS NUMEROS SAO CONFERIDOS, e contra os dois campos de todas as
    // outras: `buscarPorWhatsappHash` olha interno e externo. Sem isso, o
    // corporativo de uma poderia colidir com o pessoal de outra, e a
    // identificacao por telefone escolheria por ordem de consulta.
    for (const numero of [input.whatsappInterno, input.whatsappExterno]) {
      if (!numero) continue;
      // Todas as formas equivalentes (nono digito, DDI): o mesmo numero em dois
      // formatos criaria duas vendedoras, e a Elena responderia so a uma delas.
      for (const variante of variantesTelefone(numero)) {
        const dup = await this.repo.buscarPorWhatsappHash(hashField(variante));
        if (dup) throw new ConflictException('WhatsApp ja cadastrado em outra vendedora');
      }
    }
    if (input.codigoErp) {
      const dup = await this.repo.buscarPorCodigoErp(input.codigoErp);
      if (dup) throw new ConflictException('Codigo ERP ja cadastrado');
    }

    // ====================================================================
    // SEM CODIGO INFORMADO, A CASA GERA UM.
    //
    // Nao e enfeite: a FK `fk_clientes_vendedora_codigo` liga cliente a
    // vendedora POR ESTE CAMPO. Vendedora sem codigo nao pode ter carteira,
    // e o cadastro passou a nascer no CRM — onde nao ha codigo de ERP para
    // informar.
    //
    // O prefixo `AT-` diz a origem de relance: o que comeca assim e nosso.
    // Quando o ERP trouxer o codigo real dela, trocar e seguro — a FK tem
    // ON UPDATE CASCADE e a carteira vai junto.
    // ====================================================================
    const codigo =
      input.codigoErp?.trim() || (await this.repo.proximoCodigoInterno());

    const vendedora = Vendedora.create({
      idErp: input.idErp ?? null,
      codigoErp: codigo,
      nome: input.nome,
      tipo: input.tipo ?? 'LOCAL',
      ativo: true,
      statusDisponibilidade: 'DISPONIVEL',
      especialidades: input.especialidades ?? [],
      email: input.email ?? null,
      emailHash,
      whatsappInterno: input.whatsappInterno ?? null,
      whatsappInternoHash,
      whatsappExterno: input.whatsappExterno ?? null,
      whatsappExternoHash,
      adminUserId: input.adminUserId ?? null,
    });

    return this.repo.criar(vendedora);
  }
}
