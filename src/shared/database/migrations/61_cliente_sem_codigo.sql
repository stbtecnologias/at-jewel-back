--- 61 — TODO CLIENTE PASSA A TER CODIGO
---
--- ==========================================================================
--- A COLUNA VAZIA NA TELA, E O QUE ELA SIGNIFICAVA.
---
--- Cliente cadastrado pelo CRM nascia com `codigo_erp` NULL, e a tabela de
--- clientes mostrava um traco na coluna Codigo. Visto pelo Lucas em
--- 23/09/2026, no cliente de teste "Ana Livia".
---
--- E DIFERENTE DO CASO DA VENDEDORA (migracao 55), e a diferenca importa para
--- ninguem tratar os dois como o mesmo problema:
---
---   vendedora sem codigo  ->  QUEBRA. Tres FKs apontam para
---                             `vendedoras.codigo_erp`
---                             (clientes.vendedora_codigo_erp e as duas de
---                             clientes_perfil). Sem codigo ela nao podia
---                             receber cliente nenhum, e o sintoma era uma
---                             AUSENCIA silenciosa no select.
---
---   cliente sem codigo    ->  NAO quebra nada. As DEZ chaves estrangeiras
---                             que entram em `clientes` apontam todas para
---                             `clientes.id` — o UUID. Nenhuma olha para
---                             `codigo_erp`.
---
--- O que o cliente perde sem codigo e outra coisa: reconciliacao com o ERP
--- (o integrador acha o cliente dele pelo `?codigoErp=`), a barreira de
--- duplicata, e um identificador que da para FALAR. "O cliente CL-0007" se
--- diz; "o de UUID 3f9c1b2a" nao.
--- ==========================================================================
---
--- POR QUE `CL-` E NAO `CL`, SEM O HIFEN.
---
--- O ERP escreve codigo de PRODUTO como DUAS LETRAS + digitos, e as letras
--- sao o tipo da peca: BR19048 (brinco, 1.688 linhas), AN19031 (anel, 1.515),
--- CO20099 (colar, 1.417), PU21003, PI19009, PG22005. `CL0001` teria
--- exatamente essa forma — seria escolher uma sigla de duas letras que o ERP
--- ainda nao usou. No dia em que ele usasse, a peca legitima dele bateria no
--- UNIQUE e seria recusada, e o erro apareceria do lado do INTEGRADOR.
---
--- Conferido em 23/09/2026 nas nove tabelas com `codigo_erp`: nenhum registro,
--- em nenhuma delas, usa o formato duas letras seguidas de hifen. O ERP poe
--- hifen so no meio (RS6426-450-0123), nunca logo depois da sigla.
---
--- ==========================================================================
--- POR QUE NAO UM NOT NULL AQUI — mesma decisao da 55, e pelos mesmos motivos.
---
--- O `CriarClienteUseCase` ja garante o codigo na aplicacao. Um NOT NULL numa
--- coluna que a integracao escreve e trava que so aparece na hora errada, num
--- INSERT que ninguem lembrou de ajustar. E aqui ha um motivo a mais: a coluna
--- e UNIQUE, entao um NOT NULL a tornaria obrigatoria E unica de uma vez.
---
--- Fica como decisao adiada, e nao esquecida.
--- ==========================================================================

--- Numera a partir do maior CL-#### que ja existe, e nao a partir de 1: rodar
--- de novo com clientes novos continua dando codigos ineditos.
WITH proximo AS (
  SELECT COALESCE(
    MAX((substring(codigo_erp from 4))::int),
    0
  ) AS ultimo
  FROM clientes
  WHERE codigo_erp ~ '^CL-[0-9]+$'
),
--- `ORDER BY criado_em` para a numeracao seguir a ordem de entrada, e nao a
--- ordem fisica das linhas — que muda a cada VACUUM e faria duas execucoes
--- iguais produzirem codigos diferentes para as mesmas pessoas.
alvo AS (
  SELECT id, row_number() OVER (ORDER BY criado_em, id) AS n
  FROM clientes
  WHERE codigo_erp IS NULL OR codigo_erp = ''
)
UPDATE clientes c
   SET codigo_erp = 'CL-' || lpad((p.ultimo + a.n)::text, 4, '0')
  FROM alvo a, proximo p
 WHERE c.id = a.id;
