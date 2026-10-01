/**
 * QA temporário do catálogo central no collection.html
 * (usado durante esta etapa; pode ser removido depois)
 */
export default async function run(page, ui) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const estado = () =>
    page.evaluate(() => ({
      visiveis: Array.from(document.querySelectorAll('#products-grid > .p-card'))
        .filter((c) => c.style.display !== 'none').length,
      ids: Array.from(document.querySelectorAll('#products-grid > .p-card'))
        .map((c) => c.dataset.produtoId),
      resultados: (document.getElementById('results-count') || {}).textContent,
      total: (document.getElementById('total-count') || {}).textContent,
      contadores: Array.from(document.querySelectorAll('.filter-btn__count'))
        .map((n) => n.textContent),
      legadoVisivel: Array.from(document.querySelectorAll('.p-card-legado .p-card'))
        .some((c) => c.offsetParent !== null)
    }));

  const inicial = await estado();

  await page.click('#filter-move');
  await page.waitForTimeout(500);
  const move = await estado();

  await page.click('#filter-drop01');
  await page.waitForTimeout(500);
  const drop01 = await estado();

  await page.click('#filter-all');
  await page.waitForTimeout(500);
  const limpo = await estado();

  await page.selectOption('#sort-select', 'alpha');
  await page.waitForTimeout(500);
  const ordemAZ = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#products-grid > .p-card'))
      .filter((c) => c.style.display !== 'none')
      .map((c) => c.dataset.name));

  return { erros, inicial, move, drop01, limpo, ordemAZ };
}