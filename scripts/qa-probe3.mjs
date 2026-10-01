export default async function run(page, ui) {
  const inline = await page.evaluate(() => document.querySelectorAll('script:not([src])')[0].textContent)

  // Remove a linha de chamada e roda o resto no escopo global para ver ate onde vai
  const semCall = inline.replace(/renderizarCatalogo\(\);\s*/g, '')

  const resultado = await page.evaluate((codigo) => {
    try {
      const fn = new Function(codigo)
      fn()
      return 'executou ate o fim'
    } catch (e) {
      return 'ERRO: ' + e.name + ': ' + e.message
    }
  }, semCall)

  return {
    resultado,
    tipoCatalogo: await page.evaluate(() => typeof window.GRACIOU_CATALOGO)
  }
}