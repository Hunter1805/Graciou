/**
 * Diagnóstico: por que os cards abaixo da dobra ficam com opacity 0?
 * Mede, card por card: classe, opacity computada, topo relativo à viewport
 * e se está dentro de [data-reveal].
 *
 * Uso: node scripts/qa-diag-reveal.mjs [url]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const URL_ALVO = process.argv[2] || 'http://localhost:3010/collection.html';
const PORTA_CDP = 9666;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-rev-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORTA_CDP, '--user-data-dir=' + perfil, 'about:blank'
], { stdio: 'ignore' });

const encerrar = () => {
  try { chrome.kill(); } catch (_) {}
  try { rmSync(perfil, { recursive: true, force: true }); } catch (_) {}
};

function conectar(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pendentes = new Map();
    ws.addEventListener('open', () => resolve({
      enviar(metodo, params) {
        const meuId = ++id;
        ws.send(JSON.stringify({ id: meuId, method: metodo, params: params || {} }));
        return new Promise((res, rej) => pendentes.set(meuId, { res, rej }));
      },
      fechar() { try { ws.close(); } catch (_) {} }
    }));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) {
        const { res, rej } = pendentes.get(msg.id);
        pendentes.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      }
    });
    ws.addEventListener('error', () => reject(new Error('WS erro')));
  });
}

const MEDIR = `(function(){
  var cards = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'));
  return {
    innerHeight: window.innerHeight,
    scrollY: window.scrollY,
    gridTop: Math.round(document.getElementById('products-grid').getBoundingClientRect().top),
    cards: cards.map(function(c){
      var cs = getComputedStyle(c);
      var r = c.getBoundingClientRect();
      return {
        id: c.dataset.produtoId,
        classe: c.className,
        opacity: cs.opacity,
        transform: cs.transform,
        top: Math.round(r.top),
        visivelNaViewport: r.top < window.innerHeight && r.bottom > 0,
        revelado: c.classList.contains('revealed')
      };
    })
  };
})()`;

async function principal() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORTA_CDP + '/json/version'); if (r.ok) break; } catch (_) {}
    await esperar(250);
  }
  const alvo = await (await fetch('http://127.0.0.1:' + PORTA_CDP + '/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = await conectar(alvo.webSocketDebuggerUrl);
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.enviar('Page.navigate', { url: URL_ALVO });

  const prazo = Date.now() + 25000;
  while (Date.now() < prazo) {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: `document.querySelectorAll('#products-grid .p-card[data-produto-id]').length === 8`,
      returnByValue: true
    });
    if (r.result && r.result.value === true) break;
    await esperar(250);
  }
  await esperar(4000);

  const a = await cdp.enviar('Runtime.evaluate', { expression: MEDIR, returnByValue: true });
  console.log('=== ANTES DE ROLAR (4s após render) ===');
  console.log(JSON.stringify(a.result.value, null, 2));

  /* Rola a página inteira para simular o usuário descendo. */
  await cdp.enviar('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)', returnByValue: true });
  await esperar(2500);

  const b = await cdp.enviar('Runtime.evaluate', { expression: MEDIR, returnByValue: true });
  console.log('\n=== DEPOIS DE ROLAR ATÉ O FIM ===');
  console.log(JSON.stringify(b.result.value, null, 2));

  const c = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var cards = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'));
      return {
        total: cards.length,
        revelados: cards.filter(function(c){ return c.classList.contains('revealed'); }).length,
        opacityZero: cards.filter(function(c){ return getComputedStyle(c).opacity === '0'; }).length
      };
    })()`,
    returnByValue: true
  });
  console.log('\n=== RESUMO APÓS ROLAR ===');
  console.log(JSON.stringify(c.result.value, null, 2));

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());