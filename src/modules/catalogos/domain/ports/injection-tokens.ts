export const CATALOGO_REPOSITORY = Symbol('ICatalogoRepository');

/**
 * Armazenamento de arquivo. E porta de proposito: hoje o adaptador escreve em
 * disco, e a troca por S3 e um adaptador novo — nenhum use case muda, e as
 * chaves ja gravadas continuam valendo.
 */
export const ARMAZENAMENTO = Symbol('IArmazenamento');
export const TRATAMENTO_IMAGEM = Symbol('ITratamentoImagem');

/**
 * Conferencia da foto ANTES de tratar — desde 15/09/2026.
 *
 * Porta separada do tratamento de proposito: sao dois provedores diferentes
 * (Claude olha, OpenAI gera) e duas falhas independentes. Juntas numa porta
 * so, a indisponibilidade de um derrubaria o outro.
 */
export const CONFERENCIA_FOTO = Symbol('IConferenciaFoto');

/**
 * Leitura das PAGINAS de referencia — desde 15/09/2026. Separada do
 * tratamento e da conferencia porque e outra pergunta, feita uma vez por
 * catalogo e nao por foto.
 */
export const ESTILO_CATALOGO = Symbol('IEstiloCatalogo');

/** Quem traduz "na página 4, a modelo sorrindo" em ações — desde 16/09/2026. */
export const INTERPRETADOR_AJUSTE = Symbol('IInterpretadorDeAjuste');
