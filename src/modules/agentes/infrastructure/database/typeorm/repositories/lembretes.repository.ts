import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import type {
  ILembretesRepository,
  Lembrete,
  LembreteVencido,
} from '../../../../domain/ports/repositories/lembretes-repository.port';
import { LembreteOrmEntity } from '../entities/lembrete.orm-entity';

/** Os que ainda importam para o dono. Ver `listar` na porta. */
const ABERTOS = ['PENDENTE', 'PERDIDO'] as const;

@Injectable()
export class LembretesRepository implements ILembretesRepository {
  constructor(
    @InjectRepository(LembreteOrmEntity)
    private readonly repo: Repository<LembreteOrmEntity>,
  ) {}

  async guardar(
    donoId: string,
    texto: string,
    quando: Date,
  ): Promise<Lembrete> {
    const salvo = await this.repo.save(
      this.repo.create({ donoId, texto, quando, estado: 'PENDENTE' }),
    );
    return paraDominio(salvo);
  }

  async listar(donoId: string): Promise<Lembrete[]> {
    const linhas = await this.repo.find({
      where: { donoId, estado: In([...ABERTOS]) },
      order: { quando: 'ASC' },
    });
    return linhas.map(paraDominio);
  }

  contarPendentes(donoId: string): Promise<number> {
    return this.repo.count({ where: { donoId, estado: 'PENDENTE' } });
  }

  async remarcar(
    id: string,
    donoId: string,
    quando: Date,
  ): Promise<boolean> {
    // ====================================================================
    // O DONO ENTRA NO WHERE, e nao num `if` antes.
    //
    // Assim um id que vaze — por log, por print, por engano — nao serve para
    // nada na mao de outra pessoa: a consulta simplesmente nao acha a linha.
    // Conferir depois de buscar daria o mesmo resultado hoje e deixaria de
    // dar no dia em que alguem acrescentasse um caminho novo.
    //
    // `PERDIDO` volta a `PENDENTE`: e o caso de "perdi aquele, joga para
    // amanha". ENVIADO e CANCELADO nao entram — remarcar o que ja aconteceu
    // seria criar um lembrete novo sem dizer.
    // ====================================================================
    const r = await this.repo.update(
      { id, donoId, estado: In([...ABERTOS]) },
      { quando, estado: 'PENDENTE' },
    );
    return (r.affected ?? 0) > 0;
  }

  async cancelar(id: string, donoId: string): Promise<boolean> {
    const r = await this.repo.update(
      { id, donoId, estado: In([...ABERTOS]) },
      { estado: 'CANCELADO' },
    );
    return (r.affected ?? 0) > 0;
  }

  async vencidos(agora: Date, limite: number): Promise<LembreteVencido[]> {
    const linhas = await this.repo.find({
      where: { estado: 'PENDENTE', quando: LessThanOrEqual(agora) },
      // Mais atrasado primeiro — ver o motivo na porta.
      order: { quando: 'ASC' },
      take: limite,
    });
    return linhas.map((o) => ({
      id: o.id,
      donoId: o.donoId,
      texto: o.texto,
      quando: o.quando,
    }));
  }

  async fechar(id: string, estado: 'ENVIADO' | 'PERDIDO'): Promise<void> {
    // `enviadoEm` so no ENVIADO: em PERDIDO nada foi enviado, e gravar a hora
    // ali faria a coluna mentir para quem for investigar depois.
    await this.repo.update(
      { id },
      estado === 'ENVIADO'
        ? { estado, enviadoEm: new Date() }
        : { estado },
    );
  }
}

function paraDominio(o: LembreteOrmEntity): Lembrete {
  return { id: o.id, texto: o.texto, quando: o.quando, estado: o.estado };
}
