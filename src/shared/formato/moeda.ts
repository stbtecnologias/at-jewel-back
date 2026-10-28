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
 * COM CENTAVOS — 28/10/2026, e isto REVERTE a decisão de 22/10.
 *
 * Até ontem esta função cortava o centavo de propósito: *"a conversa fala
 * R$ 26.300, e não R$ 26.300,00"*. O Lucas desfez:
 *
 *   *"Se a função moeda() está arredondando, tem que ajustar antes de mostrar
 *    na tela do Whats ou PDF para o cliente."*
 *
 * O valor que chega a quem lê é o que ela confere contra a nota e contra o
 * ERP. Das 1.412 vendas ativas desde 2023, 53 têm centavo — e a soma delas
 * fecha em R$ 68.003.012,58, enquanto a soma dos arredondados dá
 * R$ 68.003.016,00.
 *
 * NAO VOLTAR A CORTAR. O parágrafo do ciclo de import, acima, segue valendo;
 * a regra do centavo é esta.
 *
 * E ISTO ALINHA, não diverge: o painel já mostra centavo (`src/lib/moeda.ts`
 * no front, com `minimumFractionDigits: 2`). Quem estava fora do padrão era a
 * conversa da Anastasia. Decisão de 25/09: *"front e o whats devem estar
 * alinhados, sem informações divergentes"*.
 *
 * SEMPRE DUAS CASAS, inclusive em valor redondo: "R$ 26.300,00". Esconder o
 * ",00" faria a mesma lista alternar entre dois desenhos conforme o número, e
 * quem lê uma coluna de valores repara na coluna, não no número.
 */
export function moeda(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
