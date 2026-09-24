--- 66 — O ID DO ERP DA MOVIMENTACAO COMO O INTEGRADOR MANDOU
---
--- Terceira vez que este mesmo problema aparece, e agora na linha mais visivel
--- de todas. Em 24/09/2026 o Lucas mandou `"000001419828"` pelo Thunder Client
--- e recebeu `"1419828"` de volta.
---
---   migracao 63   operacoes        (o Alessandro reparou em 23/09)
---   migracao 65   locais_estoque   (ao virar ponta da movimentacao)
---   migracao 66   movimentacoes    <- esta
---
--- A REGRA E SEMPRE A MESMA, e vale escrever inteira uma vez:
---
---   `id_erp` e CANONICO — normalizado, e o que casa. O Safira manda o mesmo
---   identificador ora como texto com zeros, ora como numero, e so um valor
---   canonico faz os dois lados se encontrarem.
---
---   `id_erp_bruto` e FIEL — o que ele mandou, so aparados espaco e o `.0` de
---   serializacao. Serve a UMA coisa: o eco da API. Nao e chave, nao tem
---   UNIQUE, nao entra em busca nenhuma.
---
--- POR QUE O BRUTO NAO VIRA A CHAVE: "000001419828" e "1419828" sao textos
--- diferentes. Como chave, o mesmo documento reenviado na outra grafia nasceria
--- DUAS vezes — e a idempotencia do PUT e a coisa mais importante desta rota.
---
--- ==========================================================================
--- SO O CABECALHO — decisao do Lucas em 24/09/2026.
---
--- A resposta tambem ecoa `idErpItem` e `idErpPagamento`, e os dois tem o
--- mesmo desencontro. Ficam como estao: sao `id_mesti` e `id_recf`, que
--- REPETEM dentro do documento e nao sao identidade de nada — o proprio
--- cabecalho da entidade ja diz isso. Se um dia incomodarem, o conserto e este
--- mesmo, em duas colunas.
--- ==========================================================================
---
--- Aditiva, sem indice, re-executavel. NAO reescreve `id_erp` — ele ja e
--- gravado normalizado pelo `SincronizarMovimentacaoUseCase` desde a migracao
--- 46, ao contrario do que acontecia em `locais_estoque`.

ALTER TABLE movimentacoes ADD COLUMN IF NOT EXISTS id_erp_bruto VARCHAR(50);

COMMENT ON COLUMN movimentacoes.id_erp_bruto IS
  'O id do ERP como o integrador mandou, com os zeros a esquerda. Serve so ao eco da API: a chave e id_erp, normalizado.';

--- O que ja esta gravado perdeu a grafia original antes de existir onde
--- guarda-la. O canonico e o mais fiel que ha, e evita eco nulo ate o proximo
--- reenvio, que corrige sozinho.
UPDATE movimentacoes
   SET id_erp_bruto = id_erp
 WHERE id_erp_bruto IS NULL
   AND id_erp IS NOT NULL;
