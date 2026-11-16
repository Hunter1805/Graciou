import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(resolve(raiz, 'vercel.json'), 'utf8'));
const routes = config.routes || [];

assert.deepEqual(routes[0], { src: '^/$', dest: '/preview.html' },
  'A regra da raiz deve reescrever para preview.html sem mudar a URL visível.');
assert.deepEqual(routes[1], { handle: 'filesystem' },
  'A fase filesystem deve vir imediatamente depois da regra da raiz para localizar arquivos e Functions.');
assert.equal(routes.length, 2,
  'Não adicione regras posteriores que possam bloquear arquivos públicos ou Functions.');

assert.ok(config.functions && config.functions['api/[...path].js'],
  'A Function catch-all api/[...path].js deve permanecer configurada.');
assert.ok(existsSync(resolve(raiz, 'api/[...path].js')),
  'O entrypoint local da Function catch-all api/[...path].js deve existir.');
assert.ok(config.proxy && config.proxy.matcher.includes('/admin.html'),
  'A página admin.html deve continuar passando pelo proxy.');
assert.ok(config.proxy.matcher.includes('/api/admin/login'),
  'O POST /api/admin/login deve continuar passando pelo proxy antes da Function.');

for (const caminho of ['preview.html', 'admin.html', 'index.html', 'assets/graciou-base.css', 'assets/graciou-main.js']) {
  assert.ok(existsSync(resolve(raiz, caminho)), `Arquivo público ausente: ${caminho}`);
}

console.log('OK — rewrite da raiz, filesystem, proxy, Function catch-all e arquivos públicos configurados.');
