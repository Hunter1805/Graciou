/**
 * Sonda: verifica se o script inline roda.
 * Escreve marcadores em window e reporta window.onerror.
 */
export default async function run(page, ui) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const inline = Array.from(document.querySelectorAll('script:not([src])'));
    const principal = inline[0];
    let testeSintaxe = 'nao-testado';
    try {
      // Compila o texto do script sem executar
      new Function(principal.textContent + '\nreturn typeof renderizarCatalogo;');
      testeSintaxe = 'ok';
    } catch (e) {
      testeSintaxe = 'ERRO: ' + e.message;
    }
    return {
      inlineCount: inline.length,
      tamanho: principal.textContent.length,
      testeSintaxe: testeSintaxe,
      marcador: window.__GRACIOU_MARCADOR__,
      tipoCatalogo: typeof window.GRACIOU_CATALOGO
    };
  });

  return { erros, info };
}