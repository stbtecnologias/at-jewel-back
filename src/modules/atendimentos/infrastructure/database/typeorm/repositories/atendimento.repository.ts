import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import type {
  AbrirAtendimentoInput,
  Atendimento,
  CriarInteracaoInput,
  IAtendimentoRepository,
  Interacao,
} from '../../../../domain/ports/repositories/atendimento-repository.port';
import type {
  DesfechoAtendimento,
  StatusInteracao,
  OcasiaoAtendimento,
  TipoInteracao,
} from '../../../../domain/entities/enums';
import { AtendimentoInteracaoOrmEntity } from '../entities/atendimento-interacao.orm-entity';
import { AtendimentoOrmEntity } from '../entities/atendimento.orm-entity';

@Injectable()
export class AtendimentoRepository implements IAtendimentoRepository {
  constructor(
    @InjectRepository(AtendimentoOrmEntity)
    private readonly repo: Repository<AtendimentoOrmEntity>,
    @InjectRepository(AtendimentoInteracaoOrmEntity)
    private readonly interacoes: Repository<AtendimentoInteracaoOrmEntity>,
  ) {}

  async buscarAbertoPorCliente(clienteId: string): Promise<Atendimento | null> {
    const row = await this.repo.findOne({
      where: { clienteId, fechadoEm: IsNull() },
    });
    return row ? paraDominio(row) : null;
  }

  async buscarPorId(id: string): Promise<Atendimento | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? paraDominio(row) : null;
  }

  async abrir(input: AbrirAtendimentoInput): Promise<Atendimento> {
    const salvo = await this.repo.save(
      this.repo.create({
        clienteId: input.clienteId,
        vendedoraId: input.vendedoraId,
        ocasiao: input.ocasiao ?? null,
        abertoEm: new Date(),
      }),
    );
    return paraDominio(salvo);
  }

  async completarOcasiaoSeVazia(
    atendimentoId: string,
    ocasiao: OcasiaoAtendimento,
  ): Promise<void> {
    // O WHERE com IsNull() faz a condicao no proprio UPDATE: sem ler-antes-de-
    // escrever, e sem janela para dois pedidos simultaneos se atropelarem.
    await this.repo.update({ id: atendimentoId, ocasiao: IsNull() }, { ocasiao });
  }

  async criarInteracao(input: CriarInteracaoInput): Promise<Interacao> {
    const salva = await this.interacoes.save(
      this.interacoes.create({
        atendimentoId: input.atendimentoId,
        tipo: input.tipo,
        combinadoEm: input.combinadoEm ?? null,
        notificarEm: input.notificarEm ?? null,
        ocorridoEm: input.ocorridoEm ?? null,
        status: input.status ?? 'PENDENTE',
        relato: input.relato ?? null,
      }),
    );
    return interacaoParaDominio(salva);
  }

  async ultimaInteracao(
    atendimentoId: string,
    tipo: TipoInteracao,
  ): Promise<Interacao | null> {
    const row = await this.interacoes.findOne({
      where: { atendimentoId, tipo },
      order: { criadoEm: 'DESC' },
    });
    return row ? interacaoParaDominio(row) : null;
  }

  async reagendar(
    atendimentoId: string,
    tipo: TipoInteracao,
    notificarEm: Date,
    combinadoEm: Date,
  ): Promise<void> {
    const pendente = await this.interacoes.findOne({
      where: { atendimentoId, tipo, status: 'PENDENTE' as StatusInteracao },
      order: { criadoEm: 'DESC' },
    });
    if (pendente) {
      await this.interacoes.update({ id: pendente.id }, { notificarEm, combinadoEm });
      return;
    }
    await this.interacoes.save(
      this.interacoes.create({
        atendimentoId,
        tipo,
        notificarEm,
        combinadoEm,
        status: 'PENDENTE',
      }),
    );
  }

  async buscarCobrancaAguardando(
    vendedoraId: string,
  ): Promise<{ interacao: Interacao; atendimento: Atendimento } | null> {
    const row = await this.interacoes
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.atendimento', 'a')
      .where('a.vendedora_id = :vendedoraId', { vendedoraId })
      .andWhere('a.fechado_em IS NULL')
      .andWhere("i.tipo = 'COBRANCA'")
      .andWhere("i.status = 'AGUARDANDO_RESPOSTA'")
      .orderBy('i.ocorrido_em', 'DESC')
      .getOne();

    if (!row?.atendimento) return null;
    return {
      interacao: interacaoParaDominio(row),
      atendimento: paraDominio(row.atendimento),
    };
  }

  async fechar(atendimentoId: string, desfecho: DesfechoAtendimento): Promise<void> {
    await this.repo.update({ id: atendimentoId }, { fechadoEm: new Date(), desfecho });
  }

  async listarInteracoes(atendimentoId: string): Promise<Interacao[]> {
    const rows = await this.interacoes.find({
      where: { atendimentoId },
      order: { criadoEm: 'ASC' },
    });
    return rows.map(interacaoParaDominio);
  }

  async listarVencidas(agora: Date, limite: number): Promise<Interacao[]> {
    const rows = await this.interacoes.find({
      where: {
        status: 'PENDENTE' as StatusInteracao,
        notificarEm: LessThanOrEqual(agora),
      },
      // Mais antiga primeiro: se a fila acumulou, o mais atrasado sai antes.
      order: { notificarEm: 'ASC' },
      take: limite,
    });
    return rows.map(interacaoParaDominio);
  }

  async atualizarStatusInteracao(
    id: string,
    status: StatusInteracao,
    ocorridoEm?: Date | null,
  ): Promise<void> {
    await this.interacoes.update(
      { id },
      ocorridoEm === undefined ? { status } : { status, ocorridoEm },
    );
  }
}

function paraDominio(row: AtendimentoOrmEntity): Atendimento {
  return {
    id: row.id,
    clienteId: row.clienteId,
    vendedoraId: row.vendedoraId,
    ocasiao: row.ocasiao,
    abertoEm: row.abertoEm,
    fechadoEm: row.fechadoEm,
    desfecho: row.desfecho,
  };
}

function interacaoParaDominio(row: AtendimentoInteracaoOrmEntity): Interacao {
  return {
    id: row.id,
    atendimentoId: row.atendimentoId,
    tipo: row.tipo,
    combinadoEm: row.combinadoEm,
    notificarEm: row.notificarEm,
    ocorridoEm: row.ocorridoEm,
    status: row.status,
    relato: row.relato,
    criadoEm: row.criadoEm,
  };
}
