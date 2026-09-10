--- 54 — PERMISSAO DE ESCRITA NOS ATENDIMENTOS
---
--- ==========================================================================
--- NASCE DE UMA COISA SO: PODER REABRIR O QUE FOI FECHADO.
---
--- Ate 08/09/2026 nao existia escrita de atendimento pelo painel, e nao
--- precisava: quem abre, move e fecha episodio e o canal interno — a Elena
--- pergunta, a vendedora responde, o sistema anota. O painel so lia.
---
--- O que mudou foi a decisao do MEL-15: a leitura da conversa no numero
--- corporativo vai FECHAR atendimento sozinha, sem perguntar a ninguem. Um
--- engano do modelo tira o episodio da fila — para de ser cobrado, some das
--- pendencias, e a cliente cai do acompanhamento. Sem erro na tela.
---
--- Fechamento que nao se desfaz nao deveria ser automatico. Entao a permissao
--- de desfazer vem ANTES do leitor.
--- ==========================================================================
---
--- OS MESMOS DOIS PAPEIS DA LEITURA (migracao 38): ADMIN e GERENTE. A
--- VENDEDORA continua de fora pelo mesmo motivo de la — ela ja tem a propria
--- agenda pelo canal interno, com escopo que nao alcanca a de ninguem mais, e
--- dar acesso pelo painel abriria o que o canal fecha por ausencia de caminho.

INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',   'atendimentos:write'),
  ('GERENTE', 'atendimentos:write')
ON CONFLICT DO NOTHING;

--- ==========================================================================
--- ATENCAO A QUEM FOR APLICAR: O CACHE DE PERMISSOES E EM MEMORIA.
---
--- O `PermissionsService` guarda o mapa papel -> permissoes no processo. Rodar
--- esta migracao com a API no ar NAO libera nada: o back segue com o mapa
--- antigo e responde "acesso negado" para um ADMIN legitimo.
---
--- Aconteceu duas vezes em 04/09, com as migracoes 47 e 51. REINICIE O BACK
--- depois de aplicar.
--- ==========================================================================
