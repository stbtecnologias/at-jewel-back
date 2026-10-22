/**
 * DINHEIRO EM PALAVRA DE GENTE — e num lugar só.
 *
 * ==========================================================================
 * SAIU DE `ferramentas-gestao.service.ts` EM 22/10/2026, e por um defeito de
 * verdade: o serviço da estratégia de vendas (RF38) precisava desta função e
 * importou de lá — mas o `ferramentas-gestao` passou a importar o serviço da
 * estratégia no mesmo dia. **Ciclo de import.**
 *
 * O sintoma não foi erro de compilação: foi o Nest, na subida, dizendo
 * *"can't resolve dependencies... argument at index [29]"*. Um dos dois
 * módulos chega `undefined` no momento em que o decorador lê os tipos, e o
 * container não tem como saber o que injetar.
 *
 * Função sem dependência nenhuma não tem por que morar dentro de um serviço
 * de 3.000 linhas. Aqui ela não puxa nada, então ninguém faz ciclo com ela.
 * ==========================================================================
 *
 * SEM CENTAVOS, de propósito: a conversa fala "R$ 26.300", e não
 * "R$ 26.300,00". O centavo aparece onde o documento exige — no PDF do
 * relatório e na planilha, que formatam por conta própria.
 */
export function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}
