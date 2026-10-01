/** Sonda 10: o inline chega inteiro no DOM? */
export default async function run(page, ui) {
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const inline = Array.from(document.querySelectorAll('script:not([src])'))
      .map((s) => s.textContent.length);
    const totalInline = inline.reduce((a, b) => a + b, 0);
    return {
      scriptInline: inline,
      totalInline: totalInline,
      funcoesNoWindow: Object.keys(window).filter((k) => k.indexOf('__GRACIOU') === 0),
      catalogo: typeof window.GRACIOU_CATALOGO,
      renderizado: String(window.__GRACIOU_RENDERIZADO__),
      // Onde exatamente o inline para?
      fimDoInline: (function () {
        const s = document.querySelectorAll('script:not([src])');
        const maior = Array.from(s).sort((a, b) => b.textContent.length - a.textContent.length)[0];
        return maior ? maior.textContent.slice(-160) : 'SEM INLINE';
      })(),
      comecaInline: (function () {
        const s = document.querySelectorAll('script:not([src])');
        const maior = Array.from(s).sort((a, b) => b.textContent.length - a.textContent.length)[0];
        return maior ? maior.textContent.slice(0, 120) : 'SEM INLINE';
      })()
    };
  });
  return r;
}