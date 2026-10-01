/** Sonda: por que window.GRACIOU_STORE não existe? */
export default async function run(page, ui) {
  const reqs = [];
  page.on('response', (r) => {
    if (r.url().includes('graciou-store')) {
      reqs.push({ url: r.url(), status: r.status(), type: r.request().resourceType() });
    }
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('graciou-store')) {
      reqs.push({ url: r.url(), FALHOU: (r.failure() || {}).errorText });
    }
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  return {
    reqs,
    estado: await page.evaluate(() => ({
      temStore: typeof window.GRACIOU_STORE,
      temCatalogo: typeof window.GRACIOU_CATALOGO,
      produtosCatalogo: window.GRACIOU_CATALOGO ? window.GRACIOU_CATALOGO.PRODUTOS.length : null,
      // a tag <script> de graciou-store existe no DOM?
      tagStore: Array.from(document.querySelectorAll('script[src]'))
        .filter((s) => s.getAttribute('src') && s.getAttribute('src').includes('graciou-store'))
        .map((s) => ({ src: s.getAttribute('src'), resolved: s.src, defer: s.defer, type: s.getAttribute('type') }))
    }))
  };
}