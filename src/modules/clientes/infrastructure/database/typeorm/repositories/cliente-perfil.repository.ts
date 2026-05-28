import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientePerfil } from '../../../../domain/entities/cliente-perfil.entity';
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
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    });
  }
}
