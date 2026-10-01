/**
 * Verificação do painel admin (admin.html) num navegador real.
 *
 * COMO RODAR
 *   1. API no ar, com o painel configurado:
 *        cd backend
 *        $env:ADMIN_EMAIL='admin@graciou.com'
 *        $env:ADMIN_PASSWORD='graciou-teste-123'
 *        npm run dev
 *   2. Front no ar:  npm run dev   (raiz, porta 3000)
 *   3. Um pedido precisa existir — crie um pelo checkout ou por POST /api/orders.
 *   4. Rodar:
 *        node scripts/rodar-qa-admin.mjs
 *
 * O roteiro usa as MESMAS credenciais acima. Se a API não estiver na 3001,
 * defina a variável GRACIOU_API (ex.: http://localhost:3002) — ela vira o
 * ?api=... da URL e também a base usada na checagem final no servidor.
 *
 * O que este roteiro prova:
 *   1. a página carrega sem erro de console;
 *   2. a tela de login aparece e recusa credencial errada;
 *   3. o login correto troca para a lista de pedidos;
 *   4. a lista renderiza linhas reais vindas da API;
 *   5. clicar num pedido abre o detalhe com o resumo da YouDraw;
 *   6. salvar uma alteração faz o PATCH e o servidor confirma.
 */
export default async function run(page, ui) {
  const resultado = { etapas: [] };
  const passo = (nome, dados) => resultado.etapas.push(Object.assign({ passo: nome }, dados));

  /* ── 1. Tela de login visível ── */
  const inicial = await ui.snapshot({ full: true });
  passo('carregou', {
    temTituloLogin: inicial.includes('Painel de Pedidos'),
    temCampoEmail: inicial.includes('E-mail') || inicial.includes('email')
  });

  /* ── 2. Credencial errada é recusada ── */
  await page.fill('#login-email', 'admin@graciou.com');
  await page.fill('#login-senha', 'senha-errada');
  await page.click('#btn-entrar');
  await page.waitForFunction(
    () => {
      const el = document.getElementById('login-erro');
      return el && !el.hidden && el.textContent.trim().length > 0;
    },
    { timeout: 8000 }
  );
  passo('credencial-errada', {
    mensagem: await page.textContent('#login-erro'),
    continuouNoLogin: await page.isVisible('#tela-login')
  });

  /* ── 3. Login correto ── */
  await page.fill('#login-senha', 'graciou-teste-123');
  await page.click('#btn-entrar');
  await page.waitForFunction(
    () => document.getElementById('app').classList.contains('is-visivel'),
    { timeout: 8000 }
  );
  passo('login-ok', { appVisivel: await page.isVisible('#app') });

  /* ── 4. Lista renderizada a partir da API ── */
  await page.waitForFunction(
    () => document.querySelectorAll('#lista-corpo tr').length > 0,
    { timeout: 8000 }
  );
  const linhas = await page.$$eval('#lista-corpo tr', (trs) =>
    trs.map((tr) => tr.getAttribute('data-id'))
  );
  passo('lista', { linhas: linhas.length, exemplo: linhas[0] || null });

  /* Contagens por status vindas do servidor */
  const contagens = await page.$$eval('#contagens .pb-contagem', (bots) =>
    bots.map((b) => b.textContent.trim())
  );
  passo('contagens', { total: contagens.length, primeira: contagens[0] || null });

  /* ── 5. Abre o detalhe do primeiro pedido ── */
  await page.click('#lista-corpo tr:first-child');
  await page.waitForFunction(
    () => {
      const el = document.getElementById('detalhe');
      return el && !el.hidden && document.getElementById('detalhe-id').textContent.trim().length > 0;
    },
    { timeout: 8000 }
  );

  const detalheId = await page.textContent('#detalhe-id');
  const youdraw = await page.inputValue('#youdraw-texto');
  const itens = await page.$$eval('#detalhe-itens .pb-item', (els) => els.length);
  const cliente = await page.textContent('#detalhe-cliente');

  passo('detalhe', {
    id: detalheId.trim(),
    itens: itens,
    temCpfNoDetalhe: cliente.includes('CPF'),
    resumoYouDrawTemPedido: youdraw.includes('PEDIDO ' + detalheId.trim()),
    resumoYouDrawTemItens: youdraw.includes('ITENS')
  });

  /* ── 6. Atualização real via PATCH ── */
  const statusAntes = await page.inputValue('#up-status');
  const novoStatus = statusAntes === 'pago' ? 'encomendar_na_youdraw' : 'pago';

  await page.selectOption('#up-status', novoStatus);
  await page.fill('#up-rastreio', 'BR123456789BR');
  await page.fill('#up-youdraw', 'YD-QA-001');
  await page.fill('#up-observacoes', 'Verificacao automatizada do painel.');
  await page.click('#btn-salvar');

  await page.waitForFunction(
    () => {
      const el = document.getElementById('detalhe-aviso');
      return el && !el.hidden && el.classList.contains('aviso--ok');
    },
    { timeout: 8000 }
  );

  const avisoOk = await page.textContent('#detalhe-aviso');
  const statusDepois = await page.inputValue('#up-status');
  const rastreioDepois = await page.inputValue('#up-rastreio');

  passo('atualizacao', {
    aviso: avisoOk.trim(),
    statusAntes: statusAntes,
    statusDepois: statusDepois,
    rastreioGravado: rastreioDepois
  });

  /* Confirma no servidor que o dado persistiu e o resto não foi apagado. */
  const noServidor = await page.evaluate(async (id) => {
    const base = decodeURIComponent(new URLSearchParams(location.search).get('api') || 'http://localhost:3001');
    const EMAIL_QA = 'admin@graciou.com';
    const SENHA_QA = 'graciou-teste-123';
    const login = await fetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_QA, senha: SENHA_QA })
    }).then((r) => r.json());
    const resposta = await fetch(base + '/api/admin/orders/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + login.token }
    }).then((r) => r.json());
    const p = resposta.pedido;
    return {
      status: p.statusPedido,
      rastreio: p.rastreio,
      youdraw: p.pedidoYouDraw,
      observacoes: p.observacoes,
      clientePreservado: Boolean(p.cliente && p.cliente.nome),
      enderecoPreservado: Boolean(p.endereco && p.endereco.rua),
      itensPreservados: Array.isArray(p.itens) ? p.itens.length : 0
    };
  }, detalheId.trim());

  passo('persistencia-no-servidor', noServidor);

  return resultado;
}