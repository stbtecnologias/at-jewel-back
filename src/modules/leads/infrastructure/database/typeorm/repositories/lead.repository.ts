import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  STATUS_LEAD_EM_ABERTO,
  type AtualizarLeadInput,
  type CriarLeadInput,
  type ILeadRepository,
  type Lead,
  type PanoramaDeLeads,
  type StatusLeadVendedora,
} from '../../../../domain/ports/repositories/lead-repository.port';
import type { EstadoConversaAgente } from '../../../../../clientes/domain/entities/enums';
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

  /**
   * PELO ORM, e nao por SQL cru: `whatsapp` e coluna cifrada, e uma consulta
   * crua devolveria o texto embaralhado. Quem decifra e o transformer, que so
   * roda no caminho do ORM.
   */
  async listarPorVendedora(
    vendedoraCodigo: string,
    limite: number,
    apenasAbertos = true,
  ): Promise<Lead[]> {
    const rows = await this.repo.find({
      where: {
        vendedoraAprovadaCodigo: vendedoraCodigo,
        // ================================================================
        // O RECORTE PADRAO — migracao 60.
        //
        // `In` e nao `Not(In)`: lead antigo, de antes da migracao, poderia
        // ter status NULL e um `Not` o traria de volta para a fila. Dizer
        // quais entram e mais seguro que dizer quais saem.
        //
        // (Na pratica a migracao 60 nao deixou nenhum NULL para tras — mas a
        // consulta nao deveria depender disso.)
        // ================================================================
        ...(apenasAbertos
          ? { statusVendedora: In([...STATUS_LEAD_EM_ABERTO]) }
          : {}),
      },
      order: { direcionadoVendedoraEm: 'DESC' },
      take: limite,
    });
    return rows.map(paraDominio);
  }

  async atualizarStatusVendedora(
    id: string,
    status: StatusLeadVendedora,
    observacao?: string | null,
  ): Promise<Lead> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Lead nao encontrado: ' + id);

    row.statusVendedora = status;
    // O carimbo anda SEMPRE que o status e escrito, mesmo que seja o mesmo
    // valor de antes: "ela reafirmou hoje" e informacao, e o CHECK exige.
    row.statusVendedoraEm = new Date();
    if (observacao !== undefined) row.observacaoVendedora = observacao;

    return paraDominio(await this.repo.save(row));
  }

  async panoramaDeLeads(): Promise<PanoramaDeLeads> {
    // SO CONTAGEM ATRAVESSA AQUI. Nenhuma coluna cifrada entra no SQL cru.
    const porEstado: { estado: EstadoConversaAgente; quantos: string }[] =
      await this.repo.manager.query(
        `SELECT estado, count(*)::int AS quantos
           FROM leads
          GROUP BY estado`,
      );

    const porVendedora: { codigo: string; quantos: string }[] =
      await this.repo.manager.query(
        `SELECT vendedora_aprovada_codigo AS codigo, count(*)::int AS quantos
           FROM leads
          WHERE vendedora_aprovada_codigo IS NOT NULL
          GROUP BY vendedora_aprovada_codigo
          ORDER BY count(*) DESC`,
      );

    const total = porEstado.reduce((s, l) => s + Number(l.quantos), 0);
    return {
      porEstado: porEstado.map((l) => ({
        estado: l.estado,
        quantos: Number(l.quantos),
      })),
      porVendedora: porVendedora.map((l) => ({
        codigo: l.codigo,
        quantos: Number(l.quantos),
      })),
      total,
    };
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
    statusVendedora: row.statusVendedora,
    statusVendedoraEm: row.statusVendedoraEm,
    observacaoVendedora: row.observacaoVendedora,
    criadoEm: row.criadoEm,
  };
}
