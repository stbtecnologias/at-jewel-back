--- 67 — EQUIPES: O RECORTE QUE FALTAVA ENTRE "A MINHA" E "A LOJA"
---
--- Documento de requisitos de 28/09/2026, RF-01. O cliente tem mais de uma
--- equipe de vendas, cada uma com as suas vendedoras e uma gerente, e a
--- gerente ve o desempenho DA EQUIPE DELA — nao o da loja.
---
--- ==========================================================================
--- POR QUE UMA TABELA NOVA, E NAO `empresas`.
---
--- `empresas` ja existe e parece servir: sao 8 linhas, e o nome de uma delas e
--- "AT JEWEL LTDA - SP". Mas ela e entidade FISCAL do ERP — quem emite a nota
--- —, e nao time de vendas. Duas coisas provam que nao serve:
---
---   1. A venda aponta para `empresa_id`, e "AT JEWEL LTDA - SP" tem ZERO
---      movimentacoes e ZERO linhas de estoque (conferido em 28/09/2026).
---      Recortar por empresa daria NADA para a gerente de SP.
---   2. Uma vendedora atende cliente de mais de uma empresa do grupo. O time
---      dela nao muda por causa de qual CNPJ emitiu a nota.
---
--- Entao equipe e conjunto de PESSOAS, e o recorte de venda vai por
--- `vendedora_id IN (as da equipe)`. Funciona hoje, com o dado que existe, e
--- continua funcionando quando SP entrar.
--- ==========================================================================
---
--- ESTA MIGRACAO NAO CADASTRA NINGUEM. Ela cria a estrutura e as colunas; quem
--- esta em qual equipe e decisao do cliente, e ate 28/09/2026 so a lista de
--- Fortaleza foi passada — a de SP nao. Sem vinculo, `equipe_id` fica NULL e
--- TUDO se comporta exatamente como antes: e o que torna esta migracao segura
--- de subir antes de a resposta chegar.

CREATE TABLE IF NOT EXISTS equipes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          varchar(120) NOT NULL,
  descricao     text,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

--- Nome unico entre as ATIVAS. Desativar uma equipe e recriar outra com o
--- mesmo nome e operacao legitima (reestruturacao); ter duas ativas chamadas
--- "Fortaleza" e erro de digitacao que ninguem percebe ate o relatorio sair
--- pela metade.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipes_nome_ativa
  ON equipes (lower(nome)) WHERE ativo;

--- A VENDEDORA PERTENCE A UMA EQUIPE.
---
--- `ON DELETE SET NULL` e nao CASCADE: apagar uma equipe nao pode apagar as
--- vendedoras dela. Sem equipe, a vendedora volta ao comportamento de antes —
--- atendida normalmente, e fora do recorte de qualquer gerente.
ALTER TABLE vendedoras
  ADD COLUMN IF NOT EXISTS equipe_id uuid REFERENCES equipes(id) ON DELETE SET NULL;

--- A GERENTE RESPONDE POR UMA EQUIPE.
---
--- Mora em `admin_users` e nao numa tabela de ligacao porque a relacao e
--- UMA equipe por gerente — foi assim que o cliente descreveu ("a gerente de
--- Fortaleza tem acesso as vendas da equipe dela de Fortaleza, a gerente de SP
--- as de SP"). Tabela de ligacao permitiria duas, e permitir o que ninguem
--- pediu e criar um estado que ninguem sabe interpretar.
---
--- NAO CONFUNDIR COM PERMISSAO. Esta coluna diz DE QUAL equipe; quem decide se
--- a pessoa ve vendas de equipe alguma continua sendo `vendas:read_all`. Uma
--- ADMIN com `equipe_id` NULL e `vendas:read_all` ve a loja inteira, como hoje.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS equipe_id uuid REFERENCES equipes(id) ON DELETE SET NULL;

--- Parciais: a esmagadora maioria das linhas fica com NULL enquanto o cadastro
--- nao acontece, e indexar NULL nao ajuda consulta nenhuma.
CREATE INDEX IF NOT EXISTS idx_vendedoras_equipe
  ON vendedoras (equipe_id) WHERE equipe_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_equipe
  ON admin_users (equipe_id) WHERE equipe_id IS NOT NULL;

COMMENT ON TABLE equipes IS
  'Time de vendas: um conjunto de vendedoras e a gerente que responde por elas. Nao e entidade fiscal — para isso existe `empresas`.';
COMMENT ON COLUMN vendedoras.equipe_id IS
  'A equipe da vendedora. NULL = sem equipe, fora do recorte de qualquer gerente.';
COMMENT ON COLUMN admin_users.equipe_id IS
  'A equipe pela qual esta pessoa responde, quando gerente. NULL + vendas:read_all = ve a loja inteira.';
