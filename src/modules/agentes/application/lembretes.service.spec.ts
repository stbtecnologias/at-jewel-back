import {
  LembretesService,
  TETO_PENDENTES,
  TETO_TEXTO,
} from './lembretes.service';
import type {
  EstadoLembrete,
  ILembretesRepository,
  Lembrete,
  LembreteVencido,
} from '../domain/ports/repositories/lembretes-repository.port';

/**
 * OS LEMBRETES PESSOAIS — 30/09/2026.
 *
 * ==========================================================================
 * ESTE ARQUIVO EXISTE, ANTES DE TUDO, PARA GUARDAR O ISOLAMENTO.
 *
 * Um lembrete e de UMA pessoa. A auditoria de 30/09 achou quatro vezes a
 * mesma forma de erro no projeto — o recorte aplicado num caminho e esquecido
 * no vizinho —, e aqui ha tres caminhos: listar, remarcar e cancelar. Os tres
 * sao testados, e nao so a listagem.
 *
 * O repositorio e um FALSO DE VERDADE, e nao um mock de chamadas: ele guarda
 * as linhas e filtra por dono como o real faz no WHERE. Um mock provaria que
 * o servico passou o `donoId`; o falso prova que passar o `donoId` basta.
 * ==========================================================================
 */

const DAQUI_A_UMA_HORA = new Date(Date.now() + 3_600_000).toISOString();
const DAQUI_A_DUAS_HORAS = new Date(Date.now() + 7_200_000).toISOString();
const ONTEM = new Date(Date.now() - 86_400_000).toISOString();

const EU = 'usuario-a';
const OUTRA_PESSOA = 'usuario-b';

class RepoFalso implements ILembretesRepository {
  linhas: Array<Lembrete & { donoId: string }> = [];
  private seq = 0;

  guardar(donoId: string, texto: string, quando: Date): Promise<Lembrete> {
    const l = {
      id: `lem-${++this.seq}`,
      donoId,
      texto,
      quando,
      estado: 'PENDENTE' as EstadoLembrete,
    };
    this.linhas.push(l);
    return Promise.resolve(semDono(l));
  }

  listar(donoId: string): Promise<Lembrete[]> {
    return Promise.resolve(
      this.linhas
        .filter(
          (l) =>
            l.donoId === donoId &&
            (l.estado === 'PENDENTE' || l.estado === 'PERDIDO'),
        )
        .sort((a, b) => a.quando.getTime() - b.quando.getTime())
        .map(semDono),
    );
  }

  contarPendentes(donoId: string): Promise<number> {
    return Promise.resolve(
      this.linhas.filter((l) => l.donoId === donoId && l.estado === 'PENDENTE')
        .length,
    );
  }

  remarcar(id: string, donoId: string, quando: Date): Promise<boolean> {
    const alvo = this.aberto(id, donoId);
    if (!alvo) return Promise.resolve(false);
    alvo.quando = quando;
    alvo.estado = 'PENDENTE';
    return Promise.resolve(true);
  }

  cancelar(id: string, donoId: string): Promise<boolean> {
    const alvo = this.aberto(id, donoId);
    if (!alvo) return Promise.resolve(false);
    alvo.estado = 'CANCELADO';
    return Promise.resolve(true);
  }

  vencidos(): Promise<LembreteVencido[]> {
    return Promise.resolve([]);
  }

  fechar(): Promise<void> {
    return Promise.resolve();
  }

  /** O dono ENTRA NO FILTRO, como no WHERE do repositorio real. */
  private aberto(id: string, donoId: string) {
    return this.linhas.find(
      (l) =>
        l.id === id &&
        l.donoId === donoId &&
        (l.estado === 'PENDENTE' || l.estado === 'PERDIDO'),
    );
  }
}

function semDono(l: Lembrete & { donoId: string }): Lembrete {
  return { id: l.id, texto: l.texto, quando: l.quando, estado: l.estado };
}

