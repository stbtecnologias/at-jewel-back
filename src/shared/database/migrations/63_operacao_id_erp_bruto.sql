--- 63 — O ID DO ERP DA OPERACAO COMO O INTEGRADOR MANDOU
---
--- `operacoes.id_erp` e guardado NORMALIZADO: "009000000324" entra "9000000324".
--- Isso nao e gosto. A `Movimentacao.operacaoid` do Safira chega NUMERICA
--- (9000000324) e so acha a operacao porque os dois lados passam pelo mesmo
--- normalizador — ver `shared/erp/normalizar-id-erp.ts`.
---
--- Em 23/09/2026 o Alessandro reparou que manda "009000000324" e recebe
--- "9000000324" de volta. A LIGACAO ESTA CERTA; o que incomoda e o ECO.
---
--- Esta coluna guarda o valor COMO ELE MANDOU — so aparados espaco das pontas e
--- o `.0` de serializacao — e serve a UMA coisa: a resposta da API. Ela NAO e
--- chave, NAO tem UNIQUE e NAO entra em busca nenhuma. Quem casa continua
--- sendo `id_erp`.
---
--- POR QUE ELA NAO VIRA A CHAVE
---
--- "009000000324" e "9000000324" sao textos diferentes, entao o UNIQUE nao os
--- veria como a mesma operacao: bastaria ele mandar o catalogo de um jeito num
--- dia e de outro no outro para nascerem DUAS linhas para a mesma coisa. E a
--- movimentacao, que chega numerica, deixaria de casar.
---
--- SO ESTA TABELA — decisao do Lucas em 23/09/2026. As colunas-sombra de
--- `movimentacoes` (`operacao_id_erp` e companhia) seguem normalizadas, e nao
--- saem na resposta desde a decisao de 16/09.
---
--- Linhas antigas ficam NULL e a resposta cai no `id_erp`, como hoje. Ao
--- reenviar o cadastro, a coluna se preenche.
---
--- Aditiva, sem indice, re-executavel.

ALTER TABLE operacoes ADD COLUMN IF NOT EXISTS id_erp_bruto VARCHAR(50);

COMMENT ON COLUMN operacoes.id_erp_bruto IS
  'O id do ERP como o integrador mandou, com os zeros a esquerda. Serve so ao eco da API: a chave e id_erp, normalizado.';
