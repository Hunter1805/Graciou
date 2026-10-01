/**
 * Sonda: quais scripts a pagina REALMENTE requisita?
 */
export default async function run(page, ui) {
  const pedidos = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script' || r.url().endsWith('.js')) {
      pedidos.push(r.url());
    }
  });

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);

  const dom = await page.evaluate(() => ({
    todasAsTagsScript: Array.from(document.querySelectorAll('script')).map((s) => ({
      src: s.getAttribute('src'),
      type: s.getAttribute('type'),
      defer: s.defer,
      async: s.async,
      inline: !s.getAttribute('src') ? s.textContent.length : null
    })),
    store: typeof window.GRACIOU_STORE,
    catalogo: typeof window.GRACIOU_CATALOGO,
    marcadores: Object.keys(window).filter((k) => k.indexOf('GRACIOU') === 0),
    cards: document.querySelectorAll('[data-product-grid] .p-card[data-produto-id]').length
  }));

  return { pedidosDeScript: pedidos, dom };
}