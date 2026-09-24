--- 65 — O ID DO ERP DO LOCAL DE ESTOQUE: CANONICO PARA CASAR, FIEL PARA ECOAR
---
--- Em 24/09/2026 o local de estoque passou a ser aceito como PONTA da
--- movimentacao (origem e destino) — decisao do Lucas. E ai apareceu o mesmo
--- desencontro que a migracao 63 resolveu nas operacoes:
---
---   locais_estoque.id_erp          "009000000018"   texto, com zeros
---   Movimentacao.entidadeidorigem   9000000018      NUMERICO
---
--- Guardando os zeros como identidade, a movimentacao NUNCA acharia o local.
--- Por isso `id_erp` passa a ser canonico — normalizado pelo mesmo
--- `shared/erp/normalizar-id-erp.ts` que os dois lados ja usam.
---
--- E `id_erp_bruto` guarda o valor COMO O INTEGRADOR MANDOU, servindo a uma
--- coisa so: o `idErpLocal` da resposta. Nao e chave, nao tem UNIQUE e nao
--- entra em busca nenhuma — pedido do Lucas para o eco nao confundir quem
--- manda os zeros. Mesmo desenho da 63.
---
--- POR QUE O BRUTO NAO VIRA A CHAVE: "009000000018" e "9000000018" sao textos
--- diferentes, entao o UNIQUE nao os veria como o mesmo local. Bastaria ele
--- mandar o cadastro de um jeito num dia e de outro no outro para nascerem
--- duas linhas para o mesmo lugar.
---
--- ==========================================================================
--- ESTA MIGRACAO ALTERA DADO EXISTENTE, e e a primeira aqui que faz isso.
---
--- O terceiro comando reescreve `id_erp` das linhas que sao so digitos. Rodou
--- antes, na producao, a consulta de colisao — dois locais que virassem o
--- mesmo texto quebrariam o UNIQUE. Resultado em 24/09/2026: ZERO linhas.
---
--- Se em outro banco ela devolver alguma, ESTA MIGRACAO FALHA em vez de
--- corromper: o UNIQUE recusa, a transacao inteira volta atras, e a colisao
--- precisa ser decidida antes.
--- ==========================================================================
---
--- Re-executavel: a coluna e IF NOT EXISTS, o backfill so toca em NULL e a
--- normalizacao e idempotente (texto ja sem zeros nao muda).

ALTER TABLE locais_estoque ADD COLUMN IF NOT EXISTS id_erp_bruto VARCHAR(50);

COMMENT ON COLUMN locais_estoque.id_erp_bruto IS
  'O id do ERP como o integrador mandou, com os zeros a esquerda. Serve so ao eco da API: a chave e id_erp, normalizado.';

--- O que ja esta gravado tem os zeros, e eles sao o valor fiel: viram o bruto
--- ANTES de o canonico ser reescrito. Sem isto, a grafia original se perderia.
UPDATE locais_estoque
   SET id_erp_bruto = id_erp
 WHERE id_erp_bruto IS NULL
   AND id_erp IS NOT NULL;

--- `^[0-9]+$` espelha o `SO_DIGITOS` do normalizador: codigo com letra fica
--- como esta. O COALESCE cobre "000" -> "" -> "0", que e o mesmo caso limite
--- que a funcao trata.
UPDATE locais_estoque
   SET id_erp = COALESCE(NULLIF(regexp_replace(id_erp, '^0+', ''), ''), '0')
 WHERE id_erp ~ '^[0-9]+$'
   AND id_erp <> COALESCE(NULLIF(regexp_replace(id_erp, '^0+', ''), ''), '0');
