/**
 * Atalho para rodar a verificação do painel admin num navegador real.
 *
 *   node scripts/rodar-qa-admin.mjs
 *   $env:GRACIOU_API='http://localhost:3002'; node scripts/rodar-qa-admin.mjs
 *
 * O navegador é o utilitário da skill de browser-automation, que já existe
 * nesta máquina. Se ele não for encontrado, o roteiro avisa em vez de
 * falhar com um erro obscuro.
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

const CAMINHOS_BROWSER = [
  join(process.env.USERPROFILE || '', '.codegpt', 'skills', 'browser-automation', 'browser.mjs'),
  join(process.env.HOME || '', '.codegpt', 'skills', 'browser-automation', 'browser.mjs')
];

const browser = CAMINHOS_BROWSER.find((c) => c && existsSync(c));

if (!browser) {
  console.error('Não encontrei o browser.mjs da skill de browser-automation.');
  console.error('Procurado em:\n  ' + CAMINHOS_BROWSER.join('\n  '));
  process.exit(1);
}

/* Tira a barra final para a URL não virar "...//admin.html". */
const semBarraFinal = (v) => String(v).replace(/\/+$/, '');

const api = semBarraFinal(process.env.GRACIOU_API || 'http://localhost:3001');
const front = semBarraFinal(process.env.GRACIOU_FRONT || 'http://localhost:3000');

/* O valor de ?api= é uma URL: precisa ir codificado na query string. */
const url = `${front}/admin.html?api=${encodeURIComponent(api)}`;

console.log('[qa-admin] front: ' + front);
console.log('[qa-admin] api:   ' + api);
console.log('[qa-admin] url:   ' + url + '\n');

/* Avisa antes de abrir o navegador, em vez de deixar o QA falhar
   com "lista vazia" sem explicar o motivo. */
for (const [nome, alvo] of [['frontend', front], ['API', api]]) {
  try {
    await fetch(alvo, { method: 'GET' });
  } catch (_) {
    console.error(`[qa-admin] O ${nome} nao respondeu em ${alvo}.`);
    console.error(nome === 'API'
      ? '          Suba com:  cd backend ; npm run dev'
      : '          Suba com:  npm run dev   (na raiz do projeto)');
    process.exit(1);
  }
}


const filho = spawn(
  process.execPath,
  [browser, url, '--script', join(AQUI, 'qa-admin-painel.mjs')],
  { stdio: 'inherit', cwd: RAIZ }
);

filho.on('error', (erro) => {
  console.error('[qa-admin] Nao consegui abrir o navegador: ' + erro.message);
  process.exit(1);
});

filho.on('exit', (codigo) => process.exit(codigo === null ? 1 : codigo));