/**
 * PROVA DO BLOQUEIO
 * Tarefa 4/5 pede: ler window.GRACIOU_STORE.products e renderizar 8 produtos.
 * Este teste mostra o que essa fonte contém de fato, em todos os cenários.
 */
export default async function run(page, ui) {
  return page.evaluate(async () => {
    const txt = await (await fetch('assets/graciou-store.js?prova=1', { cache: 'no-store' })).text();
    const semSourceMap = txt.split('//# sourceMappingURL')[0];

    const r = {};

    // Cenario A: como a pagina carrega hoje (ordem real do HTML)
    r.A_paginaAtual_store = typeof window.GRACIOU_STORE;
    r.A_paginaAtual_produtos = window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null;
    r.A_paginaAtual_catalogo = typeof window.GRACIOU_CATALOGO;

    // Cenario B: executar store SEM o catalogo existir
    const w = {};
    const fakeWin = { addEventListener() {}, dispatchEvent() {}, localStorage: { getItem: () => null, setItem() {} } };
    try {
      new Function('window', 'localStorage', 'CustomEvent', semSourceMap)(fakeWin, fakeWin.localStorage, function () {});
      r.B_semCatalogo_produtos = fakeWin.GRACIOU_STORE ? fakeWin.GRACIOU_STORE.products.length : 'store nao criada';
    } catch (e) { r.B_semCatalogo_produtos = 'ERRO: ' + e.message; }

    // Cenario C: executar store COM o catalogo ja carregado (ordem ideal)
    const fakeWin2 = { GRACIOU_CATALOGO: { PRODUTOS: [1, 2, 3, 4, 5, 6, 7, 8], busca: () => null },
                       addEventListener() {}, dispatchEvent() {},
                       localStorage: { getItem: () => null, setItem() {} } };
    try {
      new Function('window', 'localStorage', 'CustomEvent', semSourceMap)(fakeWin2, fakeWin2.localStorage, function () {});
      r.C_comCatalogo_produtos = fakeWin2.GRACIOU_STORE ? fakeWin2.GRACIOU_STORE.products.length : 'store nao criada';
    } catch (e) { r.C_comCatalogo_produtos = 'ERRO: ' + e.message; }

    // O array de produtos dentro do arquivo esta realmente vazio?
    r.D_products_estaVazio = /const products = \[\];/.test(semSourceMap);

    return r;
  });
}