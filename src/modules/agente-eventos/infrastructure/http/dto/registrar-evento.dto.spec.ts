import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TIPOS_EVENTO_VALIDOS } from '../../../domain/entities/enums';
import { RegistrarEventoDto } from './registrar-evento.dto';

async function errosDe(payload: Record<string, unknown>) {
  const dto = plainToInstance(RegistrarEventoDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('RegistrarEventoDto — tipoEvento (allowlist H-003)', () => {
  const base = { agente: 'anastasia' };

  it('aceita um tipo dentro da allowlist', async () => {
    const erros = await errosDe({ ...base, tipoEvento: 'triagem_iniciada' });
    expect(erros).toHaveLength(0);
  });

  it('aceita suspeita_injection (essencial para a deteccao da Sofia)', async () => {
    const erros = await errosDe({ ...base, tipoEvento: 'suspeita_injection' });
    expect(erros).toHaveLength(0);
  });

  it('aceita todos os tipos declarados na allowlist', async () => {
    for (const tipo of TIPOS_EVENTO_VALIDOS) {
      const erros = await errosDe({ ...base, tipoEvento: tipo });
      expect(erros).toHaveLength(0);
    }
  });

  it('rejeita snake_case valido porem fora da allowlist', async () => {
    const erros = await errosDe({ ...base, tipoEvento: 'msg' });
    const erroTipo = erros.find((e) => e.property === 'tipoEvento');
    expect(erroTipo).toBeDefined();
    expect(erroTipo?.constraints).toHaveProperty('isIn');
  });

  it('rejeita tipo que tenta mascarar suspeita_injection', async () => {
    const erros = await errosDe({
      ...base,
      tipoEvento: 'suspeita_injection_ignorar',
    });
    const erroTipo = erros.find((e) => e.property === 'tipoEvento');
    expect(erroTipo).toBeDefined();
    expect(erroTipo?.constraints).toHaveProperty('isIn');
  });

  it('rejeita formato invalido (defesa secundaria @Matches)', async () => {
    const erros = await errosDe({ ...base, tipoEvento: 'Triagem Iniciada' });
    const erroTipo = erros.find((e) => e.property === 'tipoEvento');
    expect(erroTipo).toBeDefined();
  });
});
