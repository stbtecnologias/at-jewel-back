import type { AgenteDaCasa } from '../agente-da-casa';

// Porta que abstrai o gateway de WhatsApp (implementada via WAHA na infra).
// Mantem a aplicacao livre do provedor concreto — trocar WAHA por outro
// gateway no futuro nao toca no use case.
export interface IWhatsappGateway {
  /**
   * Envia uma mensagem de texto para um chat.
   *
   * @param chatId identificador do chat no formato do WhatsApp (ex.: `5585...@c.us`).
   * @param texto  conteudo da mensagem.
   * @param agente DE QUAL NUMERO a mensagem sai. Omitido, sai pelo da
   *   Anastasia — que ate 25/09/2026 era o unico. Quem escreve para uma
   *   VENDEDORA passa `'ELENA'`: o aviso tem que chegar pelo numero em que
   *   ela pode responder, senao a resposta dela cai no canal errado e ouve
   *   "me chama no outro numero".
   */
  enviarTexto(
    chatId: string,
    texto: string,
    agente?: AgenteDaCasa,
  ): Promise<void>;

  /**
   * Envia uma imagem com legenda.
   *
   * O arquivo vai em BASE64 no corpo, e nao por URL: a imagem tratada mora num
   * bucket privado, e mandar a URL faria o WhatsApp tentar baixar de um lugar
   * a que ele nao tem acesso.
   */
  enviarImagem(
    chatId: string,
    conteudo: Buffer,
    mime: string,
    legenda: string,
    agente?: AgenteDaCasa,
  ): Promise<void>;

  /**
   * O TELEFONE conectado num dos numeros da casa, so com digitos, ou `null`
   * se aquela sessao nao esta conectada.
   *
   * Existe para o desvio educado de 25/09/2026: quem escreve para o numero
   * errado ouve "me chama no outro numero", e a frase so serve se disser QUAL.
   * O numero vem do WAHA, e nao de um env — trocou o chip, a frase acompanha,
   * e nao ha variavel para esquecer de atualizar.
   */
  numeroDoAgente(agente: AgenteDaCasa): Promise<string | null>;

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

  /**
   * Traduz o remetente que chega no webhook para um identificador que CONTEM
   * telefone.
   *
   * POR QUE EXISTE: o WhatsApp deixou de mandar o numero de quem escreve. O
   * campo `from` chega como LID — `Linked ID`, um identificador interno da
   * conta:
   *
   *     from: 2782...6435@lid        e nao     558586467241@c.us
   *
   * Descoberto em 20/08/2026, depurando por que a resposta da vendedora
   * chegava no back e ele nao a reconhecia: o codigo tirava os nao-digitos do
   * `from` e calculava o HMAC — do LID. Nenhum hash de telefone bateria nunca.
   * Na sessao de producao ja havia 48 LIDs mapeados, entao nao e excecao.
   *
   * E o mesmo erro de `resolverChatId`, na direcao contraria: supor que o
   * identificador do provedor e um telefone. A regra vale para os dois lados —
   * PERGUNTE AO PROVEDOR, nao deduza.
   *
   * Quem nao e LID volta como veio. Falha de consulta tambem devolve a entrada
   * original: o efeito e o remetente nao ser reconhecido, que e o lado seguro
   * de errar num canal com default-deny.
   */
  resolverRemetente(de: string): Promise<string>;

  /**
   * Baixa um arquivo de midia que o provedor ja descriptografou.
   *
   * POR QUE PRECISA DE UM METODO: o arquivo que chega no webhook NAO e
   * baixavel por quem so tem a URL. O WhatsApp entrega midia cifrada ponta a
   * ponta — o payload traz `URL`, `directPath`, `mediaKey` e `fileEncSHA256`,
   * e buscar aquela URL direto devolve bytes cifrados. Quem descriptografa e o
   * WAHA, que republica o arquivo em claro num endereco proprio.
   *
   * E ESSE ENDERECO E UMA ARMADILHA. Ele vem como
   *
   *     http://waha:3000/api/files/default/AC50....oga
   *
   * onde `waha` e o nome do container DENTRO da rede Docker do WAHA. O back
   * roda em OUTRA maquina (WAHA na `.151`, nos na `.137`), entao esse hostname
   * nao resolve aqui e o download falharia sempre. A implementacao aproveita
   * apenas o CAMINHO e o recompoe sobre o `WAHA_BASE_URL`.
   *
   * @returns bytes e mimetype, ou `null` se nao deu para baixar.
   */
  baixarMidia(
    url: string,
  ): Promise<{ conteudo: Buffer; mimetype: string } | null>;
}
