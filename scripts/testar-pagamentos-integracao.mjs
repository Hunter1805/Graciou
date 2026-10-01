import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const apiPort = 3311;
const mockPort = 3999;
const env = {
  ...process.env,
  PATH: `${process.env.PATH};C:\\Program Files\\nodejs`,
  PORT: String(apiPort),
  MP_ACCESS_TOKEN: 'TEST-token-nao-real',
  MP_WEBHOOK_SECRET: 'segredo-de-teste',
  PUBLIC_BASE_URL: `http://localhost:${apiPort}`,
  MP_API_BASE: `http://localhost:${mockPort}`,
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: ''
};

let paymentStatus = 'approved';
let paymentId = '987654321';
let preferenceId = 'pref-qa-1';
let preferenceBody = null;

const mock = createServer(async (req, res) => {
  const partes = new URL(req.url, `http://localhost:${mockPort}`);
  let corpo = '';
  for await (const chunk of req) corpo += chunk;
  if (req.method === 'POST' && partes.pathname === '/checkout/preferences') {
    preferenceBody = corpo ? JSON.parse(corpo) : null;
    return responder(res, 201, { id: preferenceId, init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref=qa', sandbox_init_point: 'https://sandbox.mercadopago.com/qa' });
  }
  if (req.method === 'GET' && partes.pathname === `/checkout/preferences/${preferenceId}`) {
    return responder(res, 200, { id: preferenceId, init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref=qa', sandbox_init_point: 'https://sandbox.mercadopago.com/qa' });
  }
  if (req.method === 'GET' && partes.pathname === `/v1/payments/${paymentId}`) {
    return responder(res, 200, { id: paymentId, status: paymentStatus, external_reference: globalThis.externalReference, preference_id: preferenceId, currency_id: 'BRL', transaction_amount: 199.8 });
  }
  return responder(res, 404, { error: 'mock route not found' });
});

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(dados));
}

import crypto from 'node:crypto';
function assinaturaReal(dataId, requestId, ts) {
  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifesto).digest('hex')}`;
}

let processo;
try {
  await new Promise((resolve, reject) => mock.listen(mockPort, '127.0.0.1', (erro) => erro ? reject(erro) : resolve()));
  processo = spawn(process.execPath, ['--no-warnings', 'backend/servidor.js'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
  await esperar(async () => (await fetch(`http://localhost:${apiPort}/api/health`)).ok, 8000);

  const pedidoFrete = await post(`http://localhost:${apiPort}/api/orders`, {
    cliente: { nome: 'QA Frete Pendente', email: 'frete@example.com', telefone: '11987654321', cpf: '12345678901' },
    endereco: { cep: '01310100', estado: 'SP', cidade: 'São Paulo', bairro: 'Centro', rua: 'Rua QA', numero: '11' },
    itens: [{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }],
    pagamento: { forma: 'pix' }
  });
  assert.equal(pedidoFrete.status, 201);
  const bloqueado = await post(`http://localhost:${apiPort}/api/payments/create-preference`, { orderId: pedidoFrete.body.id });
  assert.equal(bloqueado.status, 409);

  const pedido = await post(`http://localhost:${apiPort}/api/orders`, {
    cliente: { nome: 'QA Mercado Pago', email: 'qa@example.com', telefone: '11987654321', cpf: '12345678901' },
    endereco: { cep: '01310100', estado: 'SP', cidade: 'São Paulo', bairro: 'Centro', rua: 'Rua QA', numero: '10' },
    itens: [{ productId: 'tee-raizes', tamanho: 'M', quantidade: 2 }],
    pagamento: { forma: 'pix' }
  });
  assert.equal(pedido.status, 201);
  const orderId = pedido.body.id;
  globalThis.externalReference = orderId;

  const preferencia = await post(`http://localhost:${apiPort}/api/payments/create-preference`, { orderId });
  assert.equal(preferencia.status, 201);
  assert.equal(preferencia.body.preferenceId, preferenceId);
  assert.equal(preferencia.body.init_point.startsWith('https://'), true);
  assert.equal(preferenceBody.external_reference, orderId);
  assert.equal(preferenceBody.items[0].quantity, 1);

  const ts = Math.floor(Date.now() / 1000);
  const headers = { 'Content-Type': 'application/json', 'x-request-id': 'qa-request-1', 'x-signature': assinaturaReal(paymentId, 'qa-request-1', ts) };
  const webhook1 = await post(`http://localhost:${apiPort}/api/payments/webhook?data.id=${paymentId}`, { type: 'payment', data: { id: paymentId } }, headers);
  assert.equal(webhook1.status, 200);
  const statusPago = await fetchJson(`http://localhost:${apiPort}/api/payments/status/${orderId}`);
  assert.equal(statusPago.body.statusPagamento, 'pago');
  assert.equal(statusPago.body.statusPedido, 'pago');

  paymentStatus = 'pending';
  const pedidoPendente = await post(`http://localhost:${apiPort}/api/orders`, {
    cliente: { nome: 'QA Pendente', email: 'pendente@example.com', telefone: '11987654321', cpf: '12345678901' },
    endereco: { cep: '01310100', estado: 'SP', cidade: 'São Paulo', bairro: 'Centro', rua: 'Rua QA', numero: '12' },
    itens: [{ productId: 'tee-raizes', tamanho: 'M', quantidade: 2 }],
    pagamento: { forma: 'pix' }
  });
  assert.equal(pedidoPendente.status, 201);
  const pendenteId = pedidoPendente.body.id;
  globalThis.externalReference = pendenteId;
  const pendentePreferencia = await post(`http://localhost:${apiPort}/api/payments/create-preference`, { orderId: pendenteId });
  assert.equal(pendentePreferencia.status, 201);
  const pendenteWebhook = await post(`http://localhost:${apiPort}/api/payments/webhook?data.id=${paymentId}`, { type: 'payment', data: { id: paymentId } }, headers);
  assert.equal(pendenteWebhook.status, 200);
  const estadoPendente = await fetchJson(`http://localhost:${apiPort}/api/payments/status/${pendenteId}`);
  assert.equal(estadoPendente.body.statusPagamento, 'pendente');
  assert.equal(estadoPendente.body.statusPedido, 'aguardando_pagamento');

  globalThis.externalReference = orderId;
  paymentStatus = 'approved';
  const webhookRepetido = await post(`http://localhost:${apiPort}/api/payments/webhook?data.id=${paymentId}`, { type: 'payment', data: { id: paymentId } }, headers);
  assert.equal(webhookRepetido.status, 200);
  const statusDepoisRepeticao = await fetchJson(`http://localhost:${apiPort}/api/payments/status/${orderId}`);
  assert.equal(statusDepoisRepeticao.body.statusPagamento, 'pago');

  paymentStatus = 'rejected';
  const rejeitado = await post(`http://localhost:${apiPort}/api/payments/webhook?data.id=${paymentId}`, { type: 'payment', data: { id: paymentId } }, headers);
  assert.equal(rejeitado.status, 200);
  const statusDepoisRejeicao = await fetchJson(`http://localhost:${apiPort}/api/payments/status/${orderId}`);
  assert.equal(statusDepoisRejeicao.body.statusPagamento, 'pago');

  const invalido = await post(`http://localhost:${apiPort}/api/payments/webhook?data.id=${paymentId}`, {}, { 'x-request-id': 'qa-request-1', 'x-signature': 'ts=1,v1=invalid' });
  assert.equal(invalido.status, 401);

  console.log('OK — integração Mercado Pago simulada passou.');
  console.log('Coberto: pedido 2 peças, preferência, external_reference, aprovado, repetição, rejeitado sem rebaixar e assinatura inválida.');
} finally {
  mock.close();
  if (processo) processo.kill('SIGTERM');
}

async function esperar(fn, timeout) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    try { if (await fn()) return; } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Tempo esgotado aguardando API de teste.');
}
async function fetchJson(url, options) {
  const resposta = await fetch(url, options);
  return { status: resposta.status, body: await resposta.json() };
}
async function post(url, body, extraHeaders) {
  return fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }, body: JSON.stringify(body) });
}
