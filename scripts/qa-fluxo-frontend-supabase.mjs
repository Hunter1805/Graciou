export default async function run(page) {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || 'failed' }));

  const resultado = { urls: [], etapas: {}, errosConsole: consoleErrors, falhasRede: failedRequests };
  const baseApi = 'http://127.0.0.1:3001';
  const cliente = { nome: 'Teste Frontend', email: 'teste-frontend@example.invalid', telefone: '(11) 90000-0000', cpf: '123.456.789-01' };
  const endereco = { cep: '01310-100', estado: 'SP', cidade: 'São Paulo', bairro: 'Teste', rua: 'Rua Teste', numero: '0', complemento: '' };
  let pedidoId = null;
  let adminToken = null;

  async function api(path, options = {}) {
    const response = await page.evaluate(async ({ baseApi, path, options }) => {
      const r = await fetch(baseApi + path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }, { baseApi, path, options });
    return response;
  }

  try {
    resultado.urls.push(page.url());
    const add = page.getByRole('button', { name: '+ ADICIONAR AO CARRINHO' });
    await add.nth(0).scrollIntoViewIfNeeded();
    await add.nth(0).click();
    await page.waitForTimeout(150);
    await add.nth(7).evaluate((button) => button.click());
    await page.waitForTimeout(250);
    resultado.etapas.colecao = await page.evaluate(() => ({ itens: window.GRACIOU_STORE.getCart().length, pecas: window.GRACIOU_STORE.getCart().reduce((s, i) => s + Number(i.quantidade || 0), 0) }));
    await page.goto('http://127.0.0.1:3000/cart.html');
    resultado.urls.push(page.url());
    await page.waitForTimeout(250);
    resultado.etapas.carrinhoAntesCupom = await page.evaluate(() => ({ texto: document.body.innerText, pecas: window.GRACIOU_STORE.getCart().reduce((s, i) => s + Number(i.quantidade || 0), 0) }));
    const cupomInput = page.locator('#cart-cupom-input');
    await cupomInput.fill('BEMVINDO10');
    await page.locator('#cart-cupom-form').evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(250);
    resultado.etapas.cupom = await page.evaluate(() => ({ aplicado: window.GRACIOU_STORE.getCoupon(), texto: document.body.innerText }));
    await page.goto('http://127.0.0.1:3000/checkout.html');
    resultado.urls.push(page.url());
    await page.waitForTimeout(300);
    resultado.etapas.checkout = { carregou: Boolean(document.body.innerText.match(/checkout|pedido/i)), semMercadoPagoReal: true };

    for (const [id, value] of Object.entries({
      'ck-nome': cliente.nome, 'ck-email': cliente.email, 'ck-telefone': cliente.telefone, 'ck-cpf': cliente.cpf,
      'ck-cep': endereco.cep, 'ck-estado': endereco.estado, 'ck-cidade': endereco.cidade, 'ck-bairro': endereco.bairro,
      'ck-rua': endereco.rua, 'ck-numero': endereco.numero
    })) await page.locator('#' + id).fill(value);
    const login = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: 'teste-frontend@example.invalid', senha: 'senha-temporaria-frontend' }) });
    resultado.etapas.loginAdmin = { status: login.status, ok: login.body.ok };
    if (login.status !== 200) throw new Error('login admin falhou');
    adminToken = login.body.token;
    const auth = { Authorization: 'Bearer ' + adminToken };
    const requests = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/')) requests.push({ url: response.url(), status: response.status() });
    });
    await page.route('**/api/payments/create-preference', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, erro: 'Teste sem Mercado Pago real.' }) }));
    await page.locator('#ck-form').evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(1200);
    const orderResponse = requests.find((r) => r.url.endsWith('/api/orders'));
    resultado.etapas.criacaoApi = { status: orderResponse?.status || null, supabasePedido: orderResponse?.status === 201, pagamentoRealNaoExecutado: !requests.some((r) => r.url.includes('mercadopago.com')) };
    const criado = await api('/api/admin/orders', { headers: auth });
    const encontrados = criado.body.pedidos || [];
    pedidoId = encontrados.find((p) => p.clienteEmail === cliente.email)?.id || null;
    if (!pedidoId) throw new Error('pedido criado pelo frontend não foi encontrado');
    const lido = await api('/api/orders/' + encodeURIComponent(pedidoId));
    resultado.etapas.consultaPedido = { status: lido.status, ok: lido.body.ok, idCorreto: lido.body.pedido?.id === pedidoId };
    const lista = await api('/api/admin/orders', { headers: auth });
    resultado.etapas.admin = { status: lista.status, encontrouTeste: lista.body.pedidos?.some((p) => p.id === pedidoId) };
    const patch = await api('/api/admin/orders/' + encodeURIComponent(pedidoId), { method: 'PATCH', headers: auth, body: JSON.stringify({ statusPedido: 'pago', rastreio: 'TESTE-FRONTEND' }) });
    resultado.etapas.atualizacaoAdmin = { status: patch.status, statusPedido: patch.body.pedido?.statusPedido, rastreio: patch.body.pedido?.rastreio };
  } finally {
    if (pedidoId) {
      resultado.etapas.limpeza = { pedidoCriado: pedidoId, pendente: true };
    }
  }
  resultado.errosConsole = consoleErrors;
  resultado.falhasRede = failedRequests;
  return resultado;
}
