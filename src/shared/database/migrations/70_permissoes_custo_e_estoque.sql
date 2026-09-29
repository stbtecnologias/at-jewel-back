--- 70 — AS QUATRO PERMISSOES DE 28/09 CHEGAM AOS PAPEIS
---
--- ==========================================================================
--- ELAS NASCERAM SO NO CATALOGO TYPESCRIPT, E ISSO ERA METADE DO TRABALHO.
---
--- Em 28/09/2026 o documento de perfis criou quatro chaves novas:
---
---   produtos:custo       preco de custo da peca e a margem
---   estoque:quantidade   a quantidade por peca
---   estoque:valor        o valor financeiro do estoque
---   clientes:contato     telefone e e-mail sem mascara
---
--- Elas entraram em `src/modules/auth/domain/permissions.ts`, que e o que a
--- tela de Papeis LISTA. Mas `role_permissions` — quem de fato tem o que — e
--- populada por MIGRACAO neste projeto (ver 30, 31, 33), e essa parte ficou
--- para tras.
---
--- No ambiente local as quatro foram marcadas a mao, pela tela. Producao nao
--- tem nada: subir o codigo sem isto faria o ADMIN PERDER, no dia seguinte,
--- custo, margem, quantidade por peca, valor do inventario e telefone sem
--- mascara. Nao quebra — SOME, e parece defeito.
--- ==========================================================================
---
--- ==========================================================================
--- QUEM RECEBE O QUE, E POR QUE O GERENTE_VENDAS NAO RECEBE NADA.
---
---   ADMIN           as quatro. E a "Equipe AT" do documento.
---   GERENTE         as tres de produto, e NAO `clientes:contato`.
---   SUPERADMIN      nao aparece aqui: entra pelo curinga `*`.
---   GERENTE_VENDAS  NENHUMA — e o papel restrito criado em 28/09 para a
---                   gerente de vendedoras, que ve disponivel/indisponivel e
---                   preco de venda, e nada alem. Dar qualquer uma destas
---                   desfaria o motivo de ele existir.
---   VENDEDORA       nenhuma, pela mesma razao (RN-03: negar por padrao).
---
--- O `ON CONFLICT DO NOTHING` deixa a migracao ser rodada duas vezes sem
--- erro, e — mais importante — nao desfaz ajuste que alguem ja tenha feito
--- pela tela. Se a gestao tirar `estoque:valor` do GERENTE amanha, rodar isto
--- de novo nao devolve.
--- ==========================================================================

INSERT INTO role_permissions (role_chave, permissao)
VALUES
  ('ADMIN',   'produtos:custo'),
  ('ADMIN',   'estoque:quantidade'),
  ('ADMIN',   'estoque:valor'),
  ('ADMIN',   'clientes:contato'),
  ('GERENTE', 'produtos:custo'),
  ('GERENTE', 'estoque:quantidade'),
  ('GERENTE', 'estoque:valor')
ON CONFLICT (role_chave, permissao) DO NOTHING;

--- ==========================================================================
--- O CACHE PRECISA CAIR — E ELE NAO CAI SOZINHO.
---
--- `PermissionsService` guarda as permissoes EM MEMORIA e so invalida quando
--- a alteracao passa pelos casos de uso da tela de Papeis. SQL direto no
--- banco nao avisa ninguem.
---
--- Entao: DEPOIS desta migracao, REINICIAR O BACK. Sem isso as quatro chaves
--- existem no banco e continuam invisiveis ate o proximo restart por outro
--- motivo — e o sintoma seria "marquei e nao funcionou".
--- ==========================================================================
