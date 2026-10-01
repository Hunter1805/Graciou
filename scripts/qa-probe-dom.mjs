/** Sonda: o que EXATAMENTE chega no DOM? */
export default async function run(page, ui) {
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const inline = Array.from(document.querySelectorAll('script:not([src])'));
    const maior = inline.sort((a, b) => b.textContent.length - a.textContent.length)[0];
    return {
      qtdInline: inline.length,
      tamanhos: inline.map((s) => s.textContent.length),
      // O texto do maior inline contém o código novo?
      temAtivarReveal: maior.textContent.includes('ativarReveal'),
      temRevelarPendentes: maior.textContent.includes('revelarPendentesVisiveis'),
      temIniciarCatalogo: maior.textContent.includes('iniciarCatalogo'),
      PRIMEIROS: maior.textContent.slice(0, 150),
      ULTIMOS: maior.textContent.slice(-350)
    };
  });
}