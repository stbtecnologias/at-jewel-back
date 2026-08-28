import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequireScopes } from '../../../../auth/infrastructure/http/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../../../auth/infrastructure/http/guards/api-key.guard';
import { ScopesGuard } from '../../../../auth/infrastructure/http/guards/scopes.guard';
import { RegistrarLeadUseCase } from '../../../application/use-cases/registrar-lead.use-case';
import { RegistrarLeadDto } from '../dto/registrar-lead.dto';

/**
 * A porta da triagem. Quem chama e o `atwpp`, que nao tem banco: sem este
 * endpoint a conversa da Anastasia morre no restart do processo.
 *
 * API Key + scope, e nao JWT: o chamador e um servico, nao uma pessoa.
 *
 * O RETORNO NAO TRAZ PII DE TERCEIROS. Devolve o proprio lead — que e da
 * pessoa que acabou de escrever — mais como ela foi reconhecida. Nada da
 * carteira, nada de outra cliente.
 */
@Controller('leads')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class LeadsController {
  constructor(private readonly registrar: RegistrarLeadUseCase) {}

  /**
   * Registra ou continua a triagem de um numero.
   *
   * NAO e um POST idempotente por acaso: chamar duas vezes com o mesmo numero
   * nao cria dois leads, porque a cadeia de reconhecimento encontra o lead
   * aberto e o atualiza. E o que permite ao `atwpp` chamar a cada mensagem sem
   * precisar guardar estado nenhum.
   *
   * Throttle mais alto que o padrao: uma conversa ativa gera varias chamadas
   * em sequencia, uma por mensagem.
   */
  @Post()
  @RequireScopes('leads:write')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async registrar_(@Body() dto: RegistrarLeadDto) {
    const { lead, reconhecimento, conhecido } =
      await this.registrar.execute(dto);

    return {
      id: lead.id,
      estado: lead.estado,
      reconhecimento,
      conhecido,
      // O que a Anastasia precisa para nao repetir pergunta.
      nome: lead.nome,
      apelido: lead.apelido,
      ocasiao: lead.ocasiao,
      produtosDesejados: lead.produtosDesejados,
      // Sinaliza que a pessoa ja e cliente do ERP, sem expor o cadastro.
      jaECliente: lead.clienteId !== null,
      criadoEm: lead.criadoEm,
    };
  }
}
