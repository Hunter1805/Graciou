/**
 * DIAGNÓSTICO (somente leitura — nenhum arquivo do projeto é alterado).
 * Executa EXATAMENTE os comandos pedidos e devolve cada valor rotulado,
 * na ordem em que apareceriam no console do navegador.
 */
export default async function run(page, ui) {
  // NÃO navegar de novo: o runner já abriu a URL passada na linha de comando.
  // (Antes havia um page.goto com URL fixa na 3000, o que ignorava a porta
  //  pedida e produzia medições inválidas.)
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(3000);

  const r = await page.evaluate(() => {
    const out = {};
    out.urlReal = location.href;

    // ── Bloco 1: os comandos pedidos, um por um ──
    const linhas = [];
    linhas.push(['typeof window.GRACIOU_STORE', typeof window.GRACIOU_STORE]);
    linhas.push(['typeof window.GRACIOU_CATALOGO', typeof window.GRACIOU_CATALOGO]);
    linhas.push(['window.GRACIOU_CATALOGO?.PRODUTOS?.length',
      window.GRACIOU_CATALOGO && window.GRACIOU_CATALOGO.PRODUTOS
        ? window.GRACIOU_CATALOGO.PRODUTOS.length : undefined]);
    linhas.push(['window.GRACIOU_STORE?.products?.length',
      window.GRACIOU_STORE && window.GRACIOU_STORE.products
        ? window.GRACIOU_STORE.products.length : undefined]);
    linhas.push(['document.querySelectorAll(\'#products-grid .p-card\').length',
      document.querySelectorAll('#products-grid .p-card').length]);
    linhas.push(['document.querySelectorAll(\'#products-grid .p-card-legado\').length',
      document.querySelectorAll('#products-grid .p-card-legado').length]);
    linhas.push(['[...document.scripts].map(s => s.src || "inline")',
      [...document.scripts].map((script) => script.src || 'inline')]);

    out.comandos = linhas;

    // ── Bloco 2: outerHTML das duas tags ──
    out.outerHTML_catalogo =
      (document.querySelector('script[src*="catalogo"]') || {}).outerHTML || 'NAO ENCONTRADO';
    out.outerHTML_store =
      (document.querySelector('script[src*="graciou-store"]') || {}).outerHTML || 'NAO ENCONTRADO';

    // ── Contexto extra para desambiguar (sem alterar nada) ──
    out.contexto = {
      bodyChars: document.body.textContent.length,
      htmlChars: document.documentElement.outerHTML.length,
      totalScripts: document.scripts.length,
      // Todos os marcadores GRACIOU que o JS criaria
      marcadoresNoWindow: Object.keys(window).filter((k) => k.indexOf('GRACIOU') >= 0),
      // Funções globais que os scripts inline definem
      funcoesGlobais: {
        addToCart: typeof window.addToCart,
        toggleWish: typeof window.toggleWish,
        renderizarCatalogo: typeof window.renderizarCatalogo
      },
      // Os cards: quantos e onde estão
      cardsNoGrid: document.querySelectorAll('#products-grid .p-card').length,
      cardsComProdutoId: document.querySelectorAll('#products-grid .p-card[data-produto-id]').length,
      // Se os legados estão visíveis
      legadoOculto: (function () {
        const l = document.querySelector('.p-card-legado');
        return l ? (l.offsetParent === null) : 'NAO EXISTE';
      })(),
      // Nomes dos cards visíveis, na ordem
      nomesVisiveis: Array.from(document.querySelectorAll('#products-grid .p-card'))
        .map((c) => {
          const n = c.querySelector('.p-card__name');
          return n ? n.textContent.trim() : '(sem nome)';
        }),
      // Se o grid tem o atributo novo
      gridTemAtributo: !!document.querySelector('[data-product-grid]'),
      // Elementos reais do <template> e do marcador
      temTemplate: !!document.getElementById('graciou-ph-svg'),
      temMarcador: !!document.querySelector('[data-produto-placeholder]')
    };

    return out;
  });

  return r;
}