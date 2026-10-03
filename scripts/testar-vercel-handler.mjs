import { createRequire } from 'node:module';
import http from 'node:http';

process.env.VERCEL = '1';
const require = createRequire(import.meta.url);
require('../backend/env').carregar();
const handler = require('../api/[...path].js');

const server = http.createServer((req, res) => handler(req, res));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  const body = await response.json().catch(() => ({}));
  if (response.status !== 200 && response.status !== 503) throw new Error(`HTTP inesperado: ${response.status}`);
  if (body.banco && body.banco.tipo === 'sqlite') throw new Error('SQLite foi selecionado no runtime Vercel.');
  console.log(JSON.stringify({ status: response.status, tipoBanco: body.banco?.tipo || null, handlerExportado: typeof handler === 'function' }));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
