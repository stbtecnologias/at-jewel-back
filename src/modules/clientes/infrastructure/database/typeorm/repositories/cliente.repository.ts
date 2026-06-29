import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { Cliente } from '../../../../domain/entities/cliente.entity';
import { ClientePerfil } from '../../../../domain/entities/cliente-perfil.entity';
import {
  FiltroCliente,
  FiltroDemografico,
  IClienteRepository,
  TierCliente,
} from '../../../../domain/ports/repositories/cliente-repository.port';
import { ClienteOrmEntity } from '../entities/cliente.orm-entity';
import { ClientePerfilOrmEntity } from '../entities/cliente-perfil.orm-entity';

@Injectable()
export class ClienteRepository implements IClienteRepository {
  constructor(
    @InjectRepository(ClienteOrmEntity)
    private readonly repo: Repository<ClienteOrmEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async distribuicaoTiers(filtro?: FiltroDemografico): Promise<TierCliente[]> {
    // Faixas por nº de compras concluidas. Agregado, sem PII. O recorte
    // demografico (sexo/origem/faixa) vem de clientes_perfil; o periodo filtra
    // por clientes CRIADOS no intervalo (c.criado_em). Tudo parametrizado ($n).
    const params: unknown[] = [];
    let whereDemo = '';
    const precisaPerfil =
      filtro?.sexo != null ||
      filtro?.origem != null ||
      filtro?.faixaEtaria != null ||
      filtro?.idadeMin != null ||
      filtro?.idadeMax != null;
    if (filtro?.dataInicio && filtro?.dataFim) {
      params.push(filtro.dataInicio, filtro.dataFim);
      whereDemo += ` AND c.criado_em BETWEEN $${params.length - 1} AND $${params.length}`;
    }
    if (filtro?.sexo != null) {
      params.push(filtro.sexo);
      whereDemo += ` AND COALESCE(cp.sexo::text, 'NAO_INFORMADO') = $${params.length}`;
    }
    if (filtro?.origem != null) {
      params.push(filtro.origem);
      whereDemo += ` AND COALESCE(cp.origem_contato::text, 'Nao informado') = $${params.length}`;
    }
    if (filtro?.faixaEtaria != null) {
      params.push(filtro.faixaEtaria);
      whereDemo += ` AND COALESCE(NULLIF(cp.faixa_etaria, ''), 'Nao informado') = $${params.length}`;
    }
    if (filtro?.idadeMin != null) {
      params.push(filtro.idadeMin);
      whereDemo += ` AND cp.idade >= $${params.length}`;
    }
    if (filtro?.idadeMax != null) {
      params.push(filtro.idadeMax);
      whereDemo += ` AND cp.idade <= $${params.length}`;
    }
    const joinCp = precisaPerfil
      ? ' LEFT JOIN clientes_perfil cp ON cp.cliente_id = c.id'
      : '';
    const rows = await this.dataSource.query<{ tier: string; ordem: number; total: number }[]>(
      `
      WITH compras AS (
        SELECT c.id, COUNT(v.id) AS n
        FROM clientes c
        LEFT JOIN vendas v ON v.cliente_id = c.id AND v.status = 'concluida'${joinCp}
        WHERE TRUE${whereDemo}
        GROUP BY c.id
      )
      SELECT t.tier, t.ordem, COUNT(*)::int AS total
      FROM compras
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN n = 0 THEN 'Sem compras'
          WHEN n <= 2 THEN 'Bronze'
          WHEN n <= 5 THEN 'Prata'
          ELSE 'Ouro' END AS tier,
          CASE
          WHEN n = 0 THEN 0
          WHEN n <= 2 THEN 1
          WHEN n <= 5 THEN 2
          ELSE 3 END AS ordem
      ) t
      GROUP BY t.tier, t.ordem
      ORDER BY t.ordem
      `,
      params,
    );
    return rows.map((r) => ({ tier: r.tier, total: r.total }));
  }

  async criarComPerfil(cliente: Cliente, perfil: ClientePerfil): Promise<Cliente> {
    return this.dataSource.transaction(async (manager) => {
      const clienteRepo = manager.getRepository(ClienteOrmEntity);
      const perfilRepo = manager.getRepository(ClientePerfilOrmEntity);

      const clienteRow = clienteRepo.create(this.toOrm(cliente));
      const clienteSalvo = await clienteRepo.save(clienteRow);

      const perfilRow = perfilRepo.create({
        ...this.perfilToOrm(perfil),
        clienteId: clienteSalvo.id,
      });
      const perfilSalvo = await perfilRepo.save(perfilRow);

      return this.toDomain(clienteSalvo, perfilSalvo);
    });
  }

  async buscarPorId(
    id: string,
    opts?: { incluirPerfil?: boolean },
  ): Promise<Cliente | null> {
    const row = await this.repo.findOne({
      where: { id },
      relations: opts?.incluirPerfil ? { perfil: true } : {},
    });
    return row ? this.toDomain(row, row.perfil) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Cliente | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorTelefone1Hash(hash: string): Promise<Cliente | null> {
    const row = await this.repo.findOne({ where: { telefone1Hash: hash } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorEmailHash(hash: string): Promise<Cliente | null> {
    const row = await this.repo.findOne({ where: { emailHash: hash } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroCliente): Promise<Cliente[]> {
    const where: FindOptionsWhere<ClienteOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.tabelaPreco !== undefined) where.tabelaPreco = filtros.tabelaPreco;
    if (filtros.codigoErp !== undefined) where.codigoErp = filtros.codigoErp;
    if (filtros.vendedoraCodigoErp !== undefined) {
      where.vendedoraCodigoErp = filtros.vendedoraCodigoErp;
    }

    const rows = await this.repo.find({ where, order: { criadoEm: 'DESC' } });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(cliente: Cliente): Promise<Cliente> {
    if (!cliente.id) {
      throw new Error('Cliente sem id nao pode ser atualizado');
    }
    await this.repo.update(cliente.id, this.toOrm(cliente));
    const refreshed = await this.repo.findOneByOrFail({ id: cliente.id });
    return this.toDomain(refreshed);
  }

  // Mapeamento Domain -> ORM. Note que telefone/email cifrados sao passados
  // em PLAINTEXT — o transformer cifra automaticamente no INSERT/UPDATE.
  // Os hashes vao em texto puro (nao sao cifrados).
  private toOrm(c: Cliente): Partial<ClienteOrmEntity> {
    return {
      codigoErp: c.codigoErp,
      nome: c.nome,
      nomeFantasia: c.nomeFantasia,
      tipoPessoa: c.tipoPessoa,
      tabelaPreco: c.tabelaPreco,
      telefone1: c.telefone1,
      telefone1Hash: c.telefone1Hash,
      telefone2: c.telefone2,
      email: c.email,
      emailHash: c.emailHash,
      ativo: c.ativo,
      limiteCredito: c.limiteCredito,
      observacaoGeral: c.observacaoGeral,
      observacaoCredito: c.observacaoCredito,
      vendedoraCodigoErp: c.vendedoraCodigoErp,
    };
  }

  private perfilToOrm(p: ClientePerfil): Partial<ClientePerfilOrmEntity> {
    return {
      whatsapp: p.whatsapp,
      whatsappHash: p.whatsappHash,
      origemContato: p.origemContato,
      estadoConversa: p.estadoConversa,
      estadoAtualizadoEm: p.estadoAtualizadoEm ?? new Date(),
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
      sexo: p.sexo,
      faixaEtaria: p.faixaEtaria,
      idade: p.idade,
    };
  }

  private toDomain(
    c: ClienteOrmEntity,
    perfilRow?: ClientePerfilOrmEntity | null,
  ): Cliente {
    return Cliente.create({
      id: c.id,
      codigoErp: c.codigoErp,
      nome: c.nome,
      nomeFantasia: c.nomeFantasia,
      tipoPessoa: c.tipoPessoa,
      tabelaPreco: c.tabelaPreco,
      telefone1: c.telefone1,
      telefone1Hash: c.telefone1Hash,
      telefone2: c.telefone2,
      email: c.email,
      emailHash: c.emailHash,
      ativo: c.ativo,
      // Decimal vem como string do Postgres — converte preservando null.
      limiteCredito: c.limiteCredito != null ? Number(c.limiteCredito) : null,
      observacaoGeral: c.observacaoGeral,
      observacaoCredito: c.observacaoCredito,
      vendedoraCodigoErp: c.vendedoraCodigoErp,
      criadoEm: c.criadoEm,
      atualizadoEm: c.atualizadoEm,
      perfil: perfilRow ? this.perfilToDomain(perfilRow) : null,
    });
  }

  private perfilToDomain(p: ClientePerfilOrmEntity): ClientePerfil {
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
      sexo: p.sexo,
      faixaEtaria: p.faixaEtaria,
      idade: p.idade != null ? Number(p.idade) : null,
      criadoEm: p.criadoEm,
      atualizadoEm: p.atualizadoEm,
    });
  }
}
