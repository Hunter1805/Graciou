'use strict';

const crypto = require('node:crypto');

/* Repositório único da persistência. Supabase é preferido quando a chave
   server_role existe; SQLite permanece como fallback local. A chave nunca
   sai deste módulo. */
/* SQLite só é carregado fora da Vercel. O require condicional mantém o
   módulo fora do caminho de inicialização serverless. */
let sqlite = null;
if (!process.env.VERCEL) sqlite = require('./db');
const supabase = require('./supabase');
const catalogo = require('./regras').CATALOGO;

/* Acesso direto ao SQLite para os dois campos de controle de e-mail.
   Passa pelo mesmo módulo de banco (e pelas mesmas migrações) — não é
   uma segunda conexão. */
const db_marcarEmailConfirmacao = (id, messageId) => sqlite.marcarEmailConfirmacao(id, messageId);
const db_emailConfirmacaoDoPedido = (id) => sqlite.emailConfirmacaoDoPedido(id);

const usaSupabase = () => supabase.validarConfiguracao().completa;
const agora = () => new Date().toISOString();

function itemParaSupabase(item, pedidoId) {
  return {
    pedido_id: pedidoId,
    produto_id: item.produtoId || item.productId || item.id || '',
    nome: item.nome || item.name || '',
    tamanho: item.tamanho || item.size || '',
    cor: item.cor || item.color || null,
    quantidade: Number(item.quantidade) || 0,
    preco_pix_centavos: Number(catalogo.precoPorForma(catalogo.busca(item.productId || item.produtoId), 'pix') || item.precoUnitario || 0),
    preco_cartao_centavos: Number(catalogo.precoPorForma(catalogo.busca(item.productId || item.produtoId), 'cartao') || item.precoUnitario || 0)
  };
}

function itemParaPedido(row) {
  return {
    productId: row.produto_id,
    nome: row.nome,
    tamanho: row.tamanho,
    cor: row.cor,
    quantidade: row.quantidade,
    precoPixCentavos: row.preco_pix_centavos,
    precoCartaoCentavos: row.preco_cartao_centavos
  };
}

function pedidoParaSupabase(dados) {
  return {
    codigo: dados.id,
    status: dados.status_pedido,
    status_pagamento: dados.status_pagamento,
    forma_pagamento: dados.forma_pagamento,
    subtotal_centavos: dados.subtotal,
    desconto_centavos: dados.desconto,
    frete_centavos: dados.frete,
    total_centavos: dados.total,
    cupom: dados.cupom_codigo || null,
    nome_cliente: dados.cliente_nome,
    email_cliente: dados.cliente_email,
    telefone_cliente: dados.cliente_telefone || null,
    cpf_cliente: dados.cliente_cpf || null,
    endereco: JSON.parse(dados.endereco_json),
    rastreio: dados.rastreio || null,
    observacoes: dados.observacoes || null,
    transportadora: dados.transportadora || null,
    rastreio_url: dados.rastreio_url || null,
    observacao_publica: dados.observacao_publica || null
  };
}

function linhaParaPedido(row, itens) {
  return {
    id: row.codigo,
    criadoEm: row.created_at,
    cliente: { nome: row.nome_cliente, email: row.email_cliente, telefone: row.telefone_cliente, cpf: row.cpf_cliente },
    endereco: row.endereco || {},
    itens: itens || [],
    pagamento: { forma: row.forma_pagamento, status: row.status_pagamento },
    cupom: row.cupom ? { codigo: row.cupom } : null,
    subtotal: row.subtotal_centavos,
    desconto: row.desconto_centavos,
    frete: row.frete_centavos,
    total: row.total_centavos,
    statusPedido: row.status,
    rastreio: row.rastreio || null,
    transportadora: row.transportadora || null,
    rastreioUrl: row.rastreio_url || null,
    observacoes: row.observacoes || null,
    observacaoPublica: row.observacao_publica || null,
    pedidoYouDraw: null,
    atualizadoEm: row.updated_at || null,
    mercadoPago: { preferenceId: row.mp_preference_id || null, paymentId: row.mp_payment_id || null, status: row.mp_status || null, pagoEm: row.pago_em || null }
  };
}

async function request(path, options) {
  const config = supabase.configuracao();
  const resposta = await fetch(config.url + '/rest/v1/' + path, {
    method: options && options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: options && options.body === undefined ? undefined : (options && options.body ? JSON.stringify(options.body) : undefined)
  });
  const texto = await resposta.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (_) {}
  if (!resposta.ok) throw new Error('Supabase recusou a operação de persistência.');
  return dados;
}

