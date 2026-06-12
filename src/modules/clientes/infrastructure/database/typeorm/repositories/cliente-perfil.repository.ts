import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientePerfil } from '../../../../domain/entities/cliente-perfil.entity';
import { EstadoConversaAgente } from '../../../../domain/entities/enums';
import { IClientePerfilRepository } from '../../../../domain/ports/repositories/cliente-perfil-repository.port';
import { ClientePerfilOrmEntity } from '../entities/cliente-perfil.orm-entity';

@Injectable()
export class ClientePerfilRepository implements IClientePerfilRepository {
  constructor(
    @InjectRepository(ClientePerfilOrmEntity)
    private readonly repo: Repository<ClientePerfilOrmEntity>,
  ) {}

  async buscarPorClienteId(clienteId: string): Promise<ClientePerfil | null> {
    const row = await this.repo.findOne({ where: { clienteId } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorWhatsappHash(hash: string): Promise<ClientePerfil | null> {
    const row = await this.repo.findOne({ where: { whatsappHash: hash } });
    return row ? this.toDomain(row) : null;
  }

  async listarPorEstados(
    estados: EstadoConversaAgente[],
    limit: number,
  ): Promise<ClientePerfil[]> {
    // Filtro por estado + ordenacao por estado_atualizado_em ASC. Suportado
    // pelo indice composto idx_perfil_estado_sla (estado_conversa,
    // estado_atualizado_em) — ver migracao 12. Seleciona apenas as colunas
    // necessarias para a view de SLA (sem tocar campos cifrados/PII).
    //
    // Exclusao do relogio parado: linhas em IN_HUMAN_SERVICE que JA tem
    // primeiro_contato_em preenchido nao precisam mais de monitoramento — a
    // vendedora ja fez o primeiro contato e o SLA encerrou. Os demais estados
    // (READY_FOR_ROUTING, WAITING_OWNER_APPROVAL) nao sao afetados.
    const rows = await this.repo
      .createQueryBuilder('perfil')
      .select([
        'perfil.clienteId',
        'perfil.estadoConversa',
        'perfil.estadoAtualizadoEm',
        'perfil.urgencia',
        'perfil.vendedoraSugeridaCodigo',
        'perfil.vendedoraAprovadaCodigo',
        'perfil.primeiroContatoEm',
      ])
      .where('perfil.estadoConversa IN (:...estados)', { estados })
      .andWhere(
        "NOT (perfil.estadoConversa = 'IN_HUMAN_SERVICE' AND perfil.primeiroContatoEm IS NOT NULL)",
      )
      .orderBy('perfil.estadoAtualizadoEm', 'ASC')
      .take(limit)
      .getMany();
    return rows.map((row) => this.toDomain(row));
  }

  async atualizar(perfil: ClientePerfil): Promise<ClientePerfil> {
    await this.repo.update(perfil.clienteId, this.toOrm(perfil));
    const refreshed = await this.repo.findOneByOrFail({ clienteId: perfil.clienteId });
    return this.toDomain(refreshed);
  }

  async deletar(clienteId: string): Promise<void> {
    await this.repo.delete({ clienteId });
  }

  private toOrm(p: ClientePerfil): Partial<ClientePerfilOrmEntity> {
    return {
      whatsapp: p.whatsapp,
      whatsappHash: p.whatsappHash,
      origemContato: p.origemContato,
      estadoConversa: p.estadoConversa,
      estadoAtualizadoEm: p.estadoAtualizadoEm,
      tipoCompra: p.tipoCompra,
      urgencia: p.urgencia,
      dataPretendidaCompra: p.dataPretendidaCompra,
      ticketEstimado: p.ticketEstimado,
      intencaoCompra: p.intencaoCompra,
      wishlist: p.wishlist,
      nivelConhecimento: p.nivelConhecimento,
      vendedoraSugeridaCodigo: p.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: p.vendedoraAprovadaCodigo,
      resumoTriagem: p.resumoTriagem,
      notasInternas: p.notasInternas,
      tags: p.tags ?? [],
      scorePerfil: p.scorePerfil,
      motivacaoCompra: p.motivacaoCompra,
      primeiroContatoEm: p.primeiroContatoEm,
      sexo: p.sexo,
      faixaEtaria: p.faixaEtaria,
    };
  }

  private toDomain(p: ClientePerfilOrmEntity): ClientePerfil {
    return ClientePerfil.create({
      clienteId: p.clienteId,
      whatsapp: p.whatsapp,
      whatsappHash: p.whatsappHash,
      origemContato: p.origemContato,
      estadoConversa: p.estadoConversa,
      estadoAtualizadoEm: p.estadoAtualizadoEm,
      tipoCompra: p.tipoCompra,
      urgencia: p.urgencia,
      dataPretendidaCompra: p.dataPretendidaCompra,
      ticketEstimado: p.ticketEstimado != null ? Number(p.ticketEstimado) : null,
      intencaoCompra: p.intencaoCompra,
      wishlist: p.wishlist,
      nivelConhecimento: p.nivelConhecimento,
      vendedoraSugeridaCodigo: p.vendedoraSugeridaCodigo,
      vendedoraAprovadaCodigo: p.vendedoraAprovadaCodigo,
      resumoTriagem: p.resumoTriagem,
      notasInternas: p.notasInternas,
      tags: p.tags ?? [],
      scorePerfil: p.scorePerfil,
      motivacaoCompra: p.motivacaoCompra,
      primeiroContatoEm: p.primeiroContatoEm,
      sexo: p.sexo,
      faixaEtaria: p.faixaEtaria,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    });
  }
}
