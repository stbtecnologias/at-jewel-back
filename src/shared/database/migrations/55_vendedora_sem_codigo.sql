--- 55 — TODA VENDEDORA PASSA A TER CODIGO
---
--- ==========================================================================
--- SEM CODIGO, ELA NAO EXISTE PARA A CARTEIRA.
---
--- A FK `fk_clientes_vendedora_codigo` (migracao 29) liga cliente a vendedora
--- por `vendedoras.codigo_erp`. Quem esta com o campo vazio nao pode receber
--- cliente nenhum — e o sintoma nao e um erro, e uma AUSENCIA: o select de
--- "vendedora" no cadastro de cliente simplesmente nao a lista, porque
--- oferecer uma opcao que a FK recusaria seria pior.
---
--- Foi assim que apareceu, em 08/09/2026: uma vendedora cadastrada pelo CRM
--- nao aparecia na hora de por um cliente na carteira dela.
--- ==========================================================================
---
--- O PREFIXO `AT-` DIZ A ORIGEM. O que comeca assim foi gerado pela casa; o
--- resto veio do ERP. A coluna se chama `codigo_erp` porque nasceu quando o
--- ERP era o dono do cadastro — hoje ela e a chave da carteira, e a origem do
--- valor e detalhe, nao definicao.
---
--- TROCAR DEPOIS E SEGURO, e por isto nao ha medo de gerar: a FK tem
--- ON UPDATE CASCADE. No dia em que o ERP trouxer a vendedora com o codigo
--- dele, trocar leva os clientes junto — nada se perde, nada precisa migrar.

--- Numera a partir do maior AT-#### que ja existe, e nao a partir de 1: rodar
--- de novo com vendedoras novas continua dando codigos ineditos.
WITH proximo AS (
  SELECT COALESCE(
    MAX((substring(codigo_erp from 4))::int),
    0
  ) AS ultimo
  FROM vendedoras
  WHERE codigo_erp ~ '^AT-[0-9]+$'
),
--- `ORDER BY criado_em` para a numeracao seguir a ordem de entrada, e nao a
--- ordem fisica das linhas — que muda a cada VACUUM e faria duas execucoes
--- iguais produzirem codigos diferentes.
alvo AS (
  SELECT id, row_number() OVER (ORDER BY criado_em, id) AS n
  FROM vendedoras
  WHERE codigo_erp IS NULL
)
UPDATE vendedoras v
   SET codigo_erp = 'AT-' || lpad((p.ultimo + a.n)::text, 4, '0')
  FROM alvo a, proximo p
 WHERE v.id = a.id;

--- ==========================================================================
--- POR QUE NAO UM NOT NULL AQUI.
---
--- A coluna deveria ser obrigatoria — e o argumento e forte: vendedora sem
--- codigo e vendedora sem carteira. Mas o `CriarVendedoraUseCase` ja garante
--- o codigo na aplicacao, e um NOT NULL numa coluna com FK vinda de tres
--- tabelas e trava que so aparece na hora errada, num INSERT de integracao
--- que ninguem lembrou de ajustar.
---
--- Fica como decisao adiada, e nao esquecida.
--- ==========================================================================
