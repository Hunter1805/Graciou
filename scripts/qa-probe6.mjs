/** Sonda 6: o que o Vite serve em dados/catalogo.js? */
export default async function run(page, ui) {
  const urls = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]'))
      .map((s) => s.src)
      .filter((u) => u.includes('catalogo')));

  const conteudo = await page.evaluate(async (u) => {
    const r = await fetch(u, { cache: 'no-store' });
    const t = await r.text();
    return { url: u, status: r.status, chars: t.length, ini: t.slice(0, 300), fim: t.slice(-300) };
  }, urls[0] || 'dados/catalogo.js');

  return { urls, conteudo, tipo: await page.evaluate(() => typeof window.GRACIOU_CATALOGO) };
}