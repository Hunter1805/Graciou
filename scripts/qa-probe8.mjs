/** Sonda 8: por que os rótulos de contagem não atualizam? */
export default async function run(page, ui) {
  return page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    return {
      renderizado: window.__GRACIOU_RENDERIZADO__,
      temFuncao: typeof window.__GRACIOU_INICIAR_CONTADORES__,
      temReveal: typeof window.__GRACIOU_ATIVAR_REVEAL__,
      resultadosAgora: el('results-count') ? el('results-count').textContent : null,
      totalAgora: el('total-count') ? el('total-count').textContent : null,
      chamadaManual: (function () {
        try {
          if (typeof window.__GRACIOU_INICIAR_CONTADORES__ === 'function') {
            window.__GRACIOU_INICIAR_CONTADORES__();
            return el('results-count').textContent;
          }
          return 'funcao ausente';
        } catch (e) {
          return 'ERRO: ' + e.message;
        }
      })(),
      // Quantos scripts inline existem e o que cada um contém
      inline: Array.from(document.querySelectorAll('script:not([src])')).map((s) => ({
        chars: s.textContent.length,
        temContadores: s.textContent.includes('__GRACIOU_INICIAR_CONTADORES__'),
        temIniciarCatalogo: s.textContent.includes('iniciarCatalogo')
      }))
    };
  });
}