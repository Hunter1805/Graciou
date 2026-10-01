/**
 * Sonda: quando cada coisa existe?
 * A store aparece e depois some? Os 8 cards vem da store?
 */
export default async function run(page, ui) {
  return page.evaluate(async () => {
    const log = [];
    const snap = (rotulo) => log.push({
      rotulo,
      store: typeof window.GRACIOU_STORE,
      produtos: window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null,
      catalogo: typeof window.GRACIOU_CATALOGO,
      cards: document.querySelectorAll('[data-product-grid] .p-card[data-produto-id]').length
    });

    snap('imediatamente');

    await new Promise((r) => setTimeout(r, 500));
    snap('500ms');

    await new Promise((r) => setTimeout(r, 1500));
    snap('2s');

    await new Promise((r) => setTimeout(r, 3000));
    snap('5s');

    // O catalogo existe agora?
    const cat = window.GRACIOU_CATALOGO;

    return {
      linhaDoTempo: log,
      catalogoDetalhe: cat ? {
        temProdutos: Array.isArray(cat.PRODUTOS),
        qtd: cat.PRODUTOS ? cat.PRODUTOS.length : null,
        chaves: Object.keys(cat).slice(0, 12)
      } : null,
      // A store se auto-define depois de um tempo?
      testeManual: (function () {
        try {
          return 'GRACIOU_STORE=' + typeof window.GRACIOU_STORE;
        } catch (e) { return 'ERRO ' + e.message; }
      })()
    };
  });
}