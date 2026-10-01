/** Sonda 5: file:// — por que o catalogo nao carrega? */
export default async function run(page, ui) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => erros.push(m.type() + ': ' + m.text()));
  page.on('requestfailed', (r) => erros.push('requestfailed: ' + r.url() + ' :: ' + (r.failure() || {}).errorText));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(async () => {
    const scripts = Array.from(document.scripts).map((s) => ({
      src: s.getAttribute('src') || 'inline',
      type: s.getAttribute('type')
    }));

    let manual = 'nao testado';
    try {
      const r = await fetch('dados/catalogo.js');
      manual = 'fetch status ' + r.status;
    } catch (e) {
      manual = 'fetch ERRO: ' + e.message;
    }

    try {
      new Function('window.__X__ = 1')();
    } catch (e) { /* noop */ }

    return { scripts, manual, tipo: typeof window.GRACIOU_CATALOGO, fn: window.__X__ };
  });

  return { erros, info };
}