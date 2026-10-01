/** Sonda: o graciou-store.js executa? O que ele contém no DOM? */
export default async function run(page, ui) {
  const r = await page.evaluate(async () => {
    const out = {};
    const tag = Array.from(document.querySelectorAll('script[src]'))
      .find((s) => (s.getAttribute('src') || '').includes('graciou-store'));
    out.tag = tag ? { attr: tag.getAttribute('src'), resolved: tag.src, defer: tag.defer, type: tag.getAttribute('type') } : null;

    if (tag) {
      const res = await fetch(tag.src, { cache: 'no-store' });
      const txt = await res.text();
      out.status = res.status;
      out.chars = txt.length;
      out.comecaCom = txt.slice(0, 120);
      out.temSourceMap = txt.includes('sourceMappingURL');
      out.temGraciouStore = txt.includes('window.GRACIOU_STORE');
      out.primeiraLinha = txt.split('\n')[0].slice(0, 90);
    }
    return out;
  });
  return r;
}