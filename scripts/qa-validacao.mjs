/**
 * VALIDAÇÃO FINAL — item 11, medindo após a página estabilizar.
 * 1. window.GRACIOU_STORE existe
 * 2. .products.length === 8
 * 3. 8 cards renderizados
 * 4. console com zero erros
 */
export default async function run(page, ui) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  const falhasRede = [];
  page.on('requestfailed', (r) => falhasRede.push(r.url() + ' :: ' + ((r.failure() || {}).errorText || '')));
  page.on('response', (r) => { if (r.status() >= 400) falhasRede.push(r.url() + ' :: HTTP ' + r.status()); });

  // Espera a store E o grid ficarem prontos (sem chutar tempo)
  await page.waitForFunction(
    () => window.GRACIOU_STORE && window.GRACIOU_STORE.products.length === 8,
    { timeout: 15000 }
  ).catch(() => {});
  await page.waitForFunction(
    () => document.querySelectorAll('[data-product-grid] .p-card[data-produto-id]').length === 8,
    { timeout: 15000 }
  ).catch(() => {});

  const r = await page.evaluate(() => {
    const grid = document.querySelector('[data-product-grid]');
    const cards = grid ? Array.from(grid.querySelectorAll('.p-card[data-produto-id]')) : [];
    const store = window.GRACIOU_STORE;

    return {
      '11.1 storeExiste': typeof store === 'object' && store !== null,
      '11.2 productsLength': store ? store.products.length : null,
      '11.2 leituraRepetidaIgual': store ? (store.products.length === store.products.length) : null,
      '11.2 idsUnicos': store
        ? (store.products.map((p) => p.id).length === new Set(store.products.map((p) => p.id)).size)
        : null,
      '11.2 ids': store ? store.products.map((p) => p.id) : null,
      '11.3 cards': cards.length,
      '11.3 nomes': cards.map((c) => (c.querySelector('.p-card__name') || {}).textContent.trim()),
      '11.3 categorias': cards.map((c) => (c.querySelector('.p-card__cat') || {}).textContent.trim()),
      '11.3 cores': cards.map((c) => {
        const ph = c.querySelector('.p-card__img-ph');
        if (!ph) return null;
        return ph.className.replace('p-card__img-ph ', '') + (ph.hasAttribute('data-invert') ? ' [invert]' : '');
      }),
      '11.3 precos': cards.map((c) => {
        const p = c.querySelector('.p-card__price');
        return p ? p.textContent.trim() : '(sem preco)';
      }),
      '11.3 botao': cards.length ? (cards[0].querySelector('[data-acao="ver-produto"]') || {}).textContent : null,
      '11.3 tamanhos': cards.map((c) =>
        Array.from(c.querySelectorAll('.p-card__size-chip')).map((s) => s.textContent).join(' ')),
      'extra.getProduct': store ? (store.getProduct('tee-raizes') || {}).nome : null,
      'extra.catalogoPronto': store ? store.catalogoPronto() : null,
      'extra.legadoPreservado': !!(grid && grid.querySelector('.p-card-legado')),
      'extra.classeDoGrid': grid ? grid.className : null,
      'extra.bodyChars': document.body.textContent.length
    };
  });

  return { errosConsole: erros, falhasRede, resultados: r };
}