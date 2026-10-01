/** Sonda: onde exatamente o DOM para de crescer? */
export default async function run(page, ui) {
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const body = document.body;
    const filhos = Array.from(body.children).map((c) => ({
      tag: c.tagName,
      cls: (c.className || '').toString().slice(0, 40),
      chars: c.textContent.length,
      temGrid: !!c.querySelector('[data-product-grid]')
    }));

    return {
      bodyChars: body.textContent.length,
      htmlChars: document.documentElement.outerHTML.length,
      qtdFilhosDoBody: body.children.length,
      filhos: filhos,
      // O grid existe no DOM?
      gridExiste: !!document.querySelector('[data-product-grid]'),
      // Onde esta o grid no body?
      gridPai: (function () {
        const g = document.querySelector('[data-product-grid]');
        return g ? g.parentElement.tagName + '.' + (g.parentElement.className || '') : 'NAO EXISTE';
      })(),
      // O script inline existe?
      scriptsInline: Array.from(document.querySelectorAll('script:not([src])'))
        .map((s) => s.textContent.length),
      // Marcadores JS
      marcadores: Object.keys(window).filter((k) => k.indexOf('GRACIOU') === 0)
    };
  });
}