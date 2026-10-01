'use strict';

/*
 * Integração server-side com Mercado Pago Checkout Pro.
 * Nenhum dado de cartão passa por este módulo.
 */
const crypto = require('node:crypto');

const MP_API = String(process.env.MP_API_BASE || 'https://api.mercadopago.com').replace(/\/+$/, '');

class ErroPagamento extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = 'ErroPagamento';
    this.status = status || 502;
  }
}

function config() {
  return {
    accessToken: String(process.env.MP_ACCESS_TOKEN || '').trim(),
    webhookSecret: String(process.env.MP_WEBHOOK_SECRET || '').trim(),
    publicBaseUrl: String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
  };
}

function exigirConfig(nome) {
  const valor = config()[nome];
  if (!valor) throw new ErroPagamento(`Mercado Pago não configurado: ${nome}.`, 503);
  return valor;
}

function dinheiro(centavos) {
  return Number((Number(centavos) / 100).toFixed(2));
}

function idDoWebhook(req) {
  const query = req && req.query ? req.query : {};
  const corpo = req && req.body ? req.body : {};
  return String(query['data.id'] || query.id || (corpo.data && corpo.data.id) || '').trim();
}

function assinaturaValida(req, dataId) {
  const secret = exigirConfig('webhookSecret');
  const assinatura = String((req.headers && (req.headers['x-signature'] || req.headers['X-Signature'])) || '');
  const requestId = String((req.headers && (req.headers['x-request-id'] || req.headers['X-Request-Id'])) || '');
  const partes = Object.fromEntries(assinatura.split(',').map((parte) => {
    const indice = parte.indexOf('=');
    return indice === -1 ? [parte.trim(), ''] : [parte.slice(0, indice).trim(), parte.slice(indice + 1).trim()];
  }));
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1 || !requestId || !dataId) return false;
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp * 1000) > 5 * 60 * 1000) return false;

  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', secret).update(manifesto, 'utf8').digest('hex');
  const recebido = Buffer.from(v1, 'utf8');
  const calculado = Buffer.from(esperado, 'utf8');
  return recebido.length === calculado.length && crypto.timingSafeEqual(recebido, calculado);
}

async function requisicaoMP(metodo, caminho, corpo) {
  const token = exigirConfig('accessToken');
  const resposta = await fetch(MP_API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroPagamento(`Mercado Pago recusou a operação (HTTP ${resposta.status}).`, 502);
  }
  return dados;
}

async function criarPreferencia(pedido) {
  if (!pedido || pedido.total === null || pedido.total === undefined) {
    throw new ErroPagamento('O pedido tem frete pendente e não pode gerar cobrança.', 409);
  }
  const base = exigirConfig('publicBaseUrl');
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  if (!itens.length) throw new ErroPagamento('Pedido sem itens.', 409);

  /* Uma linha única garante que o valor cobrado seja exatamente o total
     recalculado, inclusive quando há desconto e frete grátis. Os detalhes
     dos produtos permanecem no pedido do SQLite. */
  const preferencia = await requisicaoMP('POST', '/checkout/preferences', {
    external_reference: pedido.id,
    statement_descriptor: 'GRACIOU',
    items: [{
      id: pedido.id,
      title: `Pedido GRACIOU ${pedido.id}`,
      description: `${itens.length} item(ns) — detalhes no pedido GRACIOU`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: dinheiro(pedido.total)
    }],
    payer: { email: pedido.cliente && pedido.cliente.email },
    back_urls: {
      success: `${base}/checkout.html?pagamento=sucesso&pedido=${encodeURIComponent(pedido.id)}`,
      failure: `${base}/checkout.html?pagamento=falha&pedido=${encodeURIComponent(pedido.id)}`,
      pending: `${base}/checkout.html?pagamento=pendente&pedido=${encodeURIComponent(pedido.id)}`
    },
    auto_return: 'approved',
    notification_url: `${base}/api/payments/webhook`
  });

  return {
    id: String(preferencia.id || ''),
    initPoint: String(preferencia.init_point || ''),
    sandboxInitPoint: String(preferencia.sandbox_init_point || '')
  };
}

async function consultarPagamento(id) {
  if (!/^\d+$/.test(String(id))) throw new ErroPagamento('ID de pagamento inválido.', 400);
  return requisicaoMP('GET', `/v1/payments/${encodeURIComponent(id)}`);
}

async function consultarPreferencia(id) {
  if (!id) throw new ErroPagamento('Preferência inválida.', 400);
  const preferencia = await requisicaoMP('GET', `/checkout/preferences/${encodeURIComponent(id)}`);
  return {
    id: String(preferencia.id || id),
    initPoint: String(preferencia.init_point || ''),
    sandboxInitPoint: String(preferencia.sandbox_init_point || '')
  };
}

function statusInterno(status) {
  if (status === 'approved') return { pagamento: 'pago', pedido: 'pago' };
  if (status === 'pending' || status === 'in_process') return { pagamento: 'pendente', pedido: null };
  if (status === 'rejected' || status === 'cancelled') return { pagamento: 'recusado', pedido: null };
  return { pagamento: 'pendente', pedido: null };
}

module.exports = {
  ErroPagamento,
  config,
  idDoWebhook,
  assinaturaValida,
  criarPreferencia,
  consultarPreferencia,
  consultarPagamento,
  statusInterno
};
