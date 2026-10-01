/**
 * Por que garantirReveal() não reaplica o observador?
 * Mede exatamente as condições da função, no instante em que ela roda.
 *
 * Uso: node scripts/qa-diag-rede.mjs [url]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const URL_ALVO = process.argv[2] || 'http://localhost:3010/collection.html';
const PORTA_CDP = 9888;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-rede-'));

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

  /* Instrumenta ANTES da página rodar: registra cada quadro do ciclo de
     vida em que o estado do reveal foi medido. Nada é alterado na página;
     é só leitura por polling rápido. */
  await cdp.enviar('Page.navigate', { url: URL_ALVO });

  const amostras = [];
  const inicio = Date.now();
  while (Date.now() - inicio < 12000) {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: `(function(){
        var todos = document.querySelectorAll('#products-grid .p-card[data-produto-id]');
        var rev = document.querySelectorAll('#products-grid .p-card[data-produto-id].revealed').length;
        var grid = document.getElementById('products-grid');
        return {
          t: Math.round(performance.now()),
          readyState: document.readyState,
          cards: todos.length,
          revelados: rev,
          reaplicado: grid ? grid.getAttribute('data-reveal-reaplicado') : null,
          temFn: typeof window.__GRACIOU_ATIVAR_REVEAL__,
          renderizou: window.__GRACIOU_GRID_RENDERIZADO__ || null
        };
      })()`,
      returnByValue: true
    }).catch(() => null);
    if (r && r.result && r.result.value) amostras.push(r.result.value);
    await esperar(100);
  }

  /* Mostra apenas as transições relevantes. */
  console.log('=== linha do tempo (mudanças de estado) ===');
  let anterior = '';
  amostras.forEach((a) => {
    const chave = [a.cards, a.revelados, a.reaplicado, a.temFn, a.readyState].join('|');
    if (chave !== anterior) {
      console.log(`t=${String(a.t).padStart(6)}ms readyState=${a.readyState.padEnd(10)} cards=${a.cards} revelados=${a.revelados} reaplicado=${a.reaplicado} temFn=${a.temFn} renderizou=${a.renderizou}`);
      anterior = chave;
    }
  });

  console.log('\n=== estado final ===');
  const fim = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var cards = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'));
      var grid = document.getElementById('products-grid');
      return {
        cards: cards.length,
        revelados: cards.filter(function(c){ return c.classList.contains('revealed'); }).length,
        opacityZero: cards.filter(function(c){ return getComputedStyle(c).opacity === '0'; }).length,
        reaplicado: grid ? grid.getAttribute('data-reveal-reaplicado') : null
      };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(fim.result.value, null, 2));

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());