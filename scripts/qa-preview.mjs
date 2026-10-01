/** QA do catálogo central no preview.html */
export default async function run(page, ui) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  return {
    erros,
    grid: await page.evaluate(() => {
      const grid = document.getElementById('graciou-drop-grid');
      const legado = document.querySelector('.asym-grid-legado');
      const cards = Array.from(document.querySelectorAll('#graciou-drop-grid .product-card'));
      return {
        cards: cards.length,
        ids: cards.map((c) => c.dataset.produtoId),
        nomes: cards.map((c) => (c.querySelector('.product-card__name') || {}).textContent),
        categorias: cards.map((c) => (c.querySelector('.product-card__cat') || {}).textContent),
        precos: cards.map((c) => (c.querySelector('.product-card__price') || {}).textContent.trim()),
        classesCor: cards.map((c) => {
          const ph = c.querySelector('.product-card__img-placeholder');
          return ph ? ph.className.replace('product-card__img-placeholder ', '') + (ph.hasAttribute('data-invert') ? ' [invert]' : '') : null;
        }),
        legadoVisivel: legado ? legado.offsetParent !== null : 'AUSENTE',
        linhasVisiveis: Array.from(grid.querySelectorAll('.asym-row')).map((r) => !r.hidden),
        status: (document.getElementById('catalogo-status') || {}).textContent
      };
    })
  };
}