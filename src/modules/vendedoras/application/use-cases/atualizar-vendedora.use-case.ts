import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashField } from '../../../../shared/database/transformers/encrypted-column.transformer';
import {
  normalizarTelefone,
  variantesTelefone,
} from '../../../clientes/application/utils/normalizadores';
import { Vendedora } from '../../domain/entities/vendedora.entity';
import type {
  StatusDisponibilidadeVendedora,
  TipoVendedora,
} from '../../domain/entities/enums';
import { VENDEDORA_REPOSITORY } from '../../domain/ports/injection-tokens';
import type { IVendedoraRepository } from '../../domain/ports/repositories/vendedora-repository.port';

export interface AtualizarVendedoraInput {
  idErp?: string | null;
  nome?: string;
  tipo?: TipoVendedora;
  ativo?: boolean;
  statusDisponibilidade?: StatusDisponibilidadeVendedora;
  especialidades?: string[];
  // Em plaintext — use case calcula hash novo se mudar.
  email?: string | null;
  /** So tem efeito quando o atual esta vazio. Ver o execute. */
  codigoErp?: string;
  whatsappInterno?: string | null;
  /** O numero corporativo, o que aparece para a cliente. Ver a migracao 39. */
  whatsappExterno?: string | null;
  adminUserId?: string | null;
}

@Injectable()
export class AtualizarVendedoraUseCase {
  constructor(
    @Inject(VENDEDORA_REPOSITORY)
    private readonly repo: IVendedoraRepository,
  ) {}

