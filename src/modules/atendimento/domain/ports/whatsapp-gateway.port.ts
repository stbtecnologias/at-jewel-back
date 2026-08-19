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

  /**
   * Descobre o `chatId` real de um telefone, perguntando ao provedor.
   *
   * NAO MONTE O chatId CONCATENANDO. O identificador de uma conta de WhatsApp
   * nem sempre e o telefone: contas brasileiras criadas antes do nono digito
   * mantem o identificador ANTIGO. O celular 5585 9 8646 7241 e conhecido pelo
   * WhatsApp como 5585 8646 7241 — comprovado em 17/08/2026, quando mensagens
   * enviadas para a forma com o 9 foram aceitas com `ack: 1 (SERVER)` e nunca
   * chegaram. Sem erro nenhum: o envio "funciona" e a mensagem some.
   *
   * @returns o chatId (ex.: `558586467241@c.us`), ou `null` se o numero nao
   *          tem WhatsApp.
   */
  resolverChatId(telefone: string): Promise<string | null>;
}
