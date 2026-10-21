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
 */
const TITULOS: Record<string, string> = {
  // Gestão
  vendas_detalhadas: 'Vendas',
  gestao_vendas: 'Vendas por vendedora',
  itens_mais_vendidos: 'Itens mais vendidos',
  faturamento_por_empresa: 'Faturamento por empresa',
  gestao_metas: 'Metas',
  gestao_agenda: 'Agenda',
  funil_de_atendimentos: 'Funil de atendimentos',
  feedbacks_de_vendedora: 'Feedbacks das vendedoras',
  clientes_sem_comprar: 'Clientes sem comprar',
  melhores_clientes: 'Melhores clientes',
  clientes_por_epoca: 'Clientes por época',
  clientes_por_fidelidade: 'Clientes por fidelidade',
  carteira_de_vendedora: 'Carteira',
  leads_da_gestao: 'Leads',
  pecas_por_valor: 'Peças por valor',
  consultar_produtos: 'Peças',
  // Vendedora
  consultar_minha_carteira: 'Minha carteira',
  meus_leads: 'Meus leads',
  consultar_agenda: 'Minha agenda',
  consultar_vendas: 'Minhas vendas',
  consultar_metas: 'Minhas metas',
};

export function tituloDaFerramenta(nome: string): string {
  return TITULOS[nome] ?? 'Consulta';
}
