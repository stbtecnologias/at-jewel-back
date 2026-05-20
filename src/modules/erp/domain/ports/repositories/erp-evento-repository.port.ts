export interface IErpEventoRepository {
  jaProcessado(eventoId: string): Promise<boolean>;
  marcarComoProcessado(eventoId: string, entidadeTipo: string): Promise<void>;
}
