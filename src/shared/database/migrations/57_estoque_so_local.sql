--- 57 — O SALDO MORA SEMPRE NUM LOCAL NOSSO
---
--- A migracao 32 deu ao saldo QUATRO donos possiveis, exatamente um por linha:
--- um local nosso, um fornecedor, um cliente ou uma vendedora. O modelo veio do
--- ERP, onde essa dimensao e uma coluna de texto so — `Armario 01`, `Ana` e
--- `Fornecedor 1` misturados —, e aqui virou quatro FKs de verdade.
---
--- O integrador pediu para enviar so o local. Esta migracao acompanha a API.
---
--- ==========================================================================
--- O QUE SE PERDE, E ESTA DITO DE PROPOSITO.
---
--- Some a CONTRAPARTIDA da consignacao. O ERP lanca em partida dobrada: ao
--- pegar uma peca consignada, +1 no armario (a peca esta aqui) e -1 no
--- fornecedor (devemos essa peca a ele). A segunda perna nao tem mais onde
--- morar — nao ha coluna para dizer A QUEM se deve.
---
--- Quantidade negativa continua VALIDA: nao ha CHECK de nao-negatividade nem
--- antes nem depois. O que se perde nao e o numero, e o destinatario dele.
---
--- Como remarcar isso ficou EM ABERTO com o integrador. O caminho natural e o
--- GRUPO de estoque, que ja e o campo que diz a situacao do saldo e ja tem
--- `Consignado`. Enquanto nao se decide, o saldo negativo diz "devemos", sem
--- dizer a quem.
--- ==========================================================================
---
--- ==========================================================================
--- A GUARDA NO TOPO EXISTE PARA ESTA MIGRACAO NAO PODER APAGAR DADO.
---
--- Ela roda em tres bancos (local, homolog no Proxmox, producao na AWS) e nem
--- todos sao alcancaveis de onde ela foi escrita. Em vez de conferir cada um
--- antes, a migracao confere a si mesma: achando uma linha que use fornecedor,
--- cliente ou vendedora, ela LEVANTA EXCECAO e a transacao inteira volta
--- atras. Nada e apagado, e a mensagem traz a contagem.
---
--- Se isso acontecer: decidir o que fazer com aquelas linhas ANTES de tentar
--- de novo. Elas sao a unica copia do que a casa deve a terceiros.
---
--- A guarda tambem cobre o `SET NOT NULL` do passo 7: pelo CHECK da 32, toda
--- linha tem exatamente um dono, entao "nenhuma usa os outros tres" implica
--- "todas tem local_estoque_id".
--- ==========================================================================

DO $$
DECLARE
  n_terceiros INTEGER;
BEGIN
  --- Rodar duas vezes nao pode quebrar: sem as colunas, a consulta abaixo
  --- seria erro de sintaxe em vez de "nada a fazer".
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name   = 'estoque'
       AND column_name  = 'fornecedor_id'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO n_terceiros
    FROM estoque
   WHERE fornecedor_id IS NOT NULL
      OR cliente_id    IS NOT NULL
      OR vendedora_id  IS NOT NULL;

  IF n_terceiros > 0 THEN
    RAISE EXCEPTION
      'Migracao 57 abortada: % linha(s) de estoque estao com fornecedor, cliente ou vendedora. Apagar as colunas perderia o registro do que a casa deve a terceiros. Decida o destino dessas linhas antes de rodar de novo.',
      n_terceiros;
  END IF;
END $$;

--- 1. O CHECK de "exatamente um dos quatro" depende das tres colunas.
ALTER TABLE estoque DROP CONSTRAINT IF EXISTS chk_estoque_local;

--- 2. A UNIQUE depende das GENERATED, que dependem das tres colunas. Ela e
---    recriada no passo 8, com o mesmo NOME — e o alvo do
---    `ON CONFLICT ON CONSTRAINT uq_estoque_chave` do repositorio, que assim
---    nao precisa mudar.
ALTER TABLE estoque DROP CONSTRAINT IF EXISTS uq_estoque_chave;

--- 3. Indices parciais das tres.
DROP INDEX IF EXISTS idx_estoque_fornecedor;
DROP INDEX IF EXISTS idx_estoque_cliente;
DROP INDEX IF EXISTS idx_estoque_vendedora;

--- 4. As GENERATED existiam por um motivo tecnico: colapsar as quatro colunas
---    de local em (tipo, id) para a UNIQUE pegar, ja que no Postgres nulos
---    nunca colidem entre si. Com um dono so, `local_tipo` seria a constante
---    'LOCAL' e `local_id` uma copia de `local_estoque_id`. Nao carregam mais
---    informacao — saem tambem da resposta da API.
ALTER TABLE estoque DROP COLUMN IF EXISTS local_tipo;
ALTER TABLE estoque DROP COLUMN IF EXISTS local_id;

--- 5. Os tres donos que sairam.
ALTER TABLE estoque DROP COLUMN IF EXISTS fornecedor_id;
ALTER TABLE estoque DROP COLUMN IF EXISTS cliente_id;
ALTER TABLE estoque DROP COLUMN IF EXISTS vendedora_id;

--- 6. O que era "um dos quatro" virou obrigatorio. O NOT NULL substitui o
---    CHECK do passo 1: com uma coluna so, exigir que ela exista e a mesma
---    regra, mais barata de ler.
ALTER TABLE estoque ALTER COLUMN local_estoque_id SET NOT NULL;

--- 7. A chave de negocio, sem as derivadas. Mesmo poder de discriminacao que
---    a anterior: onde `local_estoque_id` esta preenchido — agora sempre —,
---    `local_tipo` era 'LOCAL' e `local_id` era o proprio local_estoque_id.
---
---    Continua sendo o coracao do desenho: garante UMA linha por combinacao e
---    e o alvo do ON CONFLICT que torna a sincronizacao idempotente. O ERP
---    manda a foto quantas vezes quiser; nunca duplica.
ALTER TABLE estoque
  ADD CONSTRAINT uq_estoque_chave
  UNIQUE (empresa_id, grupo_estoque_id, produto_id, local_estoque_id);

--- 8. O indice do local era PARCIAL porque a coluna era anulavel — so as
---    linhas daquele armario, que eram uma fracao do total. Com o NOT NULL do
---    passo 6 o predicado e sempre verdadeiro: um filtro que nao filtra nada
---    so confunde quem for ler o esquema depois.
DROP INDEX IF EXISTS idx_estoque_local;
CREATE INDEX IF NOT EXISTS idx_estoque_local ON estoque (local_estoque_id);

COMMENT ON COLUMN estoque.local_estoque_id IS
  'Onde a peca esta. Obrigatorio desde a migracao 57 — o saldo mora sempre num local nosso.';
