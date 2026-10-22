--- 76 — O CATALOGO EXCLUIDO, QUE NAO E APAGADO
---
--- 22/10/2026. O Lucas criou um catalogo pela conversa, quis desfazer e nao
--- achou como: *"nao consigo excluir ou desativar o catalogo"*.
---
--- A primeira versao do botao chamava o DELETE que ja existia. Ele reconsiderou
--- no mesmo dia: *"ainda acho melhor nao apagar diretamente; podemos colocar
--- excluir, mas internamente tratamos como desativada, onde elas nao tem
--- acesso"*.
---
--- E POR QUE UM STATUS, E NAO UMA COLUNA `excluido_em`:
---
--- O unico portao do WhatsApp para os catalogos e o `listarAbertos`, que
--- filtra `status = 'COLETANDO'` — e dele saem as SEIS chamadas da agente
--- (perguntar de qual catalogo e a foto, pendurar, completar por codigo,
--- oferecer a lista...). Sendo status, o excluido some das seis POR
--- CONSTRUCAO. Com uma coluna nova, cada uma precisaria de um
--- `AND excluido_em IS NULL` — e a setima consulta, escrita daqui a um mes,
--- esqueceria.
---
--- O CHECK da migracao 42 e quem barra o valor novo, entao ele precisa ser
--- refeito. Nenhuma linha muda de status aqui: a migracao so passa a ACEITAR
--- 'EXCLUIDO'.

ALTER TABLE catalogos
  DROP CONSTRAINT IF EXISTS catalogos_status_check;

ALTER TABLE catalogos
  ADD CONSTRAINT catalogos_status_check
  CHECK (status IN ('RASCUNHO', 'COLETANDO', 'PUBLICADO', 'ENCERRADO', 'EXCLUIDO'));

COMMIT;
