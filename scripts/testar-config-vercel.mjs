import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(resolve(raiz, 'vercel.json'), 'utf8'));
const routes = config.routes || [];

// 1. Ordem obrigatória das rotas: raiz -> /api/* explícito -> filesystem
assert.equal(routes.length, 3,
  'routes deve conter exatamente 3 entradas: raiz, regra explícita de /api/* e filesystem.');

assert.deepEqual(routes[0], { src: '^/$', dest: '/preview.html' },
  'A regra da raiz deve ser a primeira e reescrever para /preview.html sem mudar a URL visível.');

assert.deepEqual(routes[1], { src: '^/api/(.*)$', dest: '/api/[...path].js' },
  'A regra de /api/* deve vir logo após a raiz, antes de filesystem, direcionando explicitamente para /api/[...path].js.');

assert.deepEqual(routes[2], { handle: 'filesystem' },
  'A fase filesystem deve vir por último para resolver assets e páginas estáticas sem bloquear rotas de API.');

// 2. Cobertura de caminhos profundos pela regex da regra /api/*
const regexApi = new RegExp(routes[1].src);
const rotasObrigatorias = [
  '/api/health',
  '/api/admin/login',
  '/api/admin/orders',
  '/api/admin/orders/qualquer-id',
  '/api/payments/webhook',
  '/api/orders/qualquer-id'
];

for (const rota of rotasObrigatorias) {
  assert.ok(regexApi.test(rota), `A regra de API deve cobrir ${rota}`);
}

// 3. Destino da Function catch-all e arquivos locais
assert.equal(routes[1].dest, '/api/[...path].js',
  'O destino exato da regra de API deve ser /api/[...path].js');

assert.ok(config.functions && config.functions['api/[...path].js'],
  'A Function catch-all api/[...path].js deve permanecer configurada.');

assert.ok(existsSync(resolve(raiz, 'api/[...path].js')),
  'O entrypoint local da Function catch-all api/[...path].js deve existir.');

assert.deepEqual(config.proxy && config.proxy.matcher, ['/admin.html'],
  'Somente /admin.html deve passar pelo proxy; as rotas /api/* não devem ser interceptadas pelo middleware.');

// 4. Arquivos estáticos continuam acessíveis
for (const caminho of ['preview.html', 'admin.html', 'index.html', 'assets/graciou-base.css', 'assets/graciou-main.js']) {
  assert.ok(existsSync(resolve(raiz, caminho)), `Arquivo público ausente: ${caminho}`);
}

console.log('OK — routes ordenado (raiz -> /api/* -> filesystem), cobertura profunda de /api/* e arquivos públicos validados.');
