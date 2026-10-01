/** Sonda 7: o módulo do catálogo executa quando importado explicitamente? */
export default async function run(page, ui) {
  return page.evaluate(async () => {
    const out = {};

    // 1. import() dinâmico — mesmo caminho que o <script src> gera
    try {
      const m = await import('/dados/catalogo.js');
      out.importOk = true;
      out.importKeys = Object.keys(m || {});
      out.importDefault = typeof (m && m.default);
      out.produtosViaImport = (m && m.default && m.default.PRODUTOS) ? m.default.PRODUTOS.length : null;
    } catch (e) {
      out.importOk = false;
      out.importErro = e.name + ': ' + e.message;
    }

    // 2. O global foi definido?
    out.globalDefinido = typeof window.GRACIOU_CATALOGO;
    out.globalProdutos = window.GRACIOU_CATALOGO ? window.GRACIOU_CATALOGO.PRODUTOS.length : null;

    // 3. A tag <script> aponta para o mesmo modulo que o import()?
    const tag = Array.from(document.querySelectorAll('script[src]'))
      .map((s) => s.src).filter((u) => u.includes('catalogo'))[0];
    out.tagSrc = tag;

    return out;
  });
}