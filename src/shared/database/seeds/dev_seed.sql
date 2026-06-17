-- =====================================================================
-- DEV SEED — A.T. JEWEL (somente ambiente local / homolog de teste)
-- Popula dados ficticios coerentes para dar vida aos paineis:
--   analytics (receita mensal, top produtos, giro, pagamentos, demografia,
--   origem, datas comemorativas), tiers de clientes, alertas de estoque,
--   metas e ocorrencias (defeitos/devolucoes).
--
-- NAO insere PII em colunas criptografadas: telefone/email/whatsapp ficam
-- NULL (sao nullable). Apenas `nome` (varchar, texto puro) e preenchido.
--
-- Idempotente: limpa as tabelas de negocio antes de recriar.
-- Rodar:
--   docker exec -i atjewel_postgres psql -U atjewel -d atjewel_dev \
--     -v ON_ERROR_STOP=1 < src/shared/database/seeds/dev_seed.sql
-- =====================================================================

BEGIN;

-- Limpeza (sandbox local — sem dados reais). CASCADE cobre itens/pagamentos,
-- perfis, conversas e agente_eventos dependentes.
TRUNCATE TABLE
  pagamentos_venda, itens_venda, vendas,
  defeitos_devolucoes, metas,
  clientes_perfil, clientes,
  produtos, vendedoras
  RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------
-- VENDEDORAS (6)
-- ---------------------------------------------------------------------
INSERT INTO vendedoras (codigo_erp, nome, tipo, status_disponibilidade, especialidades) VALUES
  ('SEED-VD01', 'Marina Albuquerque', 'GERENTE', 'DISPONIVEL', ARRAY['aneis','noivado']),
  ('SEED-VD02', 'Camila Rezende',     'LOCAL',   'DISPONIVEL', ARRAY['colares','brincos']),
  ('SEED-VD03', 'Beatriz Nogueira',   'LOCAL',   'OCUPADA',    ARRAY['pulseiras','prata']),
  ('SEED-VD04', 'Patricia Vasquez',   'EXTERNA', 'DISPONIVEL', ARRAY['alta_joalheria','diamantes']),
  ('SEED-VD05', 'Larissa Coutinho',   'LOCAL',   'DISPONIVEL', ARRAY['presentes','folheados']),
  ('SEED-VD06', 'Renata Siqueira',    'EXTERNA', 'FERIAS',    ARRAY['investimento','ouro']),
  ('SEED-VD07', 'Juliana Prado',      'LOCAL',   'DISPONIVEL', ARRAY['aneis','prata']),
  ('SEED-VD08', 'Carolina Mattos',    'EXTERNA', 'OCUPADA',   ARRAY['colares','diamantes']);

-- ---------------------------------------------------------------------
-- PRODUTOS (120) — variados; alguns com estoque baixo e/ou giro lento
-- ---------------------------------------------------------------------
INSERT INTO produtos
  (codigo_erp, categoria, familia, colecao, cor, tipo_pedra, descricao_etiqueta,
   peso_gramas, unidade, valor_compra, valor_custo, margem_percentual, valor_venda,
   estoque_atual, data_entrada_estoque, ativo)