async function inserirSupabase(dados) {
  const linhas = await request('pedidos', { method: 'POST', body: pedidoParaSupabase(dados) });
  const row = Array.isArray(linhas) ? linhas[0] : linhas;
  if (!row || !row.id) throw new Error('Supabase não devolveu o pedido criado.');
  const itens = JSON.parse(dados.itens_json).map((item) => itemParaSupabase(item, row.id));
  if (itens.length) await request('pedido_itens', { method: 'POST', body: itens });
  return buscarSupabase(dados.id);
}

async function buscarSupabase(codigo) {
  const pedidos = await request('pedidos?codigo=eq.' + encodeURIComponent(codigo) + '&select=*');
  const row = Array.isArray(pedidos) ? pedidos[0] : null;
  if (!row) return null;
  const itens = await request('pedido_itens?pedido_id=eq.' + encodeURIComponent(row.id) + '&select=*&order=created_at.asc');
  const cupom = row.cupom ? await request('cupons?codigo=eq.' + encodeURIComponent(row.cupom) + '&select=codigo,tipo,valor').then((x) => x && x[0]) : null;
  const pedido = linhaParaPedido(row, (itens || []).map(itemParaPedido));
  if (cupom && pedido.cupom) Object.assign(pedido.cupom, { tipo: cupom.tipo, valor: cupom.valor });
  return pedido;
}

async function atualizarSupabase(codigo, alteracoes) {
  const atual = await buscarSupabase(codigo);
  if (!atual) return null;
  const patch = {};
  if (alteracoes.statusPedido !== undefined) patch.status = alteracoes.statusPedido;
  if (alteracoes.statusPagamento !== undefined) patch.status_pagamento = alteracoes.statusPagamento;
  if (alteracoes.rastreio !== undefined) patch.rastreio = alteracoes.rastreio;
  if (alteracoes.transportadora !== undefined) patch.transportadora = alteracoes.transportadora;
  if (alteracoes.rastreioUrl !== undefined) patch.rastreio_url = alteracoes.rastreioUrl;
  if (alteracoes.observacaoPublica !== undefined) patch.observacao_publica = alteracoes.observacaoPublica;
  if (alteracoes.observacoes !== undefined) {
    const anterior = atual.observacoes || '';
    patch.observacoes = alteracoes.observacoesModo === 'substituir'
      ? (alteracoes.observacoes || null)
      : (!alteracoes.observacoes ? (anterior || null) : (anterior ? anterior + '\n' + alteracoes.observacoes : alteracoes.observacoes));
  }
  if (!Object.keys(patch).length) return atual;
  patch.updated_at = agora();
  await request('pedidos?codigo=eq.' + encodeURIComponent(codigo), { method: 'PATCH', body: patch });
      return buscarSupabase(codigo);
  }

  async function deletarSupabase(codigo) {
    const pedidos = await request('pedidos?codigo=eq.' + encodeURIComponent(codigo) + '&select=id');
    const row = Array.isArray(pedidos) ? pedidos[0] : null;
    if (!row) return false;
    await request('pedidos?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE', body: undefined });
    return true;
  }

async function atualizarPagamentoSupabase(codigo, dados) {
  const atual = await buscarSupabase(codigo);
  if (!atual) return null;
  const patch = { mp_status: dados.mpStatus || null, mp_payment_id: dados.mpPaymentId || null, updated_at: agora() };
  if (dados.mpPreferenceId) patch.mp_preference_id = dados.mpPreferenceId;
  if (dados.statusPagamento === 'pago') {
    patch.status_pagamento = 'pago';
    if (atual.statusPedido === 'aguardando_pagamento') patch.status = 'pago';
    patch.pago_em = atual.mercadoPago.pagoEm || agora();
  } else if ((dados.statusPagamento === 'pendente' || dados.statusPagamento === 'recusado') && atual.pagamento.status !== 'pago') {
    patch.status_pagamento = dados.statusPagamento;
  }
  await request('pedidos?codigo=eq.' + encodeURIComponent(codigo), { method: 'PATCH', body: patch });
  return buscarSupabase(codigo);
}

