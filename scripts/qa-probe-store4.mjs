/** Sonda: executa o texto do graciou-store.js e captura o erro real. */
export default async function run(page, ui) {
  return page.evaluate(async () => {
    const txt = await (await fetch('assets/graciou-store.js?x=9', { cache: 'no-store' })).text();

    const res = {
      chars: txt.length,
      // O texto chega completo ate o fim?
      terminaCom: txt.slice(-120),
      temIIFE: txt.includes('(function () {'),
      temFechaIIFE: txt.includes("})();")
    };

    try {
      // Executa o arquivo inteiro no escopo global
      const fn = new Function(txt);
      fn();
      res.execucao = 'OK; GRACIOU_STORE=' + typeof window.GRACIOU_STORE;
      res.produtos = window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null;
    } catch (e) {
      res.execucao = 'ERRO: ' + e.name + ': ' + e.message;
    }
    return res;
  });
}