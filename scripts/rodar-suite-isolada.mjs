/**
 * ═══════════════════════════════════════
 * GRACIOU — SUÍTE LEGADA EM AMBIENTE ISOLADO
 * Arquivo: scripts/rodar-suite-isolada.mjs
 * ═══════════════════════════════════════
 *
 * Sobe a API (backend/servidor.js) com env TOTALMENTE isolada — sem
 * Supabase, sem Mercado Pago, sem Brevo — e um SQLite temporário, e roda
 * a suíte legada (scripts/testar-backend.mjs) contra ela.
 *
 * O ponto: provar que as divergências vistas ao rodar contra o servidor
 * "real" (que lê o .env do desenvolvedor) são AMBIENTAIS, não de código.
 *
 * `env` é passado explicitamente no spawn, então os valores vazios
 * valem de verdade e o carregador de .env (backend/env.js) NÃO os
 * substitui (ele só preenche variável ausente).
 *
 * Sem credencial real, sem rede externa. Banco e logs removidos no fim.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = 4401;
const BASE = `http://127.0.0.1:${PORTA}`;

const pastaTemp = mkdtempSync(join(tmpdir(), 'graciou-suites-'));
/* A suíte legada espera este nome quando GRACIOU_DB está definido. */
const CAMINHO_BANCO = join(pastaTemp, 'graciou-frete-suite.sqlite');

/* Env limpa: nada de credencial real, nada de serviço externo. */
const envLimpo = {
  ...process.env,
  PORT: String(PORTA),
  GRACIOU_DB: CAMINHO_BANCO,
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  MP_ACCESS_TOKEN: '',
  MP_WEBHOOK_SECRET: '',
  MP_API_BASE: '',
  PUBLIC_BASE_URL: '',
  BREVO_API_KEY: '',
  BREVO_SENDER_EMAIL: '',
  BREVO_SENDER_NAME: '',
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
  VERCEL: ''
};

const api = spawn(process.execPath, ['--no-warnings', 'backend/servidor.js'], {
  cwd: RAIZ,
  env: envLimpo,
  stdio: ['ignore', 'pipe', 'pipe']
});

let logApi = '';
api.stdout.on('data', (d) => { logApi += String(d); });
api.stderr.on('data', (d) => { logApi += String(d); });

const encerrar = () => {
  try { api.kill(); } catch (_) { }
  try { rmSync(pastaTemp, { recursive: true, force: true }); } catch (_) { }
};
process.on('exit', encerrar);
process.on('SIGINT', () => { encerrar(); process.exit(1); });

async function esperarApi() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch (_) { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

console.log(`Subindo API isolada em ${BASE} (SQLite temporário, sem serviços externos)…`);
const subiu = await esperarApi();
if (!subiu) {
  console.log('API não subiu. Log:');
  console.log(logApi.slice(-2000));
  encerrar();
  process.exit(1);
}

/* Confirma o ambiente antes de acusar o código. */
const health = await (await fetch(`${BASE}/api/health`)).json();
console.log(`  banco=${health.banco.tipo} arquivo=${health.banco.arquivo}`);
console.log(`  pagamentoIntegrado=${health.pagamentoIntegrado} emailConfigurado=${health.emailTransacional && health.emailTransacional.configurado}`);
console.log(`  usuarioAdmin=${health.usuarioAdmin}\n`);

/* Roda a suíte legada contra a API isolada. */
const suite = spawn(process.execPath, ['--no-warnings', 'scripts/testar-backend.mjs', BASE], {
  cwd: RAIZ,
  env: { ...process.env, GRACIOU_DB: CAMINHO_BANCO },
  stdio: ['ignore', 'inherit', 'inherit']
});

suite.on('exit', (codigo) => {
  encerrar();
  process.exit(codigo === null ? 1 : codigo);
});
