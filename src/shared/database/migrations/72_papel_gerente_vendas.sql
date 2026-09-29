--- 72 — O PAPEL `GERENTE_VENDAS`
---
--- ==========================================================================
--- ELE EXISTIA SO NO BANCO LOCAL, CRIADO A MAO EM 28/09/2026.
---
--- O documento de perfis pediu um papel para a GERENTE DAS VENDEDORAS: alguem
--- que acompanha vendas, metas, agenda e catalogo do time, e NAO ve o
--- faturamento da loja. Ele foi criado pela tela de Papeis no ambiente local e
--- nunca virou migracao — entao producao nunca o teve.
---
--- O codigo JA CONTA COM ELE. Ha decisoes tomadas em funcao deste papel em
--- pelo menos cinco lugares (`chat-anastasia`, `ferramentas-gestao`,
--- `processar-mensagem-gestao`, `rotear-mensagem-interna`, `anthropic.client`),
--- e todas so aparecem em comentario — o que torna a falta invisivel: nada
--- quebra, o papel simplesmente nao existe para escolher na tela.
--- ==========================================================================
---
--- ==========================================================================
--- O QUE ELE TEM, E — MAIS IMPORTANTE — O QUE ELE NAO TEM.
---
--- NAO TEM `analytics:read`. E a razao de existir: a gerente das vendedoras
--- acompanha o time, e o faturamento da LOJA nao e assunto dela. Foi a decisao
--- do Lucas em 28/09, e dar essa chave aqui desfaria o papel inteiro.
---
--- NAO TEM `produtos:custo`, `estoque:quantidade` nem `estoque:valor`. Ela ve
--- se a peca esta disponivel e o preco de venda — nada alem. Ver a migracao 70,
--- que deliberadamente nao o inclui.
---
--- TEM `vendas:read_all` e `clientes:read_all`, mas eles NAO significam mais
--- "a loja inteira": desde a migracao 67 o `EscopoVendasService` recorta pela
--- EQUIPE de quem pergunta. Sem `equipe_id` preenchido em `admin_users`, o
--- recorte nao recorta e ela ve tudo — por isso o cadastro da equipe e o passo
--- que falta para este papel valer de verdade.
---
--- `is_system = false`: papel de negocio, editavel pela tela. Os de sistema
--- (SUPERADMIN e companhia) sao os que a tela protege de alteracao.
--- ==========================================================================

INSERT INTO roles (chave, nome, descricao, is_system)
VALUES ('GERENTE_VENDAS', 'Gerente de Vendas', 'Gerente das vendedoras', false)
ON CONFLICT (chave) DO NOTHING;

--- `ON CONFLICT DO NOTHING` em vez de `DO UPDATE`: se alguem ja ajustou as
--- permissoes pela tela, rodar isto de novo nao desfaz o ajuste. O carimbo do
--- `schema_migrations` impede a re-execucao no caminho normal; esta guarda e
--- para o caminho anormal.
INSERT INTO role_permissions (role_chave, permissao)
VALUES
  ('GERENTE_VENDAS', 'agentes:anastasia'),
  ('GERENTE_VENDAS', 'atendimentos:read'),
  ('GERENTE_VENDAS', 'catalogo:read'),
  ('GERENTE_VENDAS', 'catalogo:write'),
  ('GERENTE_VENDAS', 'clientes:read'),
  ('GERENTE_VENDAS', 'clientes:read_all'),
  ('GERENTE_VENDAS', 'clientes:write'),
  ('GERENTE_VENDAS', 'metas:read'),
  ('GERENTE_VENDAS', 'produtos:read'),
  ('GERENTE_VENDAS', 'vendas:read'),
  ('GERENTE_VENDAS', 'vendas:read_all'),
  ('GERENTE_VENDAS', 'vendedoras:read')
ON CONFLICT (role_chave, permissao) DO NOTHING;

--- ==========================================================================
--- DEPOIS DESTA MIGRACAO: REINICIAR O BACK.
---
--- `PermissionsService` guarda as permissoes em memoria e so invalida quando a
--- alteracao passa pelos casos de uso da tela. SQL direto nao avisa ninguem —
--- o sintoma seria "criei o papel e ele nao funciona".
---
--- E ESTA MIGRACAO NAO ATRIBUI O PAPEL A NINGUEM. Quem e a gerente de vendas e
--- decisao de gente, feita na tela de Usuarios. Sem ninguem nele, o papel fica
--- disponivel e inerte — que e o estado certo para um papel recem-criado.
--- ==========================================================================
