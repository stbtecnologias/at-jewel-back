-- ============================================================
-- A.T. JEWEL — Migracao 46: Operacoes e Movimentacoes do ERP
--
-- POR QUE AGORA: em 03/09/2026 o Alessandro enviou as tabelas que faltavam —
-- `Operacoes`, `Movimentacao`, `MovimentacaoProduto` e `MovimentacaoPagamento`.
-- Com elas, a pergunta que o levantamento de 11/08 marcou como "a mais
-- importante ficou em aberto e define tudo" ficou respondida:
--
--   §6.1  "Saldo ou movimento?"  ->  MOVIMENTO.
--
-- E veio uma resposta que ninguem tinha previsto: a MESMA linha carrega a
-- venda e o estoque. Toda movimentacao tem `grupoid_origem` e
-- `grupoid_destino` — os grupos de estoque do modelo acordado — alem dos itens
-- e dos pagamentos. Uma venda nao e so receita: e peca saindo de um grupo e
-- entrando em outro.
--
-- ============================================================
-- POR QUE UMA TABELA PROPRIA, E NAO INGERIR DIRETO EM `vendas`
-- ============================================================
--
-- 1. `Operacoes` E CATALOGO, NAO UM PAR FIXO. Hoje chegaram duas linhas (VEN e
--    DVE). O cadastro comporta transferencia, compra, consignacao e ajuste — o
--    proprio levantamento preve transferencia entre empresas no RF-INT-15. Se
--    VEN virasse `vendas` direto, a primeira transferencia a chegar nao teria
--    onde cair: ou seria recusada em silencio, ou entraria na receita.
--
-- 2. INGERIR SO COMO VENDA JOGA FORA METADE DO DADO. O par de grupos e a
--    origem que o RF-INT-02 (tabela de estoque) esta esperando desde 11/08.
--
-- 3. OS INVARIANTES DE `vendas` SAO REGRA NOSSA, E VALEM. A entidade `Venda`
--    exige SUM(pagamentos) = valor_total e ao menos um pagamento. Conferindo
--    as 24 movimentacoes do dump:
--
--        itens somam o cabecalho          24 de 24
--        pagamentos somam o total          4 de 18 vendas
--        vendas sem nenhum pagamento       2
--        devolucoes com pagamento          0 de 6
--
--    `MovimentacaoPagamento` nao e "forma de pagamento da venda": e PARCELA. A
--    movimentacao 1310445 mostra limpo — R$ 123.120 = 100.000 de entrada mais
--    6 parcelas de 3.853,33, das quais 2 vieram.
--
--    Aterrissando cru, o cru fica fiel e a projecao fica limpa. Relaxar o
--    invariante de `vendas` para caber o ERP mataria a protecao tambem para a
--    venda criada na mao pelo painel.
--
-- 4. IDEMPOTENCIA GANHA CHAVE DE VERDADE. `iderpmovimentacao` e imutavel — o
--    que a migracao 34 decidiu em 18/08 e a ingestao de venda ainda nao seguiu
--    (`RegistrarVendaUseCase` desduplica por `codigo_erp`, o mutavel).
--
-- ============================================================
-- AS COLUNAS-SOMBRA `*_id_erp` — a decisao que mais importa aqui
-- ============================================================
--
-- Toda FK para um cadastro nosso vem acompanhada do id do ERP que a originou.
-- Nao e redundancia: e o conserto de um defeito que ja esta em producao.
--
-- Hoje `/erp/vendas` resolve cliente, vendedora e produto por `codigo_erp`, e
-- quando nao acha grava a FK NULL, escreve um warning no log e devolve HTTP
-- 200. O valor que veio do ERP se perde para sempre — e ninguem ve, porque a
-- chamada deu certo.
--
-- E vai acontecer muito: no dump, a movimentacao 1308414 tem
-- `entidadeiddestino: 1308412` e `vendedorid: 1308425` — vizinhos dela na
-- sequencia. Sao cliente e vendedor CRIADOS NO ATO DA VENDA. A venda chega
-- referenciando gente que talvez nunca tenha nos alcancado.
--
-- Com a coluna-sombra, o id fica gravado mesmo sem resolver, e uma passada
-- posterior liga a FK quando o cadastro chegar. Sem ela, so recebendo tudo de
-- novo.
--
-- ============================================================
-- O QUE NAO ENTRA AQUI, E POR QUE
-- ============================================================
--
-- `codigo_erp` na movimentacao: o ERP nao da codigo de negocio ao documento. O
-- mais proximo e `numero`, que ja tem coluna propria — e nao e unico sozinho
-- (as vendas do dump vao de 1120 a 1137 e as devolucoes de 97 a 102, duas
-- sequencias independentes). Coluna nula so para seguir o padrao dos cadastros
-- convidaria alguem a sincronizar por ela.
--
-- A PROJECAO PARA `vendas` E PARA `estoque` NAO ESTA AQUI. Esta migracao so
-- cria o pouso. `movimentacoes.venda_id` ja existe para quando a projecao for
-- escrita — nullable, porque nem toda movimentacao vira venda (devolucao nao
-- vira, transferencia nao vira).
--
-- ============================================================
-- PENDENTE COM O ALESSANDRO (nao trava esta migracao)
-- ============================================================
--
--   - `MovimentacaoPagamento` e o plano inteiro ou so o ja recebido?
--   - Qual a chave unica do pagamento? Ele nao manda numero de parcela —
--     por isso `n_parcela` aqui e NULLABLE e a ingestao substitui o agregado
--     inteiro em vez de casar linha a linha (ver o comentario da tabela).
--   - A lista completa de `Operacoes` — vieram 2 de quantas?
--   - `debcre` veio 'D' em 100% das linhas. O que e 'C'?
--   - As datas chegam sem fuso ("2026-08-05T12:51:22").
--   - `atualizadoem` e '1899-12-30' em 100% das linhas (o zero do Delphi):
--     nao serve de marca dagua de sync incremental.
--
-- Aditiva: cria tipos e tabelas novos, nao altera nada existente. Enum com
-- guarda de duplicata, no padrao da migracao 35 — integralmente re-executavel.
-- ============================================================


