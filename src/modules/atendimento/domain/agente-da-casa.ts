/**
 * Os dois agentes que falam por um numero PROPRIO.
 *
 * ==========================================================================
 * O DESENHO ORIGINAL ERA ESTE, E SO AGORA HA DOIS CHIPS.
 *
 * Anastasia e Elena sempre foram dois atendimentos diferentes, para publicos
 * diferentes. Nasceram dividindo um numero so porque so havia um para testar,
 * e o roteador aprendeu a decidir POR QUEM ESCREVE. Com dois numeros existe uma
 * segunda pergunta — PARA QUAL NUMERO escreveu —, e a decisao do Lucas em
 * 25/09/2026 foi a separacao estrita:
 *
 *   numero da Anastasia  ->  gestao
 *   numero da Elena      ->  vendedora, e o canal do catalogo (estoque/mkt)
 *
 * Quem escrever para o numero errado e RECONHECIDO ouve "me chama no outro
 * numero". Quem nao e da casa continua ouvindo silencio, nos dois.
 * ==========================================================================
 *
 * Vive no dominio porque a PORTA do gateway fala nesta lingua: quem envia diz
 * de QUAL AGENTE a mensagem sai, e nunca o nome tecnico da sessao do WAHA.
 * Traduzir agente em sessao e trabalho de infraestrutura — ver
 * `SessoesDaCasaService`.
 */
export type AgenteDaCasa = 'ANASTASIA' | 'ELENA';
