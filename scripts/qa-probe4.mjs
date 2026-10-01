/** Sonda 4: o script clássico do catálogo executa no Vite? */
export default async function run(page, ui) {
  const reqs = [];
  page.on('response', (r) => {
    if (r.url().includes('catalogo')) reqs.push({ url: r.url(), status: r.status(), type: r.request().resourceType() });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(async () => {
    // O script classicos sao movidos para o fim do body pelo Vite;
    // conta quantos scripts existem e o que cada um define
    const scripts = Array.from(document.scripts).map((s) => ({
      src: s.getAttribute('src') || 'inline',
      type: s.getAttribute('type')
    }));

    // Tenta carregar o catalogo manualmente como script classico
    const manual = await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'dados/catalogo.js';
      s.onload = () => resolve('carregou; GRACIOU_CATALOGO=' + typeof window.GRACIOU_CATALOGO);
      s.onerror = () => resolve('erro ao carregar');
      document.head.appendChild(s);
    });

    return {
      scripts,
      manual,
      tipoDepois: typeof window.GRACIOU_CATALOGO,
      marcadorRender: window.__GRACIOU_RENDERIZADO__
    };
  });

  // Executa o texto do catalogo diretamente para capturar o erro real
  const direto = await page.evaluate(async () => {
    const txt = await (await fetch('dados/catalogo.js')).text();
    try {
      // eslint-disable-next-line no-new-func
      new Function(txt)();
      return 'executou; tipo=' + typeof window.GRACIOU_CATALOGO;
    } catch (e) {
      return 'ERRO: ' + e.name + ': ' + e.message;
    }
  });

  return { reqs, info, direto };
}