-- ------------------------------------------------------------
-- Enum
-- ------------------------------------------------------------
DO $$ BEGIN
  -- CLASSIFICACAO da operacao — o vocabulario FECHADO que decide o que o CRM
  -- faz com a movimentacao. Mesmo padrao de `formas_pagamento.classificacao`
  -- (migracao 28): o cadastro do ERP e aberto e muda sem nos avisar; o
  -- comportamento precisa de uma lista que o compilador conheca.
  --
  -- CONFIRMADAS pelo dump de 03/09: VENDA (VEN) e DEVOLUCAO_VENDA (DVE).
  -- As demais vem do levantamento de 11/08 (§2 e RF-INT-15) e estao aqui por
  -- anteciparem o que ja se sabe existir no Safira. Valor novo custa
  -- ALTER TYPE ... ADD VALUE, que e aditivo — mas migracao e deploy.
  --
  -- OUTRA e a valvula, e e o DEFAULT: operacao que chega sem de-para entra
  -- classificada como desconhecida em vez de ser adivinhada. Ela e gravada
  -- fielmente e simplesmente nao projeta em lugar nenhum.
  CREATE TYPE operacao_classe AS ENUM (
    'VENDA',
    'DEVOLUCAO_VENDA',
    'COMPRA',
    'DEVOLUCAO_COMPRA',
    'TRANSFERENCIA',
    'CONSIGNACAO',
    'AJUSTE',
    'OUTRA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------
-- Tabela: operacoes
--
-- Cadastro no padrao de `formas_pagamento` e `grupos_estoque`: id_erp e
-- identidade, codigo_erp e atributo, e uma classificacao nossa por cima.
--
--   id_erp        "009000000323"   a chave da tabela la (zeros a esquerda)
--   codigo_erp    "VEN"            o que a loja escolheu
--   nome          "VENDA"          o rotulo dele
--   classificacao VENDA            o que NOS fazemos com isso
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operacoes (
  -- [SYS] Identificador interno, desacoplado do ERP.
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] Identidade. Chave da sincronizacao — imutavel (migracao 34).
  id_erp         VARCHAR(50)      UNIQUE,

  -- [ERP] Codigo de negocio: exibir e conferir. NAO e identidade.
  codigo_erp     VARCHAR(50)      UNIQUE,

  -- [ERP] Nome como o ERP chama: "VENDA", "DEVOLUCAO DE VENDA".
  nome           VARCHAR(100)     NOT NULL,

  -- [SYS] O de-para. Default OUTRA de proposito: operacao nova chega inerte,
  -- e alguem classifica. Adivinhar pelo nome poria receita no lugar errado.
  classificacao  operacao_classe  NOT NULL DEFAULT 'OUTRA',

  -- [SYS] Desligamento suave. Operacao inativa continua existindo para as
  -- movimentacoes historicas fazerem sentido.
  ativo          BOOLEAN          NOT NULL DEFAULT TRUE,

  criado_em      TIMESTAMPTZ      NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Predicado da projecao: "quais movimentacoes viram venda?" passa por aqui.
CREATE INDEX IF NOT EXISTS idx_operacoes_classificacao
  ON operacoes(classificacao)
  WHERE ativo = TRUE;


-- ------------------------------------------------------------
-- Tabela: movimentacoes
--
-- Cabecalho do documento do ERP. Espelho fiel: o que chegou, chegou.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimentacoes (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [ERP] `iderpmovimentacao`, NORMALIZADO (sem o padding de espacos com que
  -- chega: "     1294138"). NOT NULL porque toda linha desta tabela vem do
  -- ERP — diferente dos cadastros da migracao 34, que tinham historico
  -- anterior a integracao. UNIQUE: e a chave de idempotencia da sincronizacao.
  id_erp                   VARCHAR(50)   NOT NULL UNIQUE,

  -- [ERP] Sequencia do ERP DENTRO da operacao — vendas e devolucoes correm em
  -- contadores separados. Nao e unico sozinho; serve para conferir com o
  -- Alessandro e para achar buraco na sincronizacao.
  numero                   INTEGER,

  -- [ERP] Data/hora do documento. Chega SEM FUSO; a normalizacao para
  -- America/Sao_Paulo e feita na ingestao, nao aqui.
  data_movimentacao        TIMESTAMPTZ   NOT NULL,

  -- [ERP/SYS] A operacao. RESTRICT, e nao SET NULL: sem saber o que o
  -- documento e, ele nao pode ser lido nem projetado. Apagar uma operacao com
  -- movimentacao pendurada tem de doer.
  operacao_id              UUID          REFERENCES operacoes(id) ON DELETE RESTRICT,
  operacao_id_erp          VARCHAR(50),

  empresa_id               UUID          REFERENCES empresas(id) ON DELETE SET NULL,
  empresa_id_erp           VARCHAR(50),

  -- [ERP] O par de grupos de estoque: de onde a peca saiu, para onde foi.
  -- E a metade "estoque" da movimentacao.
  grupo_origem_id          UUID          REFERENCES grupos_estoque(id) ON DELETE SET NULL,
  grupo_origem_id_erp      VARCHAR(50),
  grupo_destino_id         UUID          REFERENCES grupos_estoque(id) ON DELETE SET NULL,
  grupo_destino_id_erp     VARCHAR(50),

  -- [ERP] As duas pontas do documento, como o ERP manda. Uma delas e sempre a
  -- propria loja; a outra e o terceiro. Guardadas CRUAS porque nao temos a
  -- tabela `Entidades` do Safira — la, cliente, fornecedor e a loja moram
  -- juntos, e so ele sabe dizer quem e o que.
  entidade_origem_id_erp   VARCHAR(50),
  entidade_destino_id_erp  VARCHAR(50),

  -- [SYS] O terceiro, ja resolvido: a ponta que NAO e a loja. Na venda e o
  -- destino; na devolucao e a origem.
  cliente_id               UUID          REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_id_erp           VARCHAR(50),

  vendedora_id             UUID          REFERENCES vendedoras(id) ON DELETE SET NULL,
  vendedora_id_erp         VARCHAR(50),

  -- [ERP] Valor do documento. Confere com a soma dos itens nas 24 linhas do
  -- dump, mas NAO e validado como invariante: a fonte e o ERP, e recusar o que
  -- ele manda so faria a movimentacao sumir sem ninguem ver.
  valor                    DECIMAL(15,2) NOT NULL,

  -- [ERP] Os flags `entrada`/`saida` do documento. Vem como 1.0/0.0. E o que
  -- diz o SENTIDO — e como se sabe qual das duas pontas e o cliente.
  entrada                  BOOLEAN       NOT NULL DEFAULT FALSE,
  saida                    BOOLEAN       NOT NULL DEFAULT FALSE,

  -- [ERP] Soft-delete do lado de la.
  ativo                    BOOLEAN       NOT NULL DEFAULT TRUE,

  -- [SYS] A projecao, quando existir. Nullable e assim continua: devolucao nao
  -- vira venda, transferencia nao vira venda. SET NULL para que apagar uma
  -- venda projetada nao leve junto o documento de origem.
  venda_id                 UUID          REFERENCES vendas(id) ON DELETE SET NULL,

  -- [SYS] Quando ESTE registro entrou no NOSSO banco. Diferente de
  -- `data_movimentacao`, que e a data do fato no ERP. A diferenca entre as
  -- duas e o atraso da integracao, e vale poder medir.
  recebido_em              TIMESTAMPTZ   NOT NULL DEFAULT now(),

  criado_em                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Consulta por periodo — o predicado de toda conferencia com o ERP.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data
  ON movimentacoes(data_movimentacao DESC);

-- "Quais vendas ainda nao projetei?" e "o que chegou desta operacao?".
CREATE INDEX IF NOT EXISTS idx_movimentacoes_operacao
  ON movimentacoes(operacao_id)
  WHERE ativo = TRUE;

-- A fila da projecao: movimentacao ativa que ainda nao virou venda.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_sem_venda
  ON movimentacoes(operacao_id, data_movimentacao)
  WHERE venda_id IS NULL AND ativo = TRUE;

-- Historico do cliente pelo documento.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_cliente
  ON movimentacoes(cliente_id)
  WHERE cliente_id IS NOT NULL;

-- A fila do reparo: o que chegou com id do ERP e sem FK resolvida. E o indice
-- que faz as colunas-sombra valerem alguma coisa — sem ele, achar o que
-- religar exigiria varredura da tabela inteira.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_cliente_pendente
  ON movimentacoes(cliente_id_erp)
  WHERE cliente_id IS NULL AND cliente_id_erp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movimentacoes_vendedora_pendente
  ON movimentacoes(vendedora_id_erp)
  WHERE vendedora_id IS NULL AND vendedora_id_erp IS NOT NULL;


-- ------------------------------------------------------------
-- Tabela: movimentacoes_itens
--
-- As linhas do documento. CASCADE: item nao existe sem movimentacao.
--
-- ATENCAO A UMA ARMADILHA DO DUMP: `id_mesti` NAO E CHAVE. Ele repete em todas
-- as linhas da mesma movimentacao — a de id 1354219 tem SETE itens com o mesmo
-- `id_mesti`. A chave real e (movimentacao, nitem), e e ela que esta no UNIQUE
-- abaixo. `id_erp` fica como atributo, para conferencia.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimentacoes_itens (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  movimentacao_id   UUID          NOT NULL REFERENCES movimentacoes(id) ON DELETE CASCADE,

  -- [ERP] `nitem` — a posicao da linha no documento. Parte da chave natural.
  n_item            INTEGER       NOT NULL,

  -- [ERP] `id_mesti`. Atributo, NAO identidade — ver o comentario acima.
  id_erp            VARCHAR(50),

  produto_id        UUID          REFERENCES produtos(id) ON DELETE SET NULL,
  produto_id_erp    VARCHAR(50),

  -- [ERP] DECIMAL(10,4) no mesmo formato de `itens_venda.quantidade`.
  quantidade        DECIMAL(10,4) NOT NULL,

  -- [ERP] Preco praticado na linha. Ja vem com desconto aplicado — o ERP nao
  -- manda campo de desconto separado, e a soma dos itens bate o cabecalho nas
  -- 24 movimentacoes do dump.
  valor_unitario    DECIMAL(15,2) NOT NULL,

  ativo             BOOLEAN       NOT NULL DEFAULT TRUE,

  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- A chave natural de verdade.
  CONSTRAINT uq_movimentacoes_itens_linha UNIQUE (movimentacao_id, n_item)
);

-- Carregamento do agregado.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_itens_mov
  ON movimentacoes_itens(movimentacao_id);

-- Giro por peca direto do documento do ERP.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_itens_produto
  ON movimentacoes_itens(produto_id)
  WHERE produto_id IS NOT NULL;

-- A fila do reparo, como no cabecalho: produto que veio e nao resolveu.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_itens_produto_pendente
  ON movimentacoes_itens(produto_id_erp)
  WHERE produto_id IS NULL AND produto_id_erp IS NOT NULL;


-- ------------------------------------------------------------
-- Tabela: movimentacoes_pagamentos
--
-- As PARCELAS do documento — nao "as formas de pagamento da venda".
--
-- POR QUE NAO TEM CHAVE NATURAL, E O QUE ISSO OBRIGA:
--   `id_recf` repete dentro da movimentacao, como o `id_mesti` dos itens. E
--   diferente dos itens, aqui NAO existe numero de linha: duas parcelas de
--   valor igual sao indistinguiveis uma da outra.
--
--   Por isso a ingestao NAO casa linha a linha. Ela trata a movimentacao como
--   AGREGADO: reenvio apaga os filhos e regrava. A idempotencia mora so no
--   cabecalho, onde existe chave de verdade (`id_erp`).
--
--   `n_parcela` fica aqui, nullable, para o dia em que ele mandar. Ate la,
--   permanece nulo — e a ingestao continua substituindo o agregado.
--
-- E POR QUE NAO CONFERIMOS A SOMA:
--   Nas 24 movimentacoes do dump, os pagamentos fecham o total em 4 de 18
--   vendas; 2 vendas nao tem pagamento nenhum e nenhuma das 6 devolucoes tem.
--   Nao e amostra truncada — os `numero` correm sem buraco (vendas 1120-1137,
--   devolucoes 97-102) e as duas vendas sem pagamento estao no MEIO da lista.
--   O que chega e a parcela ja lancada, nao o plano fechado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimentacoes_pagamentos (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  movimentacao_id         UUID          NOT NULL REFERENCES movimentacoes(id) ON DELETE CASCADE,

  -- [ERP] `id_recf`. Atributo, nao identidade — repete dentro do documento.
  id_erp                  VARCHAR(50),

  -- [ERP] Numero da parcela. NULLABLE porque o ERP ainda nao manda (pergunta
  -- em aberto com o Alessandro).
  n_parcela               INTEGER,

  -- [ERP/SYS] A forma cadastrada. SET NULL: a parcela sobrevive sem o de-para,
  -- e o id fica na coluna-sombra esperando o cadastro chegar.
  forma_pagamento_id      UUID          REFERENCES formas_pagamento(id) ON DELETE SET NULL,
  forma_pagamento_id_erp  VARCHAR(50),

  valor                   DECIMAL(15,2) NOT NULL,

  -- [ERP] `debcre`. Veio 'D' em 100% das 28 linhas do dump; 'C' esta previsto
  -- no CHECK porque a coluna existe do lado de la e um dia vai vir preenchida
  -- com ela. O que 'C' significa para o saldo e pergunta aberta — por isso o
  -- valor e guardado como veio, sem inverter sinal.
  debito_credito          CHAR(1)       NOT NULL DEFAULT 'D'
                                        CHECK (debito_credito IN ('D', 'C')),

  ativo                   BOOLEAN       NOT NULL DEFAULT TRUE,

  criado_em               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Carregamento do agregado.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_pagamentos_mov
  ON movimentacoes_pagamentos(movimentacao_id);

-- A fila do reparo do de-para de forma de pagamento.
CREATE INDEX IF NOT EXISTS idx_movimentacoes_pagamentos_forma_pendente
  ON movimentacoes_pagamentos(forma_pagamento_id_erp)
  WHERE forma_pagamento_id IS NULL AND forma_pagamento_id_erp IS NOT NULL;


-- ------------------------------------------------------------
-- Permissoes
--
-- UM PAR PARA AS DUAS TABELAS, pelo mesmo argumento da migracao 33: quem le
-- movimentacao precisa da operacao para saber o que ela e. Separar daria ao
-- operador a chance de ter uma e nao a outra, e o resultado seria uma tela que
-- abre sem saber dizer o que esta mostrando.
--
-- QUEM RECEBE E POR QUE:
--   ADMIN        leitura + escrita   e o unico que escreve — ver abaixo
--   GERENTE      leitura             confere receita com o ERP
--   ESTOQUISTA   leitura             a movimentacao e o que move o estoque dela
--
-- ESCRITA SO PARA O ADMIN, e isto NAO e o caso em aberto da migracao 33. La, o
-- dono do estoque ainda estava sendo discutido. Aqui nao ha duvida: a
-- movimentacao e documento fiscal, o ERP e o dono, e o CRM nunca cria uma. A
-- permissao de escrita existe para dois usos, ambos de gestao — classificar
-- uma operacao nova que chegou como OUTRA, e corrigir um de-para errado.
--
-- A VENDEDORA fica de fora ate da leitura. Ela ja ve as proprias vendas por
-- `vendas:read`; o documento cru do ERP traz as movimentacoes de todo mundo,
-- e nao ha filtro por vendedora nesta camada.
-- ------------------------------------------------------------
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',      'movimentacoes:read'),
  ('ADMIN',      'movimentacoes:write'),
  ('GERENTE',    'movimentacoes:read'),
  ('ESTOQUISTA', 'movimentacoes:read')
ON CONFLICT DO NOTHING;
