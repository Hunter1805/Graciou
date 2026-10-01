/**
 * Sonda definitiva: o JavaScript da pagina executa?
 * Marca o window no PRIMEIRO caractere do script inline.
 */
export default async function run(page, ui) {
  // Qualquer coisa que esteja rodando no page deixa rastros no window.
  const r = await page.evaluate(() => {
    const marcadores = Object.keys(window).filter((k) =>
      k.indexOf('GRACIOU') === 0 || k.indexOf('__') === 0);

    return {
      marcadoresNoWindow: marcadores,
      // A funcao que atualiza o badge do carrinho existiria se o script rodasse
      temAddToCart: typeof window.addToCart,
      temToggleWish: typeof window.toggleWish,
      temRenderizarCatalogo: typeof window.renderizarCatalogo,
      // O header ganhou a classe 'scrolled' por um listener do script?
      headerTemListener: !!document.getElementById('site-header'),
      // Os cards: qual o ancestral deles?
      paiDosCards: (function () {
        const c = document.querySelector('.p-card[data-produto-id]');
        return c && c.parentElement ? { pai: c.parentElement.className, paiId: c.parentElement.id } : null;
      })(),
      // Quantos cards estao dentro do grid marcado?
      cardsDentroDoGrid: document.querySelectorAll('[data-product-grid] > .p-card[data-produto-id]').length,
      // Existe algum outro container com cards?
      outrosContainers: Array.from(document.querySelectorAll('.p-card[data-produto-id]'))
        .map((c) => c.parentElement.className)
        .filter((v, i, a) => a.indexOf(v) === i)
    };
  });
  return r;
}