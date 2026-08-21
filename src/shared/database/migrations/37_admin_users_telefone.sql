-- ============================================================
-- A.T. JEWEL — Migracao 37: telefone do usuario do painel
--
-- POR QUE AGORA: o canal interno de WhatsApp reconhece a vendedora pelo
-- `vendedoras.whatsapp_interno_hash`. O ADM nao tinha onde guardar telefone
-- nenhum, e por isso ficou restrito ao painel — decisao registrada em 19/08.
-- Esta coluna e o que abre a porta para o ADM falar pelo WhatsApp depois.
-- Hoje ela so guarda; ninguem le ainda.
--
-- CIFRADO + HASH, o mesmo par usado em cliente e vendedora:
--
--   telefone        TEXT   ciframento AES-256-GCM na aplicacao
--   telefone_hash   CHAR   HMAC-SHA256, e o que permite BUSCAR
--
-- Cifrado nao da para procurar (o mesmo numero gera bytes diferentes a cada
-- gravacao, por causa do IV). O hash e deterministico e serve de indice; o
-- valor legivel so existe depois de decifrar.
--
-- POR QUE UNIQUE — e a diferenca em relacao a migracao 36, de ontem:
--
-- Ontem tiramos o UNIQUE do telefone do CLIENTE, porque ali telefone e dado de
-- CONTATO: mae e filha dividem o numero, e barrar isso deixava gente legitima
-- fora do CRM. Aqui e o contrario. Este telefone e IDENTIDADE DE CANAL: quando
-- uma mensagem chegar, ela precisa resolver para exatamente UM usuario, senao
-- nao ha como decidir com quem se esta falando. E a mesma razao pela qual
-- `clientes_perfil.whatsapp_hash` e `vendedoras.whatsapp_interno_hash`
-- continuam unicos.
--
-- NULL nao colide: em Postgres, varios NULL convivem sob UNIQUE. Usuario sem
-- telefone continua normal, e sao a maioria.
-- ============================================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS telefone_hash VARCHAR(64);

-- UNIQUE por indice, e nao por constraint: `IF NOT EXISTS` existe para indice
-- e nao para constraint, entao esta forma e reexecutavel sem erro.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_telefone_hash_key
  ON admin_users (telefone_hash);

COMMENT ON COLUMN admin_users.telefone IS
  'Celular do usuario, cifrado (AES-256-GCM). Sera o identificador do ADM no canal interno de WhatsApp.';
COMMENT ON COLUMN admin_users.telefone_hash IS
  'HMAC-SHA256 do telefone so com digitos. Unico: identidade de canal precisa resolver para um usuario so.';
