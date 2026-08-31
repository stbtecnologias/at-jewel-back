export const CATALOGO_REPOSITORY = Symbol('ICatalogoRepository');

/**
 * Armazenamento de arquivo. E porta de proposito: hoje o adaptador escreve em
 * disco, e a troca por S3 e um adaptador novo — nenhum use case muda, e as
 * chaves ja gravadas continuam valendo.
 */
export const ARMAZENAMENTO = Symbol('IArmazenamento');
export const TRATAMENTO_IMAGEM = Symbol('ITratamentoImagem');
