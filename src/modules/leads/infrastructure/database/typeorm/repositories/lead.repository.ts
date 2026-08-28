import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type {
  AtualizarLeadInput,
  CriarLeadInput,
  ILeadRepository,
  Lead,
} from '../../../../domain/ports/repositories/lead-repository.port';
import { LeadOrmEntity } from '../entities/lead.orm-entity';

@Injectable()
export class LeadRepository implements ILeadRepository {
  constructor(
    @InjectRepository(LeadOrmEntity)
    private readonly repo: Repository<LeadOrmEntity>,
  ) {}

  async buscarAbertoPorHash(whatsappHash: string): Promise<Lead | null> {
    const row = await this.repo.findOne({
      where: { whatsappHash, fechadoEm: IsNull() },
    });
    return row ? paraDominio(row) : null;
  }

  async buscarUltimoPorHash(whatsappHash: string): Promise<Lead | null> {
    const row = await this.repo.findOne({
      where: { whatsappHash },
      order: { criadoEm: 'DESC' },
    });
    return row ? paraDominio(row) : null;
  }

  async buscarPorId(id: string): Promise<Lead | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? paraDominio(row) : null;
  }

  async criar(input: CriarLeadInput): Promise<Lead> {
    const agora = new Date();
    const row = this.repo.create({
      whatsapp: input.whatsapp,
      whatsappHash: input.whatsappHash,
      nome: input.nome ?? null,
      apelido: input.apelido ?? null,
      origemContato: input.origemContato ?? null,
      ocasiao: input.ocasiao ?? null,
      produtosDesejados: input.produtosDesejados ?? null,
      resumoTriagem: input.resumoTriagem ?? null,
      vendedoraSugeridaCodigo: input.vendedoraSugeridaCodigo ?? null,
      estado: 'TRIAGE_IN_PROGRESS',
      estadoAtualizadoEm: agora,
      // `chk_lead_vinculo` exige os dois juntos ou nenhum dos dois.
      clienteId: input.clienteId ?? null,
      vinculadoEm: input.clienteId ? agora : null,
    });
    return paraDominio(await this.repo.save(row));
  }

  async atualizar(id: string, input: AtualizarLeadInput): Promise<Lead> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Lead nao encontrado: ' + id);

    // `undefined` nao mexe no campo; `null` apaga. Distincao que importa:
    // a triagem preenche as coisas fora de ordem, e um PATCH parcial nao pode
    // zerar o que ja tinha sido descoberto.
    const aplicar = <K extends keyof LeadOrmEntity>(
      chave: K,
      valor: LeadOrmEntity[K] | undefined,
    ) => {
      if (valor !== undefined) row[chave] = valor;
    };

    aplicar('nome', input.nome);
    aplicar('apelido', input.apelido);
    aplicar('origemContato', input.origemContato);
    aplicar('ocasiao', input.ocasiao);
    aplicar('produtosDesejados', input.produtosDesejados);
    aplicar('resumoTriagem', input.resumoTriagem);
    aplicar('vendedoraSugeridaCodigo', input.vendedoraSugeridaCodigo);
    aplicar('direcionadoGestaoEm', input.direcionadoGestaoEm);

    // O carimbo do estado so anda quando o estado anda.
    if (input.estado !== undefined && input.estado !== row.estado) {
      row.estado = input.estado;
      row.estadoAtualizadoEm = new Date();
    }

    return paraDominio(await this.repo.save(row));
  }

  async vincularCliente(id: string, clienteId: string): Promise<Lead> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Lead nao encontrado: ' + id);

    row.clienteId = clienteId;
    row.vinculadoEm = new Date();
    return paraDominio(await this.repo.save(row));
  }

  async encaminhar(id: string, vendedoraCodigo: string): Promise<Lead> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Lead nao encontrado: ' + id);

    const agora = new Date();
    row.vendedoraAprovadaCodigo = vendedoraCodigo;
    row.direcionadoVendedoraEm = agora;
    row.estado = 'IN_HUMAN_SERVICE';
    row.estadoAtualizadoEm = agora;
    // Encaminhar encerra a triagem: o numero fica livre para um proximo
    // atendimento, e este vira historico.
    row.fechadoEm = agora;

    return paraDominio(await this.repo.save(row));
  }

  async listarAguardandoGestao(limite: number): Promise<Lead[]> {
    const rows = await this.repo.find({
      where: { estado: 'READY_FOR_ROUTING', fechadoEm: IsNull() },
      order: { criadoEm: 'ASC' },
      take: limite,
    });
    return rows.map(paraDominio);
  }
}

function paraDominio(row: LeadOrmEntity): Lead {
  return {
    id: row.id,
    nome: row.nome,
    apelido: row.apelido,
    whatsapp: row.whatsapp,
    origemContato: row.origemContato,
    ocasiao: row.ocasiao,
    produtosDesejados: row.produtosDesejados,
    resumoTriagem: row.resumoTriagem,
    vendedoraSugeridaCodigo: row.vendedoraSugeridaCodigo,
    estado: row.estado,
    estadoAtualizadoEm: row.estadoAtualizadoEm,
    clienteId: row.clienteId,
    vinculadoEm: row.vinculadoEm,
    direcionadoGestaoEm: row.direcionadoGestaoEm,
    vendedoraAprovadaCodigo: row.vendedoraAprovadaCodigo,
    direcionadoVendedoraEm: row.direcionadoVendedoraEm,
    fechadoEm: row.fechadoEm,
    criadoEm: row.criadoEm,
  };
}
