/**
 * Sonda: os cards estao no HTML ESTATICO ou foram inseridos por JS?
 * Compara o HTML servido com o DOM atual.
 */
export default async function run(page, ui) {
  const htmlServido = await page.evaluate(async () => {
    const r = await fetch(location.href, { cache: 'no-store' });
    const t = await r.text();
    return {
      chars: t.length,
      temArtigoProdutoId: t.includes('data-produto-id'),
      ocorrenciasDataProdutoId: (t.match(/data-produto-id/g) || []).length,
      temGridAttr: t.includes('data-product-grid'),
      // trecho em volta do grid
      trecho: (function () {
        const i = t.indexOf('data-product-grid');
        return i < 0 ? 'NAO ACHOU' : t.slice(i, i + 700);
      })()
    };
  });

  return {
    htmlServido,
    domAtual: await page.evaluate(() => ({
      cards: document.querySelectorAll('.p-card[data-produto-id]').length,
      primeiroIdNoDom: (document.querySelector('.p-card[data-produto-id]') || {}).dataset
        ? document.querySelector('.p-card[data-produto-id]').dataset.produtoId
        : null
    }))
  };
}