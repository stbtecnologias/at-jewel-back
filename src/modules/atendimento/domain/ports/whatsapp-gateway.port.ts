// Porta que abstrai o gateway de WhatsApp (implementada via WAHA na infra).
// Mantem a aplicacao livre do provedor concreto — trocar WAHA por outro
// gateway no futuro nao toca no use case.
export interface IWhatsappGateway {
  /**
   * Envia uma mensagem de texto para um chat.
   * @param chatId identificador do chat no formato do WhatsApp (ex.: `5585...@c.us`).
   * @param texto  conteudo da mensagem.
   */
  enviarTexto(chatId: string, texto: string): Promise<void>;
}
