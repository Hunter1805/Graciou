/** Sonda final: como o NAVEGADOR interpreta o documento? */
export default async function run(page, ui) {
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const html = document.documentElement.outerHTML;

    // O browser reconstruiu os scripts? O texto do meu bloco esta dentro de outro script?
    const todos = Array.from(document.querySelectorAll('script'));

    return {
      // Posicao do meu bloco: ele e' filho direto do body ou esta dentro de outro script?
      arvoreDeScripts: todos.map((s, i) => {
        const pai = s.parentElement;
        return {
          i,
          src: s.getAttribute('src'),
          chars: s.textContent ? s.textContent.length : 0,
          paiTag: pai ? pai.tagName : null,
          paiClasse: pai ? String(pai.className || '') : null,
          ehFilhoDoBodyOuHead: pai ? (pai.tagName === 'BODY' || pai.tagName === 'HEAD') : false
        };
      }),

      // Quantos scripts o browser "ve"
      totalScriptsNoDom: todos.length,

      // O conteudo do meu script aparece como TEXTO na pagina?
      // (sintoma classico de <script> dentro de <script>)
      meuCodigoVazouComoTexto: html.includes('Lê window.GRACIOU_STORE.products'),
      algumTextoDeCodigoVisivel: document.body.innerText.includes('renderizar'),
      bodyTextComeca: document.body.textContent.trim().slice(0, 120)
    };
  });
}