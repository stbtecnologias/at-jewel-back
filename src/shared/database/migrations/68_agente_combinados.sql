--- 68 — OS COMBINADOS: O QUE A AGENTE NAO PODE ESQUECER
---
--- Requisito ANA-16 do `anastasia.docx`: "A Anastasia nao pode esquecer entre
--- conversas, sessoes ou reinicios do servidor. Ela deve lembrar, a partir do
--- banco de dados: [...] instrucoes e combinados feitos pela Equipe AT e
--- donas".
---
--- ==========================================================================
--- O QUE ELA JA LEMBRAVA, E POR QUE ISSO NAO BASTAVA.
---
--- O historico de lead, cliente, venda e compromisso SEMPRE esteve no banco —
--- ela le por ferramenta a cada pergunta. Isso nunca se perdeu num restart.
---
--- O que se perdia era outra coisa: o COMBINADO. "Me avise sempre que um lead
--- da Cida ficar mais de uma hora sem resposta", dito uma vez no WhatsApp,
--- vivia no `MemoriaConversaService` — um `Map` na RAM, com TTL de duas horas.
--- Duas horas depois, ou no proximo deploy, sumia. O documento e explicito:
--- "Memoria so em variavel/contexto da sessao NAO conta como implementado".
--- ==========================================================================
---
--- ==========================================================================
--- LEMBRAR NAO E AGIR, E A DISTINCAO PRECISA FICAR AQUI.
---
--- Esta tabela faz a agente LEMBRAR do combinado e repeti-lo quando o assunto
--- voltar. Ela NAO faz o alerta disparar sozinho — isso e o ANA-19/ANA-20, e
--- depende de dado que ainda nao existe (o ANA-07, com os celulares das
--- vendedoras conectados, e quem passa a gravar "mensagem chegou as 14h,
--- resposta saiu as 15h30").
---
--- Quem ler isto depois de o ANA-07 existir: o caminho e uma coluna de REGRA
--- estruturada ao lado do texto — nao trocar o texto por ela. O texto e o que
--- a pessoa disse, e e o que ela vai reconhecer na lista do ANA-18.
--- ==========================================================================

CREATE TABLE IF NOT EXISTS agente_combinados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  --- `anastasia` ou `elena`. Mesma chave do `agente_prompts` (migracao 20),
  --- e de proposito: um combinado e da agente, nao da pessoa que o disse —
  --- quem combina com a Anastasia espera que ela lembre com qualquer um.
  agente        varchar(40) NOT NULL,

  --- O texto COMO FOI DITO. Nao normalizado, nao interpretado.
  ---
  --- Teto de 300 caracteres no caso de uso, e nao aqui: o limite existe para
  --- o combinado caber no system prompt sem empurrar o resto para fora, e
  --- esse e um numero de produto, que muda. `text` deixa mudar sem migracao.
  texto         text NOT NULL,

  criado_por    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),

  --- ======================================================================
  --- REMOCAO E LOGICA, E ISSO NAO E ZELO EXCESSIVO.
  ---
  --- O ANA-18 pede que a Equipe AT possa "ver e corrigir as instrucoes que a
  --- Anastasia guardou". Corrigir inclui APAGAR — e o dia em que alguem
  --- perguntar "por que ela parou de me avisar daquilo?", a resposta tem de
  --- existir. `DELETE` levaria a pergunta junto.
  --- ======================================================================
  removido_por  uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  removido_em   timestamptz,

  CONSTRAINT ck_agente_combinados_remocao
    CHECK ((removido_em IS NULL) = (removido_por IS NULL) OR removido_em IS NOT NULL)
);

--- A leitura QUENTE: os combinados ativos de uma agente, a cada mensagem que
--- ela responde. Parcial porque removido nunca entra nessa consulta.
CREATE INDEX IF NOT EXISTS idx_agente_combinados_ativos
  ON agente_combinados (agente, criado_em) WHERE removido_em IS NULL;

COMMENT ON TABLE agente_combinados IS
  'Instrucoes que a equipe combinou com a agente, ditas em conversa. Sobrevivem a restart (ANA-16). Fazem a agente LEMBRAR, nao disparar — alerta automatico e ANA-19.';
COMMENT ON COLUMN agente_combinados.texto IS
  'O combinado como foi dito. E o que a pessoa reconhece na lista do ANA-18.';
COMMENT ON COLUMN agente_combinados.removido_em IS
  'Remocao logica: a linha fica para responder "por que ela parou de avisar?".';
