--- 75 — O GERENTE DE VENDAS TAMBEM MANDA FOTO DE PECA
---
--- RF33, 20/10/2026. O Lucas listou quem pode mandar foto para o produto:
--- marketing, admin, superadmin e gerente de vendas.
---
--- Medido na hora: `produtos:foto` estava com ADMIN, ESTOQUISTA, GERENTE e
--- MARKETING — e NAO com GERENTE_VENDAS, que ja tinha `catalogo:write`. O
--- SUPERADMIN nao precisa de linha: ele tem o curinga `*`.
---
--- E a diferenca nao e teorica: das 10 contas de producao, 5 sao SUPERADMIN,
--- 4 sao ADMIN e **1 e GERENTE_VENDAS** — que e justamente quem ficaria de
--- fora. Nao ha nenhuma conta de ESTOQUISTA nem de MARKETING.

INSERT INTO role_permissions (role_chave, permissao)
VALUES ('GERENTE_VENDAS', 'produtos:foto')
ON CONFLICT DO NOTHING;
