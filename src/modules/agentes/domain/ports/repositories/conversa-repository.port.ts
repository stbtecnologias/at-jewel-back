import type { Conversa } from '../../entities/conversa.entity';

export interface IConversaRepository {
  salvar(conversa: Conversa): Promise<Conversa>;
}
