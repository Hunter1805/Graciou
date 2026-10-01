/** QA do grid renderizado a partir de GRACIOU_STORE.products */
export default async function run(page, ui) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  return {
    erros,
    store: await page.evaluate(() => ({
      temStore: typeof window.GRACIOU_STORE,
      produtosNaStore: window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null,
      renderizado: window.__GRACIOU_GRID_RENDERIZADO__
    })),
    dom: await page.evaluate(() => {
      const grid = document.querySelector('[data-product-grid]');
      const novos = Array.from(grid.querySelectorAll('.p-card[data-produto-id]'));
      return {
        temAtributo: !!grid,
        qtdRenderizados: novos.length,
        ids: novos.map((c) => c.dataset.produtoId),
        nomes: novos.map((c) => {
          const n = c.querySelector('.p-card__name');
          return n ? n.textContent.trim() : null;
        }),
        categorias: novos.map((c) => {
          const n = c.querySelector('.p-card__cat');
          return n ? n.textContent.trim() : null;
        }),
        precos: novos.map((c) => {
          const p = c.querySelector('.p-card__price');
          return p ? p.textContent.trim() : '(sem preço)';
        }),
        tamanhos: novos.map((c) =>
          Array.from(c.querySelectorAll('.p-card__size-chip')).map((s) => s.textContent).join(' ')),
        botoes: novos.map((c) => {
          const b = c.querySelector('[data-acao="ver-produto"]');
          return b ? b.textContent.trim() : null;
        }),
        classesDoCard: novos[0] ? novos[0].className : null,
        legadoAindaExiste: !!grid.querySelector('.p-card-legado'),
        legadoOculto: (function () {
          const l = grid.querySelector('.p-card-legado');
          return l ? l.offsetParent === null : null;
        })(),
        // As regras CSS de cor continuam no documento?
        regrasCor: ['creme', 'off-white', 'preto', 'verde-musgo', 'verde-militar', 'marrom']
          .filter((c) => Array.from(document.styleSheets).some((sh) => {
            try {
              return Array.from(sh.cssRules).some((r) => r.selectorText &&
                r.selectorText.includes('.p-card__img--' + c));
            } catch (e) { return false; }
          })).length
      };
    })
  };
}