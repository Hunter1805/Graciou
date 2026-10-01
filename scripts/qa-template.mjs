/** Sonda: o <template> quebra o parse? Testa o HTML real com e sem ele. */
export default async function run(page, ui) {
  // Pega o HTML servido
  const html = await page.evaluate(async () => {
    const r = await fetch(location.href, { cache: 'no-store' });
    return r.text();
  });

  const resultados = {};

  // 1. Testa o HTML como está, num iframe
  resultados.comoTemplate = await page.evaluate((h) => {
    return new Promise((resolve) => {
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-9999px;width:1200px;height:900px';
      document.body.appendChild(ifr);
      ifr.onload = () => {
        const d = ifr.contentDocument;
        resolve({
          bodyChars: d.body ? d.body.textContent.length : null,
          scripts: d.querySelectorAll('script').length,
          temGrid: !!d.querySelector('[data-product-grid]'),
          cards: d.querySelectorAll('.p-card[data-produto-id]').length
        });
      };
      ifr.srcdoc = h;
    });
  }, html);

  // 2. Testa o MESMO HTML sem a tag <template>...</template>
  const semTemplate = html.replace(/<template[\s\S]*?<\/template>/g, '');
  resultados.semTemplate = await page.evaluate((h) => {
    return new Promise((resolve) => {
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:absolute;left:-9999px;width:1200px;height:900px';
      document.body.appendChild(ifr);
      ifr.onload = () => {
        const d = ifr.contentDocument;
        resolve({
          bodyChars: d.body ? d.body.textContent.length : null,
          scripts: d.querySelectorAll('script').length,
          temGrid: !!d.querySelector('[data-product-grid]'),
          cards: d.querySelectorAll('.p-card[data-produto-id]').length
        });
      };
      ifr.srcdoc = h;
    });
  }, semTemplate);

  return resultados;
}