async function listarResumoSupabase(opcoes) {
  const config = opcoes || {};
  const n = Math.min(Math.max(Number(config.limite) || 100, 1), 500);
  let filtro = 'select=*&order=created_at.desc&limit=' + n;
  if (config.status) filtro += '&status=eq.' + encodeURIComponent(config.status);
  const rows = await request('pedidos?' + filtro);
  return Promise.all((rows || []).map(async (row) => {
    const pedido = linhaParaPedido(row, await request('pedido_itens?pedido_id=eq.' + encodeURIComponent(row.id) + '&select=*').then((x) => (x || []).map(itemParaPedido)));
    return {
      id: pedido.id, criadoEm: pedido.criadoEm, atualizadoEm: pedido.atualizadoEm,
      clienteNome: pedido.cliente.nome, clienteEmail: pedido.cliente.email, telefone: pedido.cliente.telefone,
      cidade: pedido.endereco.cidade || '', estado: pedido.endereco.estado || '', statusPedido: pedido.statusPedido,
      statusPagamento: pedido.pagamento.status, formaPagamento: pedido.pagamento.forma, total: pedido.total,
      subtotal: pedido.subtotal, frete: pedido.frete, cupom: pedido.cupom && pedido.cupom.codigo, rastreio: pedido.rastreio,
      pedidoYouDraw: pedido.pedidoYouDraw, temObservacao: Boolean(pedido.observacoes),
      pecas: pedido.itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0), linhas: pedido.itens.length
    };
  }));
}

async function contagemSupabase(statuses) {
  const rows = await request('pedidos?select=status');
  const out = {}; (statuses || []).forEach((s) => { out[s] = 0; });
  (rows || []).forEach((r) => { out[r.status] = (out[r.status] || 0) + 1; });
  return out;
}

/* ─────────────────────────────────────────────
   HISTÓRICO (linha do tempo) — Supabase
   ───────────────────────────────────────────── */
async function registrarEventoSupabase(id, evento) {
  const dados = evento || {};
  const linhas = await request('order_events', {
    method: 'POST',
    body: {
      pedido_id: id,
      tipo: String(dados.tipo || 'atualizacao'),
      status: dados.status || null,
      titulo: dados.titulo || null,
      descricao: dados.descricao || null,
      publico: dados.publico === false ? false : true,
      criado_em: dados.criadoEm || agora()
    }
  });
  const row = Array.isArray(linhas) ? linhas[0] : linhas;
  return row && row.id ? row.id : null;
}

async function listarEventosSupabase(id) {
  const rows = await request('order_events?pedido_id=eq.' + encodeURIComponent(id) + '&select=id,tipo,status,titulo,descricao,publico,criado_em&order=criado_em.asc,id.asc');
  return (rows || []).map((linha) => ({
    id: Number(linha.id),
    tipo: linha.tipo,
    status: linha.status || null,
    titulo: linha.titulo || null,
    descricao: linha.descricao || null,
    publico: linha.publico !== false,
    criadoEm: linha.criado_em
  }));
}

/** Busca pública: número do pedido + e-mail (case-insensitive, via ilike). */
async function buscarPedidoPorNumeroEEmailSupabase(id, email) {
  const pedidos = await request(
    'pedidos?codigo=eq.' + encodeURIComponent(id) +
    '&email_cliente=ilike.' + encodeURIComponent(email) +
    '&select=*'
  );
  const row = Array.isArray(pedidos) ? pedidos[0] : null;
  if (!row) return null;
  return buscarSupabase(row.codigo);
}

async function testarConexao() {
  await request('cupons?select=codigo&limit=1');
  return true;
}

async function listarCuponsSupabase() {
  return request('cupons?select=codigo,tipo,valor,ativo,valor_minimo_centavos,validade,limite_usos&order=codigo.asc');
}

/* ─────────────────────────────────────────────
   E-MAIL DE CONFIRMAÇÃO (idempotência)
   Marca no pedido que a confirmação já saiu. O filtro
   `email_confirmacao_enviado_em=is.null` torna a operação atômica:
   duas requisições simultâneas não conseguem marcar/enviar duas
   vezes — apenas a primeira encontra a linha livre.
   ───────────────────────────────────────────── */
async function marcarEmailConfirmacaoSupabase(codigo, messageId) {
  const linhas = await request(
    'pedidos?codigo=eq.' + encodeURIComponent(codigo) + '&email_confirmacao_enviado_em=is.null',
    {
      method: 'PATCH',
      body: {
        email_confirmacao_enviado_em: agora(),
        email_confirmacao_id: messageId || null
      }
    }
  );
  return Array.isArray(linhas) && linhas.length > 0;
}

