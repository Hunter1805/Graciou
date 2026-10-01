/**
 * Sonda: espera de verdade e observa a ordem de execucao dos scripts.
 * Instrumenta window.GRACIOU_CATALOGO e window.GRACIOU_STORE no inicio.
 */
export default async function run(page, ui) {
  // Instala espiões ANTES de qualquer script da pagina rodar
  await page.addInitScript(() => {
    window.__PROBE__ = { eventos: [] };
    const marcar = (nome) => window.__PROBE__.eventos.push(nome + '@' + Date.now() % 100000);

    Object.defineProperty(window, 'GRACIOU_CATALOGO', {
      configurable: true,
      set(v) { marcar('CATALOGO_definido'); this.__cat = v; },
      get() { return this.__cat; }
    });
    Object.defineProperty(window, 'GRACIOU_STORE', {
      configurable: true,
      set(v) { marcar('STORE_definida'); this.__store = v; },
      get() { return this.__store; }
    });

    document.addEventListener('DOMContentLoaded', () => marcar('DOMContentLoaded'));
    window.addEventListener('load', () => marcar('load'));
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);

  return page.evaluate(() => ({
    eventos: window.__PROBE__.eventos,
    catalogo: typeof window.GRACIOU_CATALOGO,
    catalogoProdutos: window.GRACIOU_CATALOGO ? window.GRACIOU_CATALOGO.PRODUTOS.length : null,
    store: typeof window.GRACIOU_STORE,
    storeProdutos: window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null,
    cards: document.querySelectorAll('[data-product-grid] .p-card[data-produto-id]').length,
    scripts: document.querySelectorAll('script').length,
    scriptsComSrc: Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
    scriptsInline: Array.from(document.querySelectorAll('script:not([src])')).map((s) => s.textContent.length)
  }));
}