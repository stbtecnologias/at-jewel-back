/**
 * COMO SE CHAMA, NO PAPEL, O QUE CADA FERRAMENTA RESPONDE — 21/10/2026.
 *
 * ==========================================================================
 * O TÍTULO É A ÚNICA COISA QUE O ARQUIVO TEM ANTES DE SER ABERTO.
 *
 * Ele vira o nome do arquivo no celular, a legenda na conversa e o cabeçalho
 * da folha. "relatorio.pdf" ninguém acha três dias depois; "clientes-sem-
 * comprar-21-10-2026.pdf" se acha.
 *
 * O MODELO NÃO ESCOLHE ESTE NOME — foi o que deu errado em 21/10 às 14:14,
 * quando ele rotulou de "Faturamento por empresa" um arquivo com vendas
 * dentro. Aqui o nome vem da FERRAMENTA que respondeu, e ela não mente sobre
 * o que fez.
 * ==========================================================================
 *
 * Ferramenta que não estiver nesta lista cai em "Consulta", que é feio e
 * honesto — e aparecer feio é o que faz alguém vir aqui escrever o nome.
 *
 * ==========================================================================
 * QUATRO DESTES NOMES ESTAVAM ERRADOS — corrigido em 21/10/2026.
 *
 * `gestao_vendas`, `gestao_metas`, `gestao_agenda` e `leads_da_gestao` são os
 * nomes dos HANDLERS (`params.gestaoVendas`), e não das FERRAMENTAS
 * (`vendas_de_vendedora`, `listar_leads`). Chaveando pela coluna errada, as
 * quatro consultas mais pedidas da gestão caíam em "Consulta" — e chave
 * errada não reclama: devolve o vazio com cara de resposta.
 *
 * É a mesma pegadinha de `formas_pagamento.id_erp` em 20/10. O spec deste
 * arquivo agora confere cada chave contra os nomes de ferramenta de verdade.
 * ==========================================================================
 */
export const TITULOS_POR_FERRAMENTA: Record<string, string> = {
  // Gestão — a loja e a equipe
  vendas_detalhadas: 'Vendas',
  vendas_de_vendedora: 'Vendas da vendedora',
  metas_de_vendedora: 'Metas da vendedora',
  agenda_de_vendedora: 'Agenda da vendedora',
  dia_da_vendedora: 'O dia da vendedora',
  panorama_da_equipe: 'Panorama da equipe',
  quem_mais_vende: 'Quem mais vende',
  itens_mais_vendidos: 'Itens mais vendidos',
  faturamento_por_empresa: 'Faturamento por empresa',
  comparar_com_outros_anos: 'Comparação com outros anos',
  comparar_com_periodo_anterior: 'Comparação com o período anterior',
  // Gestão — atendimento e leads
  funil_de_atendimentos: 'Funil de atendimentos',
  metricas_de_atendimento: 'Métricas de atendimento',
  rankings_de_atendimento: 'Rankings de atendimento',
  feedbacks_de_vendedora: 'Feedbacks das vendedoras',
  conversas_agora: 'Conversas agora',
  tom_da_conversa: 'Tom da conversa',
  listar_leads: 'Leads',
  panorama_de_leads: 'Panorama de leads',
  listar_vendedoras: 'Vendedoras',
  // Gestão — clientes e peças
  clientes_sem_comprar: 'Clientes sem comprar',
  melhores_clientes: 'Melhores clientes',
  melhores_da_vendedora: 'Melhores clientes da vendedora',
  clientes_por_epoca: 'Clientes por época',
  clientes_por_fidelidade: 'Clientes por fidelidade',
  carteira_de_vendedora: 'Carteira',
  de_quem_e_o_cliente: 'De quem é o cliente',
  pecas_por_valor: 'Peças por valor',
  consultar_produtos: 'Peças',
  // Vendedora
  consultar_minha_carteira: 'Minha carteira',
  meus_leads: 'Meus leads',
  consultar_agenda: 'Minha agenda',
  consultar_vendas: 'Minhas vendas',
  consultar_metas: 'Minhas metas',
  minhas_pecas_por_valor: 'Minhas peças por valor',
  meus_clientes_por_fidelidade: 'Meus clientes por fidelidade',
  // As duas que são da PESSOA, e não da loja
  meus_lembretes: 'Meus lembretes',
  listar_combinados: 'Combinados',
};

export function tituloDaFerramenta(nome: string): string {
  return TITULOS_POR_FERRAMENTA[nome] ?? 'Consulta';
}
