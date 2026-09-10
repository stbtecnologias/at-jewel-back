--- 53 — O CONTATO PELO WHATSAPP DA VENDEDORA VIRA INTERACAO
---
--- Ate 08/09/2026 o `atendimento_interacoes` guardava so o que NOS fazemos: o
--- encaminhamento, o lembrete, a cobranca, e o relato que a vendedora digita
--- depois. A conversa em si acontecia entre dois telefones pessoais, fora de
--- qualquer sistema — esta escrito no cabecalho da migracao 39.
---
--- Isso mudou hoje: a vendedora passa a ter um numero corporativo pareado no
--- painel, e o que passa por ele e legivel. Entao o contato deixa de ser
--- invisivel e vira o que sempre foi: um acontecimento do atendimento.
---
--- ==========================================================================
--- POR QUE INTERACAO, E NAO UMA TABELA DE MENSAGENS.
---
--- A tentacao seria espelhar o WhatsApp numa tabela nossa. Duas razoes para
--- nao:
---
---   1. O QR da acesso a CONTA, nao ao trabalho (ver 39). Copiar as mensagens
---      para ca faria o nosso banco guardar a conta inteira da vendedora,
---      inclusive o que nao e da loja. O WAHA ja guarda, e a tela le ao vivo.
---
---   2. Como INTERACAO, o contato entra no episodio que ja existe. A view
---      `vw_atendimentos_auditoria` calcula a etapa a partir das interacoes,
---      entao o contato da cliente MOVE A ETAPA sozinho — sem nenhuma regra
---      nova. E a Linha do Tempo e a Auditoria mostram o ponto de graca,
---      porque as duas ja leem esta tabela.
--- ==========================================================================
---
--- O CONTEUDO da conversa nao entra aqui. O que entra e a LEITURA dela: uma
--- linha curta no `relato`, que ja e cifrado em AES-256-GCM, escrita pela IA
--- quando ela ler a conversa (MEL-15). Enquanto isso nao existe, o ponto
--- registra o fato: quem falou, quando, e por qual numero.

--- CONTATO_CLIENTE   — a cliente escreveu para o numero da vendedora
--- RESPOSTA_VENDEDORA — a vendedora respondeu por aquele numero
---
--- Sao dois e nao um porque a diferenca e o indicativo: cliente que escreve e
--- nao recebe resposta e exatamente o que a gestao precisa enxergar, e com um
--- tipo so os dois casos ficariam identicos na regua.
ALTER TYPE tipo_interacao ADD VALUE IF NOT EXISTS 'CONTATO_CLIENTE';
ALTER TYPE tipo_interacao ADD VALUE IF NOT EXISTS 'RESPOSTA_VENDEDORA';

--- O CHECK `ck_interacao_notificar` (migracao 35) ja cobre os dois: ele exige
--- `notificar_em` apenas para LEMBRETE e COBRANCA, e libera todo o resto. Nao
--- ha constraint a mexer.

--- Buscar "a ultima interacao deste tipo neste atendimento" e o que evita que
--- uma rajada de oito mensagens em cinco minutos vire oito pontos na regua.
--- Sem indice, isso seria um seq scan por mensagem recebida.
CREATE INDEX IF NOT EXISTS idx_interacoes_atendimento_tipo_recente
  ON atendimento_interacoes(atendimento_id, tipo, ocorrido_em DESC);

COMMENT ON TYPE tipo_interacao IS
  'O que aconteceu no atendimento. CONTATO_CLIENTE e RESPOSTA_VENDEDORA vem do WhatsApp corporativo (53); o resto e do fluxo interno (35).';
