/**
 * QA visual de rastreio.html — dirige a página real no navegador headless.
 * Recebe os IDs via variáveis de ambiente: SEM, COM, CANC e EMAIL.
 * Retorna um JSON com o que encontrou em cada cenário.
 */
export default async function run(page, ui) {
  const SEM = process.env.SEM;
  const COM = process.env.COM;
  const CANC = process.env.CANC;
  const EMAIL = process.env.EMAIL || 'visual@exemplo.local';
  const out = {};

  /* Seletores por ID são estáveis entre re-renderizações; refs não são. */
  const campoNumero = page.locator('#tr-numero');
  const campoEmail = page.locator('#tr-email');
  const btnBuscar = page.locator('#tr-buscar');
  const btnLimpar = page.locator('#tr-limpar');

  const preencher = async (numero, email) => {
    await campoNumero.fill(numero);
    await campoEmail.fill(email);
    await btnBuscar.click();
    /* Espera o resultado aparecer OU o erro, em vez de um delay fixo. */
    await page.waitForFunction(() => {
      const r = document.getElementById('tr-resultado');
      const e = document.getElementById('tr-erro');
      return (r && !r.hidden) || (e && !e.hidden);
    }, { timeout: 8000 }).catch(() => {});
  };
  const textoResultado = () => page.evaluate(() => {
    const r = document.getElementById('tr-resultado');
    if (!r || r.hidden) return null;
    return {
      numero: document.getElementById('tr-res-numero').textContent.trim(),
      selo: document.getElementById('tr-res-selo').textContent.trim(),
      seloClasse: document.getElementById('tr-res-selo').className,
      data: document.getElementById('tr-res-data').textContent.trim(),
      destino: document.getElementById('tr-res-destino').hidden ? null : document.getElementById('tr-res-destino').textContent.trim(),
      cancelado: !document.getElementById('tr-res-cancelado').hidden,
      etapas: Array.from(document.querySelectorAll('#tr-timeline .tr-etapa')).map((e) => ({
        rotulo: e.querySelector('.tr-etapa__rotulo').textContent.replace('Etapa atual', '').trim(),
        data: e.querySelector('.tr-etapa__data') ? e.querySelector('.tr-etapa__data').textContent.trim() : null,
        concluida: e.classList.contains('is-concluida'),
        atual: e.classList.contains('is-atual')
      })),
      rastreio: document.getElementById('tr-rastreio').textContent.replace(/\s+/g, ' ').trim(),
      temBotaoCopiar: !!document.getElementById('tr-copiar'),
      linkTransportadora: (() => {
        const a = document.querySelector('#tr-rastreio a');
        return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null;
      })(),
      obs: document.getElementById('tr-bloco-obs').hidden ? null : document.getElementById('tr-obs').textContent.trim()
    };
  });

  /* ── 1. Erro: campos vazios ── */
  await btnBuscar.click();
  out.erroVazio = await page.evaluate(() => {
    const e = document.getElementById('tr-erro');
    return { visivel: !e.hidden, texto: e.textContent.trim() };
  });

  /* ── 2. Erro: combinação incorreta ── */
  await preencher(SEM, 'errado@exemplo.local');
  out.erroCombinacao = await page.evaluate(() => {
    const e = document.getElementById('tr-erro');
    return { visivel: !e.hidden, texto: e.textContent.trim(), resultadoOculto: document.getElementById('tr-resultado').hidden };
  });

  /* ── 3. Pedido SEM rastreio ── */
  await btnLimpar.click();
  await preencher(SEM, EMAIL);
  await page.waitForTimeout(300);
  out.semRastreio = await textoResultado();

  /* ── 4. Pedido COM rastreio ── */
  await btnLimpar.click();
  await preencher(COM, EMAIL);
  await page.waitForTimeout(300);
  out.comRastreio = await textoResultado();

  /* ── 5. Pedido cancelado ── */
  await btnLimpar.click();
  await preencher(CANC, EMAIL);
  await page.waitForTimeout(300);
  out.cancelado = await textoResultado();

  /* ── 6. O e-mail não aparece na URL ── */
  out.urlSemEmail = !page.url().includes('visual%40') && !page.url().includes('@exemplo');

  return out;
}