SELECT
  'SEED-P' || lpad(g::text, 4, '0'),
  (ARRAY['Anel','Colar','Brinco','Pulseira','Pingente','Alianca','Conjunto'])[1 + (g % 7)],
  (ARRAY['Ouro 18k','Prata 925','Ouro Branco','Folheado','Ouro Rose'])[1 + (g % 5)],
  (ARRAY['Solitario','Classica','Vintage','Glamour','Minimalista','Imperial'])[1 + (g % 6)],
  (ARRAY['Dourado','Prateado','Rose','Branco'])[1 + (g % 4)],
  (ARRAY['Diamante','Safira','Esmeralda','Rubi','Zirconia','Perola',NULL])[1 + (g % 7)],
  (ARRAY['Anel','Colar','Brinco','Pulseira','Pingente','Alianca','Conjunto'])[1 + (g % 7)]
    || ' ' || (ARRAY['Solitario','Classica','Vintage','Glamour','Minimalista','Imperial'])[1 + (g % 6)]
    || ' ' || (ARRAY['Diamante','Safira','Esmeralda','Rubi','Zirconia','Perola','Ouro'])[1 + (g % 7)],
  round((2 + random() * 28)::numeric, 2),
  'un',
  round((150 + random() * 3500)::numeric, 2),
  round((200 + random() * 4200)::numeric, 2),
  round((40 + random() * 60)::numeric, 2),
  round((300 + random() * 7700)::numeric, 2),
  -- estoque: produtos 1..14 ficam baixos (0..2) p/ alertas; restante 3..25
  CASE WHEN g <= 14 THEN (g - 1) % 3 ELSE 3 + floor(random() * 23)::int END,
  -- data de entrada: maioria antiga (giro), alguns recentes
  CASE WHEN g % 7 = 0
       THEN now() - (random() * 50 || ' days')::interval          -- recente
       ELSE now() - ((120 + random() * 360) || ' days')::interval  -- antigo (>90d)
  END,
  true
FROM generate_series(1, 120) AS g;

-- ---------------------------------------------------------------------
-- CLIENTES (60) — nome em texto puro; PII criptografada fica NULL
-- ---------------------------------------------------------------------
INSERT INTO clientes (codigo_erp, nome, tipo_pessoa, tabela_preco, ativo)
SELECT
  'SEED-C' || lpad(g::text, 4, '0'),
  (ARRAY['Ana','Beatriz','Carla','Daniela','Eduarda','Fernanda','Gabriela','Helena',
         'Isabela','Juliana','Karina','Leticia','Mariana','Natalia','Olivia','Paula',
         'Queila','Renata','Sofia','Tatiana','Ursula','Vanessa','Wanda','Yara'])[1 + (g % 24)]
    || ' ' ||
  (ARRAY['Silva','Souza','Oliveira','Pereira','Costa','Almeida','Carvalho','Gomes',
         'Martins','Rocha','Ribeiro','Barbosa','Teixeira','Moreira','Mendes','Freitas'])[1 + (g % 16)],
  CASE WHEN g % 12 = 0 THEN 'juridica'::tipo_pessoa ELSE 'fisica'::tipo_pessoa END,
  (ARRAY['varejo','varejo','varejo','atacado','especial','funcionario'])[1 + (g % 6)]::tabela_preco,
  true
FROM generate_series(1, 200) AS g;

-- ---------------------------------------------------------------------
-- PERFIS DE CLIENTE — sexo, faixa etaria, origem (alimentam demografia/origem)
-- ---------------------------------------------------------------------
INSERT INTO clientes_perfil (cliente_id, sexo, faixa_etaria, origem_contato, estado_conversa, primeiro_contato_em)
SELECT
  c.id,
  (ARRAY['F','F','F','F','M','M','OUTRO','NAO_INFORMADO'])[1 + (row_number() OVER (ORDER BY c.id))::int % 8]::sexo_cliente,
  (ARRAY['18-24','25-34','25-34','35-44','35-44','45-54','55+'])[1 + (row_number() OVER (ORDER BY c.id))::int % 7],
  (ARRAY['whatsapp','whatsapp','instagram','instagram','site','indicacao','loja_fisica','outro'])[1 + (row_number() OVER (ORDER BY c.id))::int % 8]::origem_contato,
  (ARRAY['IN_HUMAN_SERVICE','IN_HUMAN_SERVICE','READY_FOR_ROUTING','WAITING_OWNER_APPROVAL','TRIAGE_IN_PROGRESS','NEEDS_HUMAN'])[1 + (row_number() OVER (ORDER BY c.id))::int % 6]::estado_conversa_agente,
  now() - ((random() * 300) || ' days')::interval
FROM clientes c;

