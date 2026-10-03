/**
 * ═══════════════════════════════════════
 * GRACIOU — SERVIDOR DA API LOCAL
 * Arquivo: backend/servidor.js
 * ═══════════════════════════════════════
 *
 * Sobe em http://localhost:3001 por padrão.
 *
 * ─── ESCOPO DESTA ETAPA ──────────────────────────────────────
 * Só receber e armazenar pedidos. NÃO existe, de propósito:
 *   - integração com Mercado Pago;
 *   - usuário administrativo / login;
 *   - qualquer coluna ou campo de cartão.
 *
 * ─── SOBRE LOGS ──────────────────────────────────────────────
 * A regra é: nunca imprimir dado pessoal do cliente (nome, e-mail,
 * CPF, telefone, endereço) nem conteúdo de item. O que aparece é
 * apenas o suficiente para operar: método, rota, status, tempo e o
 * ID do pedido. Há um helper `log()` que centraliza isso.
 */

'use strict';

require('./env').carregar();

const express = require('express');
const path = require('node:path');
const os = require('node:os');

const banco = process.env.VERCEL ? null : require('./db');
const repositorio = require('./repositorio');
const regras = require('./regras');
const admin = require('./admin');
const pagamentos = require('./pagamentos');

const PORTA = Number(process.env.PORT) || (process.env.VERCEL ? 0 : 3001);
const CATALOGO = regras.CATALOGO;

const app = express();

/* ─────────────────────────────────────────────
   LOG SEGURO
   Uma única saída para o console. Nunca recebe objeto de cliente.
   ───────────────────────────────────────────── */
function log(...partes) {
  console.log('[graciou-api]', ...partes);
}

/* ─────────────────────────────────────────────
   CORS — SOMENTE O FRONTEND LOCAL
   Aceita apenas as origens do protótipo local (Vite :3000 e o
   servidor estático :3100). Não existe "*" nesta configuração.
   ───────────────────────────────────────────── */
const PORTAS_FRONT = [3000, 3100, 5173, 4173];

const ORIGENS_PERMITIDAS = new Set();
for (const porta of PORTAS_FRONT) {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) {
    ORIGENS_PERMITIDAS.add(`http://${host}:${porta}`);
  }
}
const basePublica = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
if (basePublica) ORIGENS_PERMITIDAS.add(basePublica);

/* Abrir o checkout direto do disco manda Origin: null.
   Aceitamos esse caso porque é o protótipo local — não há
   domínio público servindo esta API. */
const ORIGEM_NULA_PERMITIDA = true;

function aplicarCors(req, res, next) {
  const origem = req.headers.origin;

  if (!origem) {
    /* Sem header Origin: navegação direta / curl / testes. Liberado. */
    res.setHeader('Vary', 'Origin');
    return next();
  }

  const ehNula = origem === 'null';
  const ehLocal = ORIGENS_PERMITIDAS.has(origem);

  if (ehLocal || (ehNula && ORIGEM_NULA_PERMITIDA)) {
    res.setHeader('Access-Control-Allow-Origin', origem);
  } else {
    /* Origem não autorizada: não devolvemos o header, então o
       navegador bloqueia a leitura da resposta. */
    res.setHeader('Vary', 'Origin');
    return next();
  }

  res.setHeader('Vary', 'Origin');
  /* PATCH e DELETE existem por causa do painel administrativo;
     Authorization é o header que carrega o token de sessão. */
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  return next();
}

app.use(aplicarCors);

/* Responde o preflight sem passar pelas rotas. */
app.options('*', (req, res) => {
  res.status(204).end();
});

app.use(express.json({ limit: '512kb' }));

/* Corpo JSON malformado vira 400 legível em vez de stack trace. */
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      erro: 'JSON inválido no corpo da requisição.',
      campos: [{ campo: 'corpo', mensagem: 'Não foi possível interpretar o JSON enviado.' }]
    });
  }
  if (err) {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, erro: 'Corpo da requisição muito grande.' });
    }
    return next(err);
  }
  return next();
});

