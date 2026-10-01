/**
 * GRACIOU — reexportação ESM do catálogo central.
 * Arquivo: dados/catalogo.mjs
 *
 * NÃO contém produtos. É apenas uma ponte para quem importa por módulo:
 *
 *   import CATALOGO from './dados/catalogo.mjs'
 *
 * A fonte única continua sendo dados/catalogo.js.
 */

import CATALOGO from './catalogo.js';

export default CATALOGO;

export const META = CATALOGO.META;
export const PRODUTOS = CATALOGO.PRODUTOS;
export const ORDEM_TAMANHOS = CATALOGO.ORDEM_TAMANHOS;
export const CAMPOS_OBRIGATORIOS = CATALOGO.CAMPOS_OBRIGATORIOS;
export const lista = CATALOGO.lista;
export const busca = CATALOGO.busca;
export const porCategoria = CATALOGO.porCategoria;
export const ordenarTamanhos = CATALOGO.ordenarTamanhos;
export const precoExibicao = CATALOGO.precoExibicao;
export const formatarPreco = CATALOGO.formatarPreco;
export const verificarIntegridade = CATALOGO.verificarIntegridade;
export const resumo = CATALOGO.resumo;