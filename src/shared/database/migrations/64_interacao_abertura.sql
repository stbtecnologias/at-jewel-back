--- 64 — O ATENDIMENTO GANHA UM PONTO DE ABERTURA
---
--- ==========================================================================
--- A LINHA DO TEMPO DESENHAVA O FIM DO ATENDIMENTO E NAO O COMECO.
---
--- Dos seis ramos, um le `atendimentos.fechado_em` e vira o ponto FECHAMENTO.
--- Nao havia par: o instante em que o episodio comecou nao aparecia em lugar
--- nenhum. Ninguem tinha notado porque o atendimento sempre nascia junto com
--- alguma interacao, que desenhava um ponto por conta propria.
---
--- Ficou visivel em 23/09/2026, quando a triagem passou a ABRIR atendimento
--- para cliente com cadastro: o lead encaminhado e a interacao de abertura
--- caiam no mesmo minuto e, por compartilharem o tipo `ENCAMINHADO`, a tela
--- mostrava duas bolinhas com a MESMA frase — "Cliente encaminhado".
---
--- O Lucas leu certo o que estava errado: nao era registro duplicado, eram
--- dois acontecimentos diferentes com a mesma etiqueta.
---
---   "ele ficaria um registro de Lead encaminhado e outro de Atendimento
---    iniciado, algo assim"
--- ==========================================================================
---
--- POR QUE UM TIPO DE INTERACAO, E NAO UM RAMO NOVO LENDO `aberto_em`.
---
--- Escolha do Lucas entre as duas. A interacao ja existia para o atendimento
--- nao nascer mudo — ela carrega o resumo da triagem, que e o que a vendedora
--- procura quando abre a tela. Fazendo dela o proprio ponto de abertura, o
--- texto e o ponto ficam no mesmo lugar, e nao ha ramo a mais na consulta.
---
--- O PRECO, e ele fica dito: atendimento aberto pela vendedora ou pela gestao
--- continua SEM ponto de abertura, porque ninguem grava esta interacao ali.
--- Nao e regressao — e o estado de sempre —, mas passa a ser uma assimetria
--- visivel, e o conserto e gravar a mesma interacao naqueles caminhos.
---
--- ==========================================================================
--- `ADD VALUE IF NOT EXISTS` — mesmo padrao da migracao 53, que acrescentou
--- CONTATO_CLIENTE e RESPOSTA_VENDEDORA. Re-executavel, e nao reescreve a
--- tabela: valor de enum e so catalogo.
---
--- O valor NAO PODE SER USADO na mesma transacao em que nasce, e nao e
--- problema aqui: quem o usa e a aplicacao, depois do deploy.
--- ==========================================================================

ALTER TYPE tipo_interacao ADD VALUE IF NOT EXISTS 'ABERTURA';

COMMENT ON COLUMN atendimento_interacoes.tipo IS
  'O que aconteceu no atendimento. ABERTURA e o inicio do episodio (64); CONTATO_CLIENTE e RESPOSTA_VENDEDORA vem do WhatsApp corporativo (53); o resto e do fluxo interno (35).';
