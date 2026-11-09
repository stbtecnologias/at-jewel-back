--- 77 — DESATIVAR USUARIO DO PAINEL, SEM APAGAR
---
--- 09/11/2026. O Lucas perguntou: *"em usuarios, nao tenho a possibilidade de
--- desativar um usuario?"*. Nao tinha — `admin_users` tinha onze colunas e
--- NENHUMA era um estado. O unico caminho para fora era o DELETE.
---
--- E O DELETE LEVA O TRABALHO JUNTO, que foi a conclusao dele no mesmo fio:
--- *"e pq o delete, se o usuario tiver feito alguma coisa, ai some.. nao
--- parece muito bom"*.
---
--- Medido na base antes de escrever: dos sete vinculos que pendem de um
--- usuario, seis caem para NULL — o catalogo continua la, so fica sem autor.
--- UM E CASCADE: `lembretes.admin_user_id`. Eram 22 lembretes, de 2 donos.
--- Lembrete nao e registro do passado, e compromisso FUTURO: apagar a conta
--- cancelava, em silencio, avisos que ainda iam disparar.
---
--- A CASA JA TINHA RESOLVIDO ISTO DO OUTRO LADO. `vendedoras` tem `ativo`, e o
--- controller dela diz com todas as letras que "o desligamento do dia a dia e
--- PATCH com ativo: false, que preserva a atribuicao de todo o historico". Para
--- vendedora a casa pensou nisso; para a conta que ENTRA no sistema, nao.
---
--- POR QUE BOOLEAN, E NAO UM STATUS COMO NO CATALOGO (migracao 76):
---
--- La havia uma maquina de estados de verdade — RASCUNHO, COLETANDO,
--- PUBLICADO, ENCERRADO —, e 'EXCLUIDO' entrou como mais um valor dela. Aqui
--- nao ha maquina nenhuma: a conta entra ou nao entra. Inventar um status com
--- um valor so seria desenhar um eixo que nao existe.
---
--- DEFAULT true: nenhuma das contas existentes e desligada por esta migracao.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN admin_users.ativo IS
  'false = desligado: nao entra no painel, nao renova sessao, nao e reconhecido pelas agentes no WhatsApp e nao recebe lembrete nem alerta. O historico que ele criou continua nomeado.';

COMMIT;
