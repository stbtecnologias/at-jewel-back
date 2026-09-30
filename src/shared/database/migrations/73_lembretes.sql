--- 73 — LEMBRETES PESSOAIS DA GESTAO
---
--- Pedido do Lucas em 30/09/2026, depois de perguntar a Anastasia "me lembra
--- de falar com as vendedoras daqui a 20 minutos" e ouvir que ela nao dispara
--- mensagem sozinha.
---
--- ==========================================================================
--- A RESPOSTA DELA ESTAVA ERRADA SOBRE O SISTEMA.
---
--- Ele dispara. `DispararPendenciasUseCase` roda de minuto em minuto, com lote
--- de 50 e expiracao em 6h, e `avisar-gestao-de-lead` ja fala com a gestao por
--- iniciativa propria. O que nao existia era PARA QUEM PERGUNTOU.
---
--- O que impedia era o formato do registro: toda pendencia pendura num
--- `atendimento`, que exige `cliente_id` e `vendedora_id`. "Passar na Faby e
--- pegar o bolo" nao tem cliente. Nao havia onde gravar — e generalizar a
--- tabela de interacoes tocaria o disparo inteiro, que assume os dois.
---
--- Dai a tabela propria. Ela nao substitui a agenda de atendimento: sao duas
--- coisas com o mesmo formato e donos diferentes.
--- ==========================================================================

CREATE TABLE IF NOT EXISTS lembretes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  --- ======================================================================
  --- CASCADE, E NAO SET NULL — ao contrario de `agente_combinados`.
  ---
  --- La a remocao e logica porque o combinado e DA AGENTE: quem o disse
  --- pode sair da empresa e a regra continua valendo para todos. Aqui e o
  --- oposto — o lembrete e da PESSOA, e sem ela nao ha para quem mandar. Uma
  --- linha orfa seria um lembrete que nunca toca e que ninguem consegue ver,
  --- porque a unica consulta que existe e "os meus".
  --- ======================================================================
  admin_user_id  uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,

  --- [ENCRYPTED] O texto como a pessoa disse, cifrado pelo transformer da
  --- aplicacao (AES-256-GCM, mesmo de `atendimento_interacoes.relato`).
  ---
  --- Cifrado porque o conteudo e imprevisivel: hoje e bolo, amanha e consulta
  --- medica. E mais pessoal que o relato da vendedora, que ja e cifrado.
  ---
  --- NAO HA HASH AO LADO, e a ausencia e deliberada. Telefone ganha
  --- `*_hash` para poder ser procurado; texto livre nao tem o que procurar
  --- por igualdade exata. A busca por "o lembrete da Faby" carrega os
  --- pendentes DAQUELE DONO e compara em memoria — sao poucos, e sem hash
  --- nao ha como correlacionar dois lembretes iguais de pessoas diferentes.
  texto          text NOT NULL,

  --- Quando tocar. Com fuso, como todo instante do sistema.
  quando         timestamptz NOT NULL,

  --- PENDENTE -> ENVIADO | CANCELADO | PERDIDO.
  ---
  --- `varchar` + CHECK, e nao um TYPE como o da migracao 56: acrescentar
  --- estado num enum do Postgres e migracao com trava de tabela, e esta lista
  --- e de produto — ela vai mudar antes do resto.
  ---
  --- PERDIDO e o que o processo ficou fora do ar tempo demais para entregar.
  --- Ele NAO some: um lembrete que desaparece calado e exatamente a falha que
  --- esta tabela existe para evitar, entao ele aparece na listagem dizendo o
  --- que aconteceu.
  estado         varchar(20) NOT NULL DEFAULT 'PENDENTE',

  enviado_em     timestamptz,

  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_lembretes_estado
    CHECK (estado IN ('PENDENTE', 'ENVIADO', 'CANCELADO', 'PERDIDO'))
);

--- A leitura do CRON: "quem venceu?", de minuto em minuto, para sempre. E a
--- unica consulta do sistema que nao filtra por dono, e por isso ela e a mais
--- estreita possivel — so o instante, so os pendentes.
CREATE INDEX IF NOT EXISTS idx_lembretes_vencidos
  ON lembretes (quando) WHERE estado = 'PENDENTE';

--- A leitura da PESSOA: "quais os meus?". Sempre com o dono na frente, porque
--- nao existe caminho de leitura sem ele.
CREATE INDEX IF NOT EXISTS idx_lembretes_do_dono
  ON lembretes (admin_user_id, quando) WHERE estado = 'PENDENTE';

COMMENT ON TABLE lembretes IS
  'Lembretes pessoais de um usuario de gestao, guardados em conversa com a Anastasia. So o dono le, remarca e cancela — nao ha consulta sem dono, e isso e a barreira, nao um filtro.';
COMMENT ON COLUMN lembretes.texto IS
  'CIFRADO na aplicacao. Texto livre e imprevisivel: pode ser qualquer assunto da vida da pessoa.';
COMMENT ON COLUMN lembretes.estado IS
  'PENDENTE -> ENVIADO | CANCELADO | PERDIDO. PERDIDO fica visivel na listagem: lembrete que some calado e a falha que esta tabela evita.';
