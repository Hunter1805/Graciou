/** Sonda: meus scripts-inline estão dentro de outro elemento? */
export default async function run(page, ui) {
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const inline = Array.from(document.querySelectorAll('script:not([src])'));

    return {
      scripts: inline.map((s, i) => {
        // Sobe a árvore para saber onde o script está pendurado
        const caminho = [];
        let no = s.parentElement;
        while (no && no !== document.documentElement) {
          caminho.push(no.tagName + (no.className ? '.' + String(no.className).split(' ')[0] : ''));
          no = no.parentElement;
        }
        return {
          idx: i,
          chars: s.textContent.length,
          pai: s.parentElement ? s.parentElement.tagName + '.' + (s.parentElement.className || '') : null,
          caminhoAteRaiz: caminho.join(' < '),
          // Se o parent for um SCRIPT, e' o caso de "script dentro de script"
          dentroDeScript: !!s.closest('script'),
          // Estilo computado do pai: display:none impede execucao? (nao impede, mas ajuda a ver)
          displayDoPai: s.parentElement ? getComputedStyle(s.parentElement).display : null
        };
      })
    };
  });
}