  async execute(id: string, input: AtualizarVendedoraInput): Promise<Vendedora> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual) throw new NotFoundException(`Vendedora ${id} nao encontrada`);

    const emailMudou = input.email !== undefined && input.email !== atual.email;
    const whatsappMudou =
      input.whatsappInterno !== undefined && input.whatsappInterno !== atual.whatsappInterno;
    const externoMudou =
      input.whatsappExterno !== undefined &&
      input.whatsappExterno !== atual.whatsappExterno;

    // As colunas de hash sao UNIQUE. Sem esta checagem o conflito estourava
    // como 500 com stack do Postgres — o `criar` ja checava, o `atualizar` nao.
    // Todas as formas equivalentes (nono digito, DDI): o mesmo numero em outro
    // formato ja pertence a outra vendedora.
    if (emailMudou && input.email) {
      const dup = await this.repo.buscarPorEmailHash(hashField(input.email));
      if (dup && dup.id !== id) {
        throw new ConflictException('Email ja cadastrado em outra vendedora');
      }
    }
    // OS DOIS NUMEROS, e so os que mudaram. `buscarPorWhatsappHash` olha o
    // interno E o externo de todas as outras — ver o comentario la.
    const paraConferir = [
      whatsappMudou ? input.whatsappInterno : null,
      externoMudou ? input.whatsappExterno : null,
    ];
    for (const numero of paraConferir) {
      if (!numero) continue;
      for (const variante of variantesTelefone(numero)) {
        const dup = await this.repo.buscarPorWhatsappHash(hashField(variante));
        if (dup && dup.id !== id) {
          throw new ConflictException('WhatsApp ja cadastrado em outra vendedora');
        }
      }
    }

    // ====================================================================
    // A CHECAGEM DE "OS DOIS IGUAIS" OLHA O RESULTADO, NAO O QUE VEIO.
    //
    // Um PATCH que so mande o corporativo pode faze-lo colidir com o
    // interno que ja estava gravado — e o campo que colide nem veio na
    // requisicao. Comparar so o input deixaria isso passar para o CHECK do
    // banco, que responderia 500 com stack do Postgres.
    // ====================================================================
    const internoFinal =
      input.whatsappInterno !== undefined
        ? input.whatsappInterno
        : atual.whatsappInterno;
    const externoFinal =
      input.whatsappExterno !== undefined
        ? input.whatsappExterno
        : atual.whatsappExterno;
    if (
      internoFinal &&
      externoFinal &&
      normalizarTelefone(internoFinal) === normalizarTelefone(externoFinal)
    ) {
      throw new ConflictException('O WhatsApp interno e o corporativo precisam ser numeros diferentes');
    }

    // ====================================================================
    // O CODIGO PODE SER TROCADO, E ISSO E SEGURO.
    //
    // A primeira versao travava a troca, com o argumento de que ela
    // "desligaria a carteira em silencio". ESTAVA ERRADO: a FK
    // `fk_clientes_vendedora_codigo` tem ON UPDATE CASCADE, entao o Postgres
    // leva os clientes junto. A migracao 29 ja dizia isso com todas as
    // letras — "se o codigo mudar no ERP, a mudanca propaga em vez de
    // orfanar as referencias".
    //
    // O caso que isto atende: vendedora cadastrada no CRM nasce com `VD-####`
    // e, quando o ERP a trouxer, recebe o codigo de la sem perder a carteira.
    //
    // A unica checagem que fica e a de duplicata, que a coluna UNIQUE ja
    // faria — aqui vira frase em vez de erro do banco.
    // ====================================================================
    const codigoNovo = input.codigoErp?.trim();
    const codigoMudou = Boolean(codigoNovo) && codigoNovo !== atual.codigoErp;
    if (codigoMudou) {
      const dup = await this.repo.buscarPorCodigoErp(codigoNovo!);
      if (dup && dup.id !== id) throw new ConflictException('Codigo ERP ja cadastrado em outra vendedora');
    }

    // ====================================================================
    // O CODIGO TROCA, MAS NUNCA FICA VAZIO.
    //
    // Tres caminhos, nesta ordem:
    //   1. veio um codigo novo  -> usa ele
    //   2. ja tinha um          -> mantem
    //   3. nao tinha nenhum     -> a casa gera um VD-####
    //
    // O passo 3 fecha um buraco: a geracao nasceu so na criacao, entao quem
    // foi cadastrada ANTES dela nunca receberia codigo — e sem codigo nao ha
    // carteira, porque a FK `fk_clientes_vendedora_codigo` liga por aqui.
    //
    // E APAGAR NAO E OPCAO, de proposito: limpar o campo devolve o codigo
    // atual, nao o vazio. Vendedora sem codigo nao pode ter cliente nenhum —
    // apagar seria desligar a carteira dela, e isso nunca e o que se quer
    // dizer com um campo em branco.
    // ====================================================================
    const codigoFinal =
      codigoNovo || atual.codigoErp || (await this.repo.proximoCodigoInterno());

    const novo = Vendedora.create({
      id: atual.id,
      idErp: input.idErp !== undefined ? input.idErp : atual.idErp,
      codigoErp: codigoFinal,
      nome: input.nome ?? atual.nome,
      tipo: input.tipo ?? atual.tipo,
      ativo: input.ativo !== undefined ? input.ativo : atual.ativo,
      statusDisponibilidade: input.statusDisponibilidade ?? atual.statusDisponibilidade,
      especialidades: input.especialidades ?? atual.especialidades,
      email: input.email !== undefined ? input.email : atual.email,
      emailHash: emailMudou
        ? input.email
          ? hashField(input.email)
          : null
        : atual.emailHash,
      whatsappInterno:
        input.whatsappInterno !== undefined ? input.whatsappInterno : atual.whatsappInterno,
      whatsappInternoHash: whatsappMudou
        ? input.whatsappInterno
          ? hashField(normalizarTelefone(input.whatsappInterno))
          : null
        : atual.whatsappInternoHash,
      whatsappExterno:
        input.whatsappExterno !== undefined
          ? input.whatsappExterno
          : atual.whatsappExterno,
      whatsappExternoHash: externoMudou
        ? input.whatsappExterno
          ? hashField(normalizarTelefone(input.whatsappExterno))
          : null
        : atual.whatsappExternoHash,
      adminUserId: input.adminUserId !== undefined ? input.adminUserId : atual.adminUserId,
    });

    return this.repo.atualizar(novo);
  }
}