-- ---------------------------------------------------------------------
-- VENDAS + ITENS + PAGAMENTOS — picos sazonais (Maes/Namorados/Natal/Carnaval)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  ym        text[] := ARRAY['2025-05','2025-06','2025-07','2025-08','2025-09','2025-10',
                            '2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
  wt        int[]  := ARRAY[ 120,      115,      70,       70,       72,       70,
                             80,       165,      64,       95,       70,       88,       130,      60 ];
  v_seq     int := 0;
  midx      int;
  n_mes     int;
  i         int;
  k         int;
  dia_max   int;
  v_data    timestamptz;
  v_cliente uuid;
  v_vend    uuid;
  v_venda   uuid;
  v_status  status_venda;
  v_nitems  int;
  v_qtd     numeric;
  v_unit    numeric;
  v_custo   numeric;
  v_itot    numeric;
  v_bruto   numeric;
  v_desc    numeric;
  v_total   numeric;
  v_forma   forma_pagamento;
  v_parc    int;
  r         numeric;
  prod      RECORD;
BEGIN
  FOR midx IN 1 .. array_length(ym, 1) LOOP
    n_mes := wt[midx];
    -- mes corrente (2026-06): limita aos dias ja decorridos
    dia_max := CASE WHEN ym[midx] = '2026-06' THEN 16 ELSE 27 END;

    FOR i IN 1 .. n_mes LOOP
      v_seq := v_seq + 1;
      v_data := (ym[midx] || '-01')::timestamptz
                + (floor(random() * dia_max) || ' days')::interval
                + (9 + floor(random() * 10) || ' hours')::interval;

      r := random();
      v_status := CASE WHEN r < 0.85 THEN 'concluida'
                       WHEN r < 0.93 THEN 'pendente'
                       ELSE 'cancelada' END::status_venda;

      SELECT id INTO v_cliente FROM clientes ORDER BY random() LIMIT 1;
      SELECT id INTO v_vend    FROM vendedoras ORDER BY random() LIMIT 1;

      INSERT INTO vendas
        (codigo_erp, cliente_id, vendedora_id, data_venda, data_contato,
         valor_bruto, valor_desconto, valor_total, status, criado_em, atualizado_em)
      VALUES
        ('SEED-V' || lpad(v_seq::text, 5, '0'), v_cliente, v_vend, v_data,
         v_data - (floor(random() * 5) || ' days')::interval,
         0, 0, 0, v_status, v_data, v_data)
      RETURNING id INTO v_venda;

      v_nitems := 1 + floor(random() * 3);  -- 1..3 itens
      v_bruto := 0;

      FOR k IN 1 .. v_nitems LOOP
        SELECT id, valor_venda, valor_custo INTO prod
          FROM produtos ORDER BY random() LIMIT 1;
        v_qtd  := 1 + floor(random() * 2);  -- 1..2
        v_unit := prod.valor_venda;
        v_custo := COALESCE(prod.valor_custo, round(v_unit * 0.5, 2));
        v_itot := round(v_unit * v_qtd, 2);

        INSERT INTO itens_venda
          (venda_id, produto_id, quantidade, valor_unitario,
           valor_custo_unitario, valor_desconto_item, valor_total_item)
        VALUES
          (v_venda, prod.id, v_qtd, v_unit, v_custo, 0, v_itot);

        v_bruto := v_bruto + v_itot;
      END LOOP;

      v_desc  := round((v_bruto * (random() * 0.12))::numeric, 2);
      v_total := round(v_bruto - v_desc, 2);
      UPDATE vendas
         SET valor_bruto = v_bruto, valor_desconto = v_desc, valor_total = v_total
       WHERE id = v_venda;

      -- Pagamento (1 por venda) — distribuicao realista
      r := random();
      v_forma := CASE WHEN r < 0.35 THEN 'pix'
                      WHEN r < 0.65 THEN 'cartao_credito'
                      WHEN r < 0.77 THEN 'cartao_debito'
                      WHEN r < 0.87 THEN 'dinheiro'
                      WHEN r < 0.95 THEN 'crediario'
                      ELSE 'transferencia' END::forma_pagamento;
      v_parc := CASE WHEN v_forma IN ('cartao_credito','crediario')
                     THEN 1 + floor(random() * 10)::int ELSE 1 END;

      INSERT INTO pagamentos_venda
        (venda_id, forma_pagamento, valor, parcelas, valor_parcela, data_pagamento)
      VALUES
        (v_venda, v_forma, v_total, v_parc, round(v_total / v_parc, 2), v_data);
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Vendas geradas: %', v_seq;
END $$;

-- ---------------------------------------------------------------------
-- METAS (uma por tipo) — referencias reais aos dados recem-criados
-- ---------------------------------------------------------------------
INSERT INTO metas (tipo, referencia_id, valor_alvo, prazo, descricao) VALUES
  ('GLOBAL', NULL, 600000.00, '2026-12-31 23:59:59-03', 'Faturamento global 2026');

INSERT INTO metas (tipo, referencia_id, valor_alvo, prazo, descricao)
SELECT 'POR_VENDEDORA', id, 90000.00, '2026-08-31 23:59:59-03',
       'Meta da vendedora ' || nome
FROM vendedoras WHERE codigo_erp = 'SEED-VD01';

INSERT INTO metas (tipo, referencia_id, valor_alvo, prazo, descricao)
SELECT 'POR_PRODUTO', id, 25000.00, '2026-09-30 23:59:59-03',
       'Meta do produto ' || descricao_etiqueta
FROM produtos WHERE codigo_erp = 'SEED-P0010';

INSERT INTO metas (tipo, referencia_id, valor_alvo, prazo, descricao)
SELECT 'POR_CLIENTE', id, 18000.00, '2026-10-31 23:59:59-03',
       'Meta do cliente ' || nome
FROM clientes WHERE codigo_erp = 'SEED-C0001';

-- ---------------------------------------------------------------------
-- DEFEITOS / DEVOLUCOES / RECLAMACOES (14) — metade resolvida
-- ---------------------------------------------------------------------
INSERT INTO defeitos_devolucoes (produto_id, tipo, descricao, data, resolucao)
SELECT
  pr.id,
  (ARRAY['DEFEITO','DEVOLUCAO','RECLAMACAO'])[1 + (g % 3)]::tipo_defeito,
  (ARRAY[
    'Fecho com folga apos uso',
    'Cliente desistiu da compra dentro do prazo',
    'Banho desgastou em poucas semanas',
    'Pedra solta na guarnicao',
    'Tamanho incorreto entregue',
    'Risco na superficie ao receber',
    'Alergia relatada pela cliente',
    'Diferenca de cor em relacao a foto'])[1 + (g % 8)],
  now() - ((random() * 180) || ' days')::interval,
  CASE WHEN g % 2 = 0
       THEN (ARRAY['Trocado por novo','Reembolso integral','Reparo realizado em assistencia','Ajuste de tamanho refeito'])[1 + (g % 4)]
       ELSE NULL END
FROM generate_series(1, 40) AS g
CROSS JOIN LATERAL (SELECT id FROM produtos ORDER BY random() LIMIT 1) pr;

COMMIT;

-- Resumo
SELECT 'vendedoras' AS tabela, count(*) FROM vendedoras
UNION ALL SELECT 'produtos', count(*) FROM produtos
UNION ALL SELECT 'clientes', count(*) FROM clientes
UNION ALL SELECT 'clientes_perfil', count(*) FROM clientes_perfil
UNION ALL SELECT 'vendas', count(*) FROM vendas
UNION ALL SELECT 'vendas_concluidas', count(*) FROM vendas WHERE status='concluida'
UNION ALL SELECT 'itens_venda', count(*) FROM itens_venda
UNION ALL SELECT 'pagamentos_venda', count(*) FROM pagamentos_venda
UNION ALL SELECT 'metas', count(*) FROM metas
UNION ALL SELECT 'defeitos_devolucoes', count(*) FROM defeitos_devolucoes;