/* Tempo de resposta no log, sem tocar em dado pessoal.
   Só método, ROTA (req.path — sem query string, que poderia carregar
   um filtro ou um token), status e tempo. Nada de header, corpo,
   IP ou nome do cliente. */
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - inicio}ms)`);
  });
  next();
});

/* ─────────────────────────────────────────────
   GET /api/health — teste de vida
   ───────────────────────────────────────────── */
app.get('/api/health', async (req, res) => {
  let bancoOk = false;
  try {
    if (repositorio.usandoSupabase()) {
      await repositorio.testarConexao();
    } else {
      const db = banco.abrir();
      db.prepare('SELECT 1 AS ok').get();
    }
    bancoOk = true;
  } catch (e) {
    bancoOk = false;
  }

  const problemas = CATALOGO.verificarIntegridade();

  res.status(bancoOk ? 200 : 503).json({
    status: bancoOk ? 'OK' : 'ERRO',
    ok: bancoOk,
    servico: 'graciou-api',
    versao: '1.0.0',
    etapa: 'pedidos + Checkout Pro (se configurado)',
    banco: {
      tipo: repositorio.usandoSupabase() ? 'supabase' : 'sqlite',
      arquivo: repositorio.usandoSupabase() ? null : path.basename(banco.CAMINHO_BANCO),
      conectado: bancoOk
    },
    catalogo: {
      produtos: CATALOGO.lista().length,
      integro: problemas.length === 0,
      problemas: problemas.length
    },
    pagamentoIntegrado: Boolean(process.env.MP_ACCESS_TOKEN && process.env.PUBLIC_BASE_URL),
    usuarioAdmin: admin.configurado(),
    painelAdmin: {
      configurado: admin.configurado(),
      sessoesAtivas: admin.sessoesAtivas(),
      duracaoSessaoMinutos: Math.floor(admin.DURACAO_SESSAO_MS / 60000)
    },
    rotaAdmin: '/admin.html',
    origemFrontPermitida: ['http://localhost:3000', 'http://localhost:3100'],
    horario: new Date().toISOString()
  });
});

/* ─────────────────────────────────────────────
   POST /api/orders — cria o pedido
   ───────────────────────────────────────────── */
app.post('/api/orders', async (req, res) => {
  let entrada;
  try {
    entrada = regras.validarCorpo(req.body);
  } catch (erro) {
    if (erro instanceof regras.ErroDeValidacao) {
      return res.status(400).json({
        ok: false,
        erro: erro.message,
        campos: erro.campos
      });
    }
    throw erro;
  }

  let montado;
  try {
    montado = regras.montarPedido(entrada);
  } catch (erro) {
    if (erro instanceof regras.ErroDeValidacao) {
      return res.status(400).json({
        ok: false,
        erro: erro.message,
        campos: erro.campos
      });
    }
    throw erro;
  }

  const pedido = montado.pedido;

  /* Id gerado pelo repositório, nunca pelo navegador. */
  const id = repositorio.gerarIdPedido();

  const agora = new Date();

  /* Campos de dinheiro enviados pelo cliente são ignorados.
     Se vierem, fica registrado para auditoria — nunca aplicados. */
  const observacoes = pedido.observacoes ||
    (pedido.camposDinheiroIgnorados.length
      ? 'Valores financeiros enviados pelo cliente foram ignorados e recalculados.'
      : '');

  let registro;
  try {
    registro = await repositorio.inserirPedido({
      id: id,
      criado_em: montado.criadoEm,
      cliente_nome: pedido.cliente.nome,
      cliente_email: pedido.cliente.email,
      cliente_telefone: pedido.cliente.telefone,
      cliente_cpf: pedido.cliente.cpf,
      endereco_json: JSON.stringify(pedido.endereco),
      itens_json: JSON.stringify(pedido.itens),
      forma_pagamento: pedido.pagamento.forma,
      status_pagamento: 'aguardando',
      cupom_codigo: pedido.cupom ? pedido.cupom.codigo : null,
      subtotal: pedido.subtotal,
      desconto: pedido.desconto,
      frete: pedido.frete,
      total: pedido.total,
      status_pedido: 'aguardando_pagamento',
      rastreio: null,
      observacoes: observacoes || null
    });
  } catch (erro) {
    log('ERRO ao gravar pedido:', erro.message);
    return res.status(500).json({
      ok: false,
      erro: 'Não foi possível registrar o pedido. Tente novamente.'
    });
  }

  /* Log sem dado pessoal: só o id e o valor total. */
  log(`pedido criado ${registro.id} — ${registro.itens.length} linha(s), pecas=${registro.itens.reduce((s, i) => s + i.quantidade, 0)}`);

  return res.status(201).json({
    ok: true,
    /* O número do pedido é o que o checkout mostra na confirmação. */
    numero: registro.id,
    id: registro.id,
    pedido: registro,
    recalculadoNoServidor: true,
    valoresRecebidosDoClienteIgnorados: pedido.camposDinheiroIgnorados,
    aviso: pedido.cupomRecusado
      ? `Cupom "${pedido.cupomRecusado.codigo}" não aplicado: ${pedido.cupomRecusado.motivo}`
      : null
  });
});

/* ─────────────────────────────────────────────
   GET /api/orders/:id — consulta por id
   ───────────────────────────────────────────── */
app.get('/api/orders/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();

  if (!id) {
    return res.status(400).json({ ok: false, erro: 'Informe o número do pedido.' });
  }

  const pedido = await repositorio.buscarPedido(id);

  if (!pedido) {
    return res.status(404).json({
      ok: false,
      erro: 'Pedido não encontrado.',
      id: id
    });
  }

  return res.json({ ok: true, pedido: pedido });
});

/* ═════════════════════════════════════
   MERCADO PAGO — CHECKOUT PRO
   ─────────────────────────────
   Rotas de checkout e webhook, sempre server-side.
   ───────────────────────────── */

app.post('/api/payments/create-preference', async (req, res) => {
  const id = String(req.body && (req.body.orderId || req.body.id) || '').trim();
  if (!id) return res.status(400).json({ ok: false, erro: 'Informe o ID do pedido.' });
  const pedido = await repositorio.buscarPedido(id);
  if (!pedido) return res.status(404).json({ ok: false, erro: 'Pedido não encontrado.', id: id });
  if (pedido.total === null || pedido.frete === null) return res.status(409).json({ ok: false, erro: 'O pedido ainda tem frete pendente e não pode iniciar o pagamento.' });
  if (pedido.pagamento.status === 'pago') return res.status(409).json({ ok: false, erro: 'Este pedido já foi pago.' });
  try {
    let preferencia;
    if (pedido.mercadoPago && pedido.mercadoPago.preferenceId) preferencia = await pagamentos.consultarPreferencia(pedido.mercadoPago.preferenceId);
    else {
      preferencia = await pagamentos.criarPreferencia(pedido);
      if (!preferencia.id || !preferencia.initPoint) throw new pagamentos.ErroPagamento('Mercado Pago não devolveu um link de checkout.', 502);
      await repositorio.associarPreferencia(id, preferencia.id);
    }
    return res.status(201).json({ ok: true, orderId: id, preferenceId: preferencia.id, init_point: preferencia.initPoint, sandbox_init_point: preferencia.sandboxInitPoint || null });
  } catch (erro) {
    log(`ERRO ao criar preferência para ${id}: ${erro.message}`);
    return res.status(erro instanceof pagamentos.ErroPagamento ? erro.status : 502).json({ ok: false, erro: erro.message || 'Não foi possível criar o checkout do Mercado Pago.' });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  const paymentId = pagamentos.idDoWebhook(req);
  if (!paymentId || !pagamentos.config().webhookSecret) return res.status(400).json({ ok: false, erro: 'Notificação inválida.' });
  if (!pagamentos.assinaturaValida(req, paymentId)) return res.status(401).json({ ok: false, erro: 'Assinatura de webhook inválida.' });
  try {
    const pagamento = await pagamentos.consultarPagamento(paymentId);
    const externalReference = String(pagamento.external_reference || '').trim();
    if (!externalReference || !/^GR-/.test(externalReference)) return res.status(400).json({ ok: false, erro: 'Pagamento sem referência externa válida.' });
    const pedido = await repositorio.buscarPedido(externalReference);
    if (!pedido) return res.status(404).json({ ok: false, erro: 'Pedido da notificação não encontrado.' });
    if (pedido.mercadoPago && pedido.mercadoPago.preferenceId && pagamento.preference_id && String(pagamento.preference_id) !== String(pedido.mercadoPago.preferenceId)) return res.status(409).json({ ok: false, erro: 'Preferência não corresponde ao pedido.' });
    if (pagamento.currency_id && String(pagamento.currency_id) !== 'BRL') return res.status(409).json({ ok: false, erro: 'Moeda do pagamento não corresponde ao pedido.' });
    if (pagamento.transaction_amount !== undefined && Math.round(Number(pagamento.transaction_amount) * 100) !== Number(pedido.total)) return res.status(409).json({ ok: false, erro: 'Valor do pagamento não corresponde ao pedido.' });
    const status = pagamentos.statusInterno(String(pagamento.status || '').toLowerCase());
    const atualizado = await repositorio.atualizarPagamento(externalReference, { mpPaymentId: paymentId, mpStatus: String(pagamento.status || ''), statusPagamento: status.pagamento });
    log(`webhook Mercado Pago processado para ${externalReference} — status=${status.pagamento}`);
    return res.status(200).json({ ok: true, id: externalReference, statusPagamento: atualizado.pagamento.status });
  } catch (erro) {
    log(`ERRO ao processar webhook ${paymentId}: ${erro.message}`);
    return res.status(erro instanceof pagamentos.ErroPagamento ? erro.status : 502).json({ ok: false, erro: 'Não foi possível confirmar a notificação de pagamento.' });
  }
});

app.get('/api/payments/status/:orderId', async (req, res) => {
  const id = String(req.params.orderId || '').trim();
  const pagamento = await repositorio.pagamentoDoPedido(id);
  if (!pagamento) return res.status(404).json({ ok: false, erro: 'Pedido não encontrado.', id: id });
  return res.json({ ok: true, orderId: id, statusPagamento: pagamento.status_pagamento, statusPedido: pagamento.status_pedido, mercadoPago: { preferenceId: pagamento.mp_preference_id || null, paymentId: pagamento.mp_payment_id || null, status: pagamento.mp_status || null, pagoEm: pagamento.pago_em || null } });
});

/* ═════════════
   PAINEL ADMINISTRATIVO
   ─────────────────────────────────────────────────────────────
   Todas as rotas abaixo exigem o header
     Authorization: Bearer <token>
   O token sai de POST /api/admin/login e vive só na memória do
   servidor (ver backend/admin.js). Nenhuma dessas rotas devolve
   pedido sem sessão válida: o middleware `exigirAdmin` roda antes
   de qualquer handler.

   Estes logs NUNCA imprimem dado pessoal — só método, rota,
   status e o número do pedido.
   ═════════════════════════════════════════════════════════════ */

/* Cabeçalhos que fazem sentido numa resposta JSON de API privada. */
app.use('/api/admin', (req, res, next) => {
  /* Painel privado não deve ser indexado nem guardado em cache. */
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

/**
 * Middleware de autenticação.
 * Sem sessão válida: 401 e o handler nem é chamado.
 */
function exigirAdmin(req, res, next) {
  if (!admin.configurado()) {
    return res.status(503).json({
      ok: false,
      erro: 'Painel administrativo não configurado. Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente da API e reinicie.'
    });
  }

  const sessao = admin.obterSessao(admin.tokenDaRequisicao(req));

  if (!sessao) {
    return res.status(401).json({
      ok: false,
      erro: 'Não autorizado. Faça login no painel.'
    });
  }

  req.admin = { email: sessao.email, expiraEm: sessao.expiraEm };
  return next();
}

/* ─────────────────────────────────────────────
   POST /api/admin/login
   ───────────────────────────────────────────── */
app.post('/api/admin/login', (req, res) => {
  const corpo = (req.body && typeof req.body === 'object') ? req.body : {};
  const email = String(corpo.email || '').trim();
  const senha = String(corpo.senha || '');

  if (!email || !senha) {
    return res.status(400).json({
      ok: false,
      erro: 'Informe e-mail e senha.'
    });
  }

  const resultado = admin.conferirCredenciais(email, senha);

  if (!resultado.ok) {
    /* Log sem credencial: só o fato da recusa, nunca o e-mail
       informado nem a senha (tentada ou correta). */
    log(`admin login RECUSADO (${resultado.motivo})`);

    return res.status(resultado.motivo === 'nao_configurado' ? 503 : 401).json({
      ok: false,
      erro: resultado.erro
    });
  }

  const sessao = admin.criarSessao(String(email).trim().toLowerCase());

  log('admin login OK');

  return res.json({
    ok: true,
    token: sessao.token,
    expiraEm: sessao.expiraEm,
    duracaoSegundos: sessao.duracaoSegundos,
    aviso: 'Sessão temporária mantida apenas na memória do servidor. Reiniciar a API encerra todas as sessões.'
  });
});

/* ─────────────────────────────────────────────
   POST /api/admin/logout — exige sessão e a invalida
   ───────────────────────────────────────────── */
app.post('/api/admin/logout', exigirAdmin, (req, res) => {
  const encerrada = admin.encerrarSessao(admin.tokenDaRequisicao(req));
  log('admin logout' + (encerrada ? '' : ' (sessão já inexistente)'));

  return res.json({
    ok: true,
    mensagem: 'Sessão encerrada. O token não é mais aceito.'
  });
});

/* ─────────────────────────────────────────────
   GET /api/admin/orders — lista (com filtro por status)
   ───────────────────────────────────────────── */
app.get('/api/admin/orders', exigirAdmin, async (req, res) => {
  const statusBruto = String(req.query.status || '').trim();
  const status = statusBruto && statusBruto !== 'todos' ? statusBruto : null;

  if (status && admin.STATUS_PERMITIDOS.indexOf(status) === -1) {
    return res.status(400).json({
      ok: false,
      erro: 'Status inválido para filtro.',
      statusPermitidos: admin.STATUS_PERMITIDOS
    });
  }

  let pedidos;
  let contagem;
  try {
    pedidos = await repositorio.listarResumoPedidos({ status: status, limite: req.query.limite });
    contagem = await repositorio.contagemPorStatus(admin.STATUS_PERMITIDOS);
  } catch (erro) {
    log('ERRO ao listar pedidos:', erro.message);
    return res.status(500).json({ ok: false, erro: 'Não foi possível listar os pedidos.' });
  }

  return res.json({
    ok: true,
    filtro: { status: status || 'todos' },
    total: pedidos.length,
    pedidos: pedidos,
    contagemPorStatus: contagem,
    meta: {
      statusPermitidos: admin.STATUS_PERMITIDOS,
      rotulosStatus: admin.ROTULOS_STATUS,
      statusPagamentoPermitidos: admin.STATUS_PAGAMENTO_PERMITIDOS,
      /* O painel monta o <select> a partir daqui: uma lista só,
         servida pelo servidor, sem duplicar em HTML. */
      moeda: 'BRL'
    }
  });
});

/* ─────────────────────────────────────────────
   GET /api/admin/orders/:id — detalhe completo
   ───────────────────────────────────────────── */
app.get('/api/admin/orders/:id', exigirAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();

  if (!id) {
    return res.status(400).json({ ok: false, erro: 'Informe o número do pedido.' });
  }

  const pedido = await repositorio.buscarPedido(id);

  if (!pedido) {
    return res.status(404).json({ ok: false, erro: 'Pedido não encontrado.', id: id });
  }

  /* Log só com o número do pedido — nunca nome, e-mail, telefone,
     CPF ou endereço. O resumo da YouDraw vai no corpo, não no log. */
  log(`admin consultou pedido ${id}`);

  return res.json({
    ok: true,
    pedido: pedido,
    meta: {
      statusPermitidos: admin.STATUS_PERMITIDOS,
      rotulosStatus: admin.ROTULOS_STATUS,
      statusPagamentoPermitidos: admin.STATUS_PAGAMENTO_PERMITIDOS
    },
    resumoYouDraw: admin.resumoParaYouDraw(pedido)
  });
});

/* ─────────────────────────────────────────────
   PATCH /api/admin/orders/:id — atualização parcial
   Só altera os campos enviados; o resto permanece intacto.
   ───────────────────────────────────────────── */
app.patch('/api/admin/orders/:id', exigirAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();

  if (!id) {
    return res.status(400).json({ ok: false, erro: 'Informe o número do pedido.' });
  }

  const validacao = admin.validarAtualizacao(req.body);

  if (!validacao.ok) {
    return res.status(400).json({
      ok: false,
      erro: 'Dados inválidos para atualização.',
      campos: validacao.erros
    });
  }

  let pedido;
  try {
    pedido = await repositorio.atualizarPedido(id, validacao.alteracoes);
  } catch (erro) {
    log(`ERRO ao atualizar pedido ${id}:`, erro.message);
    return res.status(500).json({ ok: false, erro: 'Não foi possível atualizar o pedido.' });
  }

  if (!pedido) {
    return res.status(404).json({ ok: false, erro: 'Pedido não encontrado.', id: id });
  }

  /* Log apenas com o que mudou e o número do pedido. Nada de
     conteúdo de observação (pode ter dado de cliente) nem de endereço. */
  log(`admin atualizou pedido ${id} — campos: ${Object.keys(validacao.alteracoes).filter((c) => c !== 'observacoesModo').join(', ')}`);

  return res.json({
    ok: true,
    pedido: pedido,
    alterado: Object.keys(validacao.alteracoes).filter((c) => c !== 'observacoesModo'),
    resumoYouDraw: admin.resumoParaYouDraw(pedido)
  });
});

/* ─────────────────────────────────────────────
   404 e erro interno
   ───────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    erro: 'Rota não encontrada.',
    rotas: [
      'GET /api/health',
      'POST /api/orders',
      'GET /api/orders/:id',
      'POST /api/admin/login',
      'POST /api/admin/logout',
      'GET /api/admin/orders',
      'GET /api/admin/orders/:id',
      'PATCH /api/admin/orders/:id',
      'POST /api/payments/create-preference',
      'POST /api/payments/webhook',
      'GET /api/payments/status/:orderId',
      'POST /api/payments/create-preference',
      'POST /api/payments/webhook',
      'GET /api/payments/status/:orderId'
    ]
  });
});

app.use((err, req, res, next) => {
  log('ERRO interno:', err && err.message);
  if (res.headersSent) return next(err);
  return res.status(500).json({ ok: false, erro: 'Erro interno no servidor.' });
});

/* ─────────────────────────────────────────────
   INICIALIZAÇÃO
   ───────────────────────────────────────────── */
function iniciar() {
  /* Produção na Vercel exige Supabase; SQLite fica restrito ao desenvolvimento local. */
  if (process.env.VERCEL && !repositorio.usandoSupabase()) {
    throw new Error('Supabase é obrigatório na Vercel.');
  }
  /* Abre o banco e sincroniza o espelho de cupons com o catálogo. */
  if (!repositorio.usandoSupabase()) banco.abrir();
  const n = repositorio.usandoSupabase() ? 0 : banco.sincronizarCupons(CATALOGO);

  const servidor = app.listen(PORTA, () => {
    log(`API no ar em http://localhost:${PORTA}`);
    log(`banco: ${repositorio.usandoSupabase() ? 'supabase' : banco.CAMINHO_BANCO}`);
    log(`catalogo: ${CATALOGO.lista().length} produtos · cupons sincronizados: ${n}`);
    log(process.env.MP_ACCESS_TOKEN && process.env.PUBLIC_BASE_URL
      ? 'Mercado Pago: Checkout Pro configurado (webhook server-side).'
      : 'Mercado Pago: NAO configurado — defina MP_ACCESS_TOKEN e PUBLIC_BASE_URL.');

    /* Avisamos apenas SE o painel está configurado. O valor das
       variáveis nunca é impresso. */
    if (admin.configurado()) {
      log(`painel admin: configurado (sessao de ${Math.floor(admin.DURACAO_SESSAO_MS / 60000)} min)`);
    } else {
      log('painel admin: NAO configurado — defina ADMIN_EMAIL e ADMIN_PASSWORD para usar /admin.html');
    }
  });

  const encerrar = () => {
    log('encerrando...');
    servidor.close(() => { if (banco) banco.fechar(); process.exit(0); });
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  return servidor;
}

/* Só sobe sozinho se for executado direto (permite importar em teste). */
if (require.main === module) {
  iniciar();
}

module.exports = {
  app: app,
  iniciar: iniciar,
  PORTA: PORTA,
  exigirAdmin: exigirAdmin
};