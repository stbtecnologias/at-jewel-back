import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Fornecedor } from '../../../../domain/entities/fornecedor.entity';
import {
  FiltroFornecedor,
  IFornecedorRepository,
} from '../../../../domain/ports/repositories/fornecedor-repository.port';
import { FornecedorOrmEntity } from '../entities/fornecedor.orm-entity';

@Injectable()
export class FornecedorRepository implements IFornecedorRepository {
  constructor(
    @InjectRepository(FornecedorOrmEntity)
    private readonly repo: Repository<FornecedorOrmEntity>,
  ) {}

  async criar(f: Fornecedor): Promise<Fornecedor> {
    const row = this.repo.create(this.toOrm(f));
    const salvo = await this.repo.save(row);
    return this.toDomain(salvo);
  }

  async buscarPorId(id: string): Promise<Fornecedor | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async buscarPorCodigoErp(codigoErp: string): Promise<Fornecedor | null> {
    const row = await this.repo.findOne({ where: { codigoErp } });
    return row ? this.toDomain(row) : null;
  }

  async listar(filtros: FiltroFornecedor): Promise<Fornecedor[]> {
    const where: FindOptionsWhere<FornecedorOrmEntity> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.tipoPessoa) where.tipoPessoa = filtros.tipoPessoa;
    if (filtros.cidade) where.cidade = ILike(filtros.cidade);
    if (filtros.estado) where.estado = filtros.estado.toUpperCase();

    // A busca textual cobre nome E nome fantasia — o ERP preenche os dois de
    // forma irregular, e quem procura "Antica" pode ter em mente qualquer um.
    // Duas clausulas where em array viram OR no TypeORM; os demais filtros
    // precisam ser repetidos em cada ramo para nao virarem opcionais.
    const opcoes = filtros.busca
      ? [
          { ...where, nome: ILike(`%${filtros.busca}%`) },
          { ...where, nomeFantasia: ILike(`%${filtros.busca}%`) },
        ]
      : where;

    const rows = await this.repo.find({ where: opcoes, order: { nome: 'ASC' } });
    return rows.map((r) => this.toDomain(r));
  }

  async atualizar(f: Fornecedor): Promise<Fornecedor> {
    if (!f.id) throw new Error('Fornecedor sem id nao pode ser atualizado');
    await this.repo.update(f.id, this.toOrm(f));
    const atualizado = await this.repo.findOneByOrFail({ id: f.id });
    return this.toDomain(atualizado);
  }

  async remover(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  // Domain -> ORM. Os campos cifrados vao em PLAINTEXT: o transformer cifra
  // no INSERT/UPDATE. Mesmo padrao de clientes e vendedoras.
  private toOrm(f: Fornecedor): Partial<FornecedorOrmEntity> {
    return {
      codigoErp: f.codigoErp,
      nome: f.nome,
      nomeFantasia: f.nomeFantasia,
      tipoPessoa: f.tipoPessoa,
      cpfCnpj: f.cpfCnpj,
      inscricaoEstadual: f.inscricaoEstadual,
      telefone: f.telefone,
      email: f.email,
      logradouro: f.logradouro,
      numero: f.numero,
      complemento: f.complemento,
      bairro: f.bairro,
      cidade: f.cidade,
      estado: f.estado,
      cep: f.cep,
      observacao: f.observacao,
      ativo: f.ativo,
    };
  }

  private toDomain(o: FornecedorOrmEntity): Fornecedor {
    return Fornecedor.create({
      id: o.id,
      codigoErp: o.codigoErp,
      nome: o.nome,
      nomeFantasia: o.nomeFantasia,
      tipoPessoa: o.tipoPessoa,
      cpfCnpj: o.cpfCnpj,
      inscricaoEstadual: o.inscricaoEstadual,
      telefone: o.telefone,
      email: o.email,
      logradouro: o.logradouro,
      numero: o.numero,
      complemento: o.complemento,
      bairro: o.bairro,
      cidade: o.cidade,
      estado: o.estado,
      cep: o.cep,
      observacao: o.observacao,
      ativo: o.ativo,
      criadoEm: o.criadoEm,
      atualizadoEm: o.atualizadoEm,
    });
  }
}