describe('LembretesService', () => {
  let repo: RepoFalso;
  let service: LembretesService;

  beforeEach(() => {
    repo = new RepoFalso();
    service = new LembretesService(repo as never);
  });

  const meus = () => service.handlers(EU);
  const dela = () => service.handlers(OUTRA_PESSOA);

  describe('o isolamento', () => {
    beforeEach(async () => {
      await dela().guardarLembrete({
        texto: 'buscar o bolo na Faby',
        quandoIso: DAQUI_A_UMA_HORA,
      });
    });

    it('nao LISTA o lembrete de outra pessoa', async () => {
      const r = await meus().meusLembretes();
      expect(r.linhas).toEqual(['Nenhum lembrete guardado.']);
    });

    it('nao CANCELA o lembrete de outra pessoa, nem por texto', async () => {
      const r = await meus().cancelarLembrete({ qual: 'bolo' });

      expect(r.mensagem).toContain('NÃO FIZ NADA');
      // E o dela continua de pe — nao basta a mensagem estar certa.
      expect(repo.linhas[0].estado).toBe('PENDENTE');
    });

    it('nao REMARCA o lembrete de outra pessoa, nem pela posicao', async () => {
      const antes = repo.linhas[0].quando;
      const r = await meus().remarcarLembrete({
        qual: '1',
        quandoIso: DAQUI_A_DUAS_HORAS,
      });

      expect(r.mensagem).toContain('NÃO FIZ NADA');
      expect(repo.linhas[0].quando).toBe(antes);
    });

    it('o texto de outra pessoa nao aparece nem na lista de "nao achei"', async () => {
      await meus().guardarLembrete({
        texto: 'conferir o deploy',
        quandoIso: DAQUI_A_UMA_HORA,
      });
      const r = await meus().cancelarLembrete({ qual: 'inexistente' });

      expect(r.mensagem).toContain('conferir o deploy');
      expect(r.mensagem).not.toContain('bolo');
    });
  });

  describe('guardar', () => {
    it('guarda e diz quando vai avisar', async () => {
      const r = await meus().guardarLembrete({
        texto: 'passar na Faby',
        quandoIso: DAQUI_A_UMA_HORA,
      });

      expect(r.mensagem).toContain('passar na Faby');
      expect(repo.linhas).toHaveLength(1);
    });

    it('RECUSA horario no passado e nao grava nada', async () => {
      const r = await meus().guardarLembrete({
        texto: 'ja era',
        quandoIso: ONTEM,
      });

      expect(r.mensagem).toContain('NÃO GUARDEI');
      expect(repo.linhas).toHaveLength(0);
    });

    it('recusa texto vazio', async () => {
      const r = await meus().guardarLembrete({
        texto: '   ',
        quandoIso: DAQUI_A_UMA_HORA,
      });

      expect(r.mensagem).toContain('NÃO GUARDEI');
      expect(repo.linhas).toHaveLength(0);
    });

    it('recusa texto acima do teto', async () => {
      const r = await meus().guardarLembrete({
        texto: 'x'.repeat(TETO_TEXTO + 1),
        quandoIso: DAQUI_A_UMA_HORA,
      });

      expect(r.mensagem).toContain(String(TETO_TEXTO));
      expect(repo.linhas).toHaveLength(0);
    });

    it(`recusa o de numero ${TETO_PENDENTES + 1}`, async () => {
      for (let i = 0; i < TETO_PENDENTES; i += 1) {
        await meus().guardarLembrete({
          texto: `lembrete ${i}`,
          quandoIso: DAQUI_A_UMA_HORA,
        });
      }
      const r = await meus().guardarLembrete({
        texto: 'o que sobra',
        quandoIso: DAQUI_A_UMA_HORA,
      });

      expect(r.mensagem).toContain('NÃO GUARDEI');
      expect(repo.linhas).toHaveLength(TETO_PENDENTES);
    });
  });

  describe('achar qual e', () => {
    beforeEach(async () => {
      await meus().guardarLembrete({
        texto: 'ligar para a Faby de manha',
        quandoIso: DAQUI_A_UMA_HORA,
      });
      await meus().guardarLembrete({
        texto: 'buscar o bolo na Faby',
        quandoIso: DAQUI_A_DUAS_HORAS,
      });
    });

    it('acha por trecho do texto', async () => {
      const r = await meus().cancelarLembrete({ qual: 'bolo' });

      expect(r.mensagem).toContain('Cancelado');
      expect(repo.linhas[1].estado).toBe('CANCELADO');
    });

    it('acha pela posicao na lista', async () => {
      const r = await meus().cancelarLembrete({ qual: '1' });

      expect(r.mensagem).toContain('Cancelado');
      expect(repo.linhas[0].estado).toBe('CANCELADO');
    });

    it('acha por ordinal escrito', async () => {
      const r = await meus().cancelarLembrete({ qual: 'segundo' });

      expect(repo.linhas[1].estado).toBe('CANCELADO');
    });

    it('AMBIGUO nao escolhe o primeiro — devolve a lista numerada', async () => {
      const r = await meus().cancelarLembrete({ qual: 'Faby' });

      expect(r.mensagem).toContain('NÃO FIZ NADA');
      expect(r.mensagem).toContain('1.');
      expect(r.mensagem).toContain('2.');
      // NENHUM dos dois foi tocado. E a asserção que importa: a mensagem certa
      // com o cancelamento feito seria pior que a mensagem errada.
      expect(repo.linhas.every((l) => l.estado === 'PENDENTE')).toBe(true);
    });

    it('nao confunde numero DENTRO do texto com posicao', async () => {
      await meus().guardarLembrete({
        texto: 'ligar as 3 da tarde',
        quandoIso: DAQUI_A_DUAS_HORAS,
      });
      const r = await meus().cancelarLembrete({ qual: 'ligar as 3' });

      expect(r.mensagem).toContain('Cancelado');
      expect(repo.linhas[2].estado).toBe('CANCELADO');
    });

    it('acha ignorando acento e caixa', async () => {
      await meus().guardarLembrete({
        texto: 'conferir a MIGRAÇÃO',
        quandoIso: DAQUI_A_DUAS_HORAS,
      });
      const r = await meus().cancelarLembrete({ qual: 'migracao' });

      expect(repo.linhas[2].estado).toBe('CANCELADO');
    });
  });

  describe('remarcar', () => {
    beforeEach(async () => {
      await meus().guardarLembrete({
        texto: 'passar na Faby',
        quandoIso: DAQUI_A_UMA_HORA,
      });
    });

    it('muda a hora e confirma dizendo qual era', async () => {
      const r = await meus().remarcarLembrete({
        qual: 'Faby',
        quandoIso: DAQUI_A_DUAS_HORAS,
      });

      expect(r.mensagem).toContain('Remarcado');
      expect(r.mensagem).toContain('passar na Faby');
      expect(repo.linhas[0].quando.toISOString()).toBe(DAQUI_A_DUAS_HORAS);
    });

    it('RECUSA hora no passado antes mesmo de procurar o lembrete', async () => {
      const antes = repo.linhas[0].quando;
      const r = await meus().remarcarLembrete({
        qual: 'Faby',
        quandoIso: ONTEM,
      });

      expect(r.mensagem).toContain('NÃO REMARQUEI');
      expect(repo.linhas[0].quando).toBe(antes);
    });

    it('um PERDIDO remarcado volta a valer', async () => {
      repo.linhas[0].estado = 'PERDIDO';

      const r = await meus().remarcarLembrete({
        qual: 'Faby',
        quandoIso: DAQUI_A_DUAS_HORAS,
      });

      expect(r.mensagem).toContain('Remarcado');
      expect(repo.linhas[0].estado).toBe('PENDENTE');
    });
  });

  it('o PERDIDO aparece na lista dizendo que nao foi enviado', async () => {
    await meus().guardarLembrete({
      texto: 'passar na Faby',
      quandoIso: DAQUI_A_UMA_HORA,
    });
    repo.linhas[0].estado = 'PERDIDO';

    const r = await meus().meusLembretes();

    expect(r.linhas[0]).toContain('NÃO FOI ENVIADO');
  });
});
