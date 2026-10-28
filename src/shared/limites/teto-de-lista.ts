/**
 * O TETO DE UMA LISTA — um número para a casa inteira.
 *
 * ==========================================================================
 * *"Tem que subir para caber até a maior lista que ela pedir. Isso de todas
 * as consultas, tanto Helena como Anastasia. Mesmo que saia um listão — a
 * cliente quer assim mesmo. E claro, quando solicitar essa mesma consulta em
 * PDF."* — Lucas, 28/10/2026.
 * ==========================================================================
 *
 * ERAM QUATRO TETOS DIFERENTES, e nenhum deles cabia:
 *
 *   TETO_DO_ARQUIVO    500   as listas da gestão
 *   LIMITE_DO_ARQUIVO  500   as vendas uma a uma
 *   TETO_DE_LINHAS   2.000   os dois relatórios do painel
 *
 * O de 500 mordia num recorte que a gestora pede: as vendas da AT JEWEL LTDA
 * desde 2023 são 1.110, e o PDF saía com 500 — dito pelo "Exibindo 500 de
 * 1.110", mas 610 vendas de fora.
 *
 * O NÚMERO SAIU DA MEDIÇÃO, e não de um palpite. A maior lista que cada
 * consulta da casa pode devolver, medida no banco em 28/10/2026:
 *
 *   produtos (o catálogo inteiro)        7.423   <- a maior
 *   itens de movimentação                2.383
 *   vendas (todas as saídas, sempre)     1.412
 *   clientes ativos                      1.112
 *   a maior empresa                      1.110
 *   produtos com saldo                     587
 *   leads                                  531
 *   a maior vendedora                      422
 *   a maior carteira                       156
 *
 * VINTE MIL É 2,7x A MAIOR DE HOJE. Cobre o crescimento de alguns anos sem
 * precisar de outra decisão, e continua sendo um NÚMERO: consulta sem teto
 * nenhum é um caminho para uma query acidental trazer a base inteira para a
 * memória, e esse risco não se corrige depois.
 *
 * E O PDF AGUENTA — medido com o renderizador de verdade, em 28/10:
 *
 *    1.110 linhas   0,14 MB   0,7s
 *    1.412 linhas   0,18 MB   0,6s
 *    7.423 linhas   0,94 MB   6,9s
 *   20.000 linhas   2,52 MB  18,9s
 *
 * O WhatsApp aceita documento até 100 MB, então o tamanho não é o limite. O
 * TEMPO é o que merece olho: no teto, a geração leva uns dezenove segundos, e
 * ela acontece dentro do atendimento da mensagem. Na maior lista real de hoje
 * — o catálogo — são sete.
 *
 * ACIMA DO TETO O CORTE CONTINUA DITO, pelo "Exibindo N de M" que a tabela
 * carrega. Teto silencioso mente por omissão; este não é silencioso.
 */
export const TETO_DE_LISTA = 20_000;
