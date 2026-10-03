export default async function run(page) {
  const errors = [], failed = [], responses = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('requestfailed', (r) => failed.push({ url: r.url(), erro: r.failure()?.errorText || 'failed' }));
  page.on('response', (r) => {
    if (r.url().includes('/api/')) responses.push({ url: r.url(), status: r.status() });
  });
  const base = 'http://127.0.0.1:3001';
  const result = { urls: [page.url()], etapas: {}, errosConsole: errors, falhasRede: failed };
  const call = async (path, options = {}) => page.evaluate(async ({ base, path, options }) => { const r = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }); return { status: r.status, body: await r.json().catch(() => ({})) }; }, { base, path, options });
  let id = null;
  try {
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => {
      localStorage.setItem('graciou-cart-v1', JSON.stringify([
        { productId: 'tee-graca-permanece', tamanho: 'M', cor: 'Verde-musgo', quantidade: 1 },
        { productId: 'short-move', tamanho: 'M', cor: 'Preto', quantidade: 1 }
      ]));
      localStorage.setItem('graciou-cupom-v1', 'BEMVINDO10');
    });
    await page.goto('http://127.0.0.1:3000/cart.html');
    result.urls.push(page.url());
    await page.waitForTimeout(300);
    result.etapas.carrinho = await page.evaluate(() => ({ pecas: document.querySelector('#cart-pecas')?.textContent, frete: document.querySelector('#cart-frete')?.textContent, cupom: document.body.innerText.includes('BEMVINDO10'), texto: document.body.innerText }));
    await page.goto('http://127.0.0.1:3000/checkout.html');
    result.urls.push(page.url());
    await page.waitForTimeout(300);
    result.etapas.checkout = { carregado: page.url().endsWith('/checkout.html'), semRedirecionamentoInicial: true };
    const campos = { 'ck-nome':'Teste Frontend', 'ck-email':'teste-frontend@example.invalid', 'ck-telefone':'(11) 90000-0000', 'ck-cpf':'123.456.789-01', 'ck-cep':'01310-100', 'ck-estado':'SP', 'ck-cidade':'São Paulo', 'ck-bairro':'Teste', 'ck-rua':'Rua Teste', 'ck-numero':'0' };
    for (const [key, value] of Object.entries(campos)) await page.locator('#' + key).fill(value);
    const login = await call('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: 'teste-frontend@example.invalid', senha: 'senha-temporaria-frontend' }) });
    result.etapas.loginAdmin = { status: login.status, ok: login.body.ok };
    const auth = { Authorization: 'Bearer ' + login.body.token };
    const post = page.waitForResponse((r) => r.url().endsWith('/api/orders'));
    await page.locator('#ck-form').evaluate((form) => form.requestSubmit());
    const orderResponse = await post;
    result.etapas.postFrontend = { status: orderResponse.status(), semMercadoPagoReal: !responses.some((r) => r.url.includes('mercadopago.com')) };
    const data = await orderResponse.json();
    id = data.id;
    result.etapas.postFrontend.ok = data.ok === true;
    const read = await call('/api/orders/' + encodeURIComponent(id));
    result.etapas.consulta = { status: read.status, ok: read.body.ok, itens: read.body.pedido?.itens?.length };
    const list = await call('/api/admin/orders', { headers: auth });
    result.etapas.admin = { status: list.status, encontrouTeste: list.body.pedidos?.some((p) => p.id === id) };
    const patch = await call('/api/admin/orders/' + encodeURIComponent(id), { method: 'PATCH', headers: auth, body: JSON.stringify({ statusPedido: 'pago', rastreio: 'TESTE-FRONTEND' }) });
    result.etapas.atualizacao = { status: patch.status, pedido: patch.body.pedido?.id === id, statusPedido: patch.body.pedido?.statusPedido, rastreio: patch.body.pedido?.rastreio };
    result.pedidoId = id;
  } finally {
    result.errosConsole = errors;
    result.falhasRede = failed;
  }
  return result;
}
