/** Sonda: o graciou-store.js executa quando injetado manualmente? */
export default async function run(page, ui) {
  return page.evaluate(async () => {
    const res = { antes: typeof window.GRACIOU_STORE };

    // 1. Injeta como script CLASSICO (sem type=module)
    res.classico = await new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'assets/graciou-store.js?probe=1';
      s.onload = () => resolve('onload; GRACIOU_STORE=' + typeof window.GRACIOU_STORE);
      s.onerror = () => resolve('onerror');
      document.head.appendChild(s);
    });

    // 2. Se ainda nao existir, tenta como MODULO
    if (typeof window.GRACIOU_STORE === 'undefined') {
      res.modulo = await new Promise((resolve) => {
        const s = document.createElement('script');
        s.type = 'module';
        s.src = 'assets/graciou-store.js?probe=2';
        s.onload = () => resolve('onload; GRACIOU_STORE=' + typeof window.GRACIOU_STORE);
        s.onerror = () => resolve('onerror');
        document.head.appendChild(s);
      });
    }

    res.depois = typeof window.GRACIOU_STORE;
    res.produtos = window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null;
    return res;
  });
}