async function emailConfirmacaoDoPedidoSupabase(codigo) {
  const linhas = await request(
    'pedidos?codigo=eq.' + encodeURIComponent(codigo) + '&select=email_confirmacao_enviado_em,email_confirmacao_id'
  );
  const row = Array.isArray(linhas) ? linhas[0] : null;
  if (!row) return null;
  return {
    enviado_em: row.email_confirmacao_enviado_em || null,
    message_id: row.email_confirmacao_id || null
  };
}

module.exports = {
  CAMINHO_BANCO: sqlite ? sqlite.CAMINHO_BANCO : null,
  abrir: () => sqlite ? sqlite.abrir() : null,
  fechar: () => sqlite ? sqlite.fechar() : undefined,
  sincronizarCupons: (catalogo) => sqlite ? sqlite.sincronizarCupons(catalogo) : 0,
  listarCupons: () => usaSupabase() ? listarCuponsSupabase() : sqlite.listarCupons(),
  detalhesDoCupom: (codigo) => usaSupabase()
    ? request('cupons?codigo=eq.' + encodeURIComponent(String(codigo || '').toUpperCase()) + '&select=tipo,valor').then((rows) => rows && rows[0] ? { tipo: rows[0].tipo, valor: rows[0].valor } : null)
    : sqlite.detalhesDoCupom(codigo),
  gerarIdPedido: (agoraData) => {
    const d = agoraData || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const data = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `GR-${data}-0000-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  },
  inserirPedido: (dados) => usaSupabase() ? inserirSupabase(dados) : sqlite.inserirPedido(dados),
  buscarPedido: (id) => usaSupabase() ? buscarSupabase(id) : sqlite.buscarPedido(id),
  listarPedidos: (limite) => usaSupabase() ? listarResumoSupabase({ limite }) : sqlite.listarPedidos(limite),
  listarResumoPedidos: (opcoes) => usaSupabase() ? listarResumoSupabase(opcoes) : sqlite.listarResumoPedidos(opcoes),
  contagemPorStatus: (statuses) => usaSupabase() ? contagemSupabase(statuses) : sqlite.contagemPorStatus(statuses),
  atualizarPedido: (id, alteracoes) => usaSupabase() ? atualizarSupabase(id, alteracoes) : sqlite.atualizarPedido(id, alteracoes),
  atualizarPagamento: (id, dados) => usaSupabase() ? atualizarPagamentoSupabase(id, dados) : sqlite.atualizarPagamento(id, dados),
  pagamentoDoPedido: async (id) => {
    if (!usaSupabase()) return sqlite.pagamentoDoPedido(id);
    const p = await buscarSupabase(id);
    return p ? { id: p.id, status_pedido: p.statusPedido, status_pagamento: p.pagamento.status, total: p.total, mp_preference_id: p.mercadoPago.preferenceId, mp_payment_id: p.mercadoPago.paymentId, mp_status: p.mercadoPago.status, pago_em: p.mercadoPago.pagoEm } : null;
  },
  deletarPedido: (id) => usaSupabase() ? deletarSupabase(id) : Promise.resolve(false),
  testarConexao: testarConexao,
  associarPreferencia: async (id, preferenceId) => {
    if (!usaSupabase()) return sqlite.associarPreferencia(id, preferenceId);
    await request('pedidos?codigo=eq.' + encodeURIComponent(id), { method: 'PATCH', body: { mp_preference_id: preferenceId, updated_at: agora() } });
    return buscarSupabase(id);
  },
  usandoSupabase: usaSupabase,
  marcarEmailConfirmacao: (id, messageId) => usaSupabase()
    ? marcarEmailConfirmacaoSupabase(id, messageId)
    : db_marcarEmailConfirmacao(id, messageId),
  emailConfirmacaoDoPedido: (id) => usaSupabase()
    ? emailConfirmacaoDoPedidoSupabase(id)
    : db_emailConfirmacaoDoPedido(id),
  /* Histórico do pedido (linha do tempo) — mesmo contrato em ambos os bancos. */
  registrarEvento: (id, evento) => usaSupabase()
    ? registrarEventoSupabase(id, evento)
    : Promise.resolve(sqlite.registrarEvento(id, evento)),
  listarEventos: (id) => usaSupabase()
    ? listarEventosSupabase(id)
    : Promise.resolve(sqlite.listarEventos(id)),
  /* Consulta pública: número do pedido + e-mail da compra. */
  buscarPedidoPorNumeroEEmail: (id, email) => usaSupabase()
    ? buscarPedidoPorNumeroEEmailSupabase(id, email)
    : Promise.resolve(sqlite.buscarPedidoPorNumeroEEmail(id, email))
};
