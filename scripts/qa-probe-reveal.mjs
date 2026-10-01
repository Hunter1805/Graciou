/** Sonda: os cards estão com data-reveal pendente (invisíveis)? */
export default async function run(page, ui) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#products-grid > .p-card[data-produto-id]'));
    return {
      total: cards.length,
      comReveal: cards.filter((c) => c.hasAttribute('data-reveal')).length,
      revelados: cards.filter((c) => c.classList.contains('revealed')).length,
      opacidades: cards.map((c) => getComputedStyle(c).opacity),
      alturas: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
      fnReveal: typeof window.__GRACIOU_ATIVAR_REVEAL__,
      renderizado: String(window.__GRACIOU_RENDERIZADO__)
    };
  });
}