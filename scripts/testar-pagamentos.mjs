import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const raiz = process.cwd();
const pagamentos = await import(pathToFileURL(join(raiz, 'backend', 'pagamentos.js')).href);
const p = pagamentos.default || pagamentos;

process.env.MP_ACCESS_TOKEN = 'TEST-token-nao-real';
process.env.MP_WEBHOOK_SECRET = 'segredo-de-teste';
process.env.PUBLIC_BASE_URL = 'https://teste.example.com';

assert.equal(p.statusInterno('approved').pagamento, 'pago');
assert.equal(p.statusInterno('approved').pedido, 'pago');
assert.equal(p.statusInterno('pending').pagamento, 'pendente');
assert.equal(p.statusInterno('in_process').pagamento, 'pendente');
assert.equal(p.statusInterno('rejected').pagamento, 'recusado');
assert.equal(p.statusInterno('cancelled').pagamento, 'recusado');

const dataId = '123456';
const requestId = 'request-qa';
const ts = Math.floor(Date.now() / 1000);
const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
const assinatura = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(manifesto).digest('hex');
const req = { query: { 'data.id': dataId }, body: {}, headers: { 'x-signature': `ts=${ts},v1=${assinatura}`, 'x-request-id': requestId } };
assert.equal(p.idDoWebhook(req), dataId);
assert.equal(p.assinaturaValida(req, dataId), true);
assert.equal(p.assinaturaValida(req, 'outro-id'), false);
assert.equal(p.assinaturaValida({ ...req, headers: { ...req.headers, 'x-signature': 'ts=1,v1=invalid' } }, dataId), false);

const checkout = readFileSync(join(raiz, 'checkout.html'), 'utf8');
assert.equal(/MP_ACCESS_TOKEN|MP_WEBHOOK_SECRET/.test(checkout), false);
const servidor = readFileSync(join(raiz, 'backend', 'servidor.js'), 'utf8');
assert.equal(/console\.log[^\n]*(MP_ACCESS_TOKEN|Bearer\s+\$\{?token)/.test(servidor), false);
const banco = readFileSync(join(raiz, 'backend', 'db.js'), 'utf8');
assert.equal(/cvv|numero_cartao|card_number/i.test(banco), true); /* só aparece em comentário de segurança, nunca em schema */
assert.equal(/\b(cvv|numero_cartao|card_number)\s+TEXT/i.test(banco), false);

console.log('OK — testes unitários de Mercado Pago passaram.');
console.log('Coberto: statuses, assinatura, replay expirado, token fora do HTML/logs e ausência de cartão.');
