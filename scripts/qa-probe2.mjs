/** Sonda 2: o script inline executa? A tag existe no DOM? */
export default async function run(page, ui) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const inline = Array.from(document.querySelectorAll('script:not([src])'));
    const principal = inline[0];
    const m = principal.textContent.match(/^\s*'use strict';/);
    return {
      inlineCount: inline.length,
      primeiroScriptSrc: document.scripts[0] ? (document.scripts[0].getAttribute('src') || 'inline') : 'nenhum',
      marcadorDefinido: window.__GRACIOU_MARCADOR__,
      temStrict: !!m,
      // Executa um fragmento do MESMO texto para ver se roda
      testeExecucao: (function () {
        try {
          new Function("'use strict'; window.__TESTE_OK__ = 1;")();
          return typeof window.__TESTE_OK__;
        } catch (e) { return 'ERRO: ' + e.message; }
      })(),
      tipoCatalogo: typeof window.GRACIOU_CATALOGO,
      tipoStore: typeof window.GRACIOU_STORE
    };
  });

  return info;
}