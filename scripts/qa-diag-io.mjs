/**
 * Diagnóstico da causa raiz: o IntersectionObserver de reveal funciona?
 * Compara um observador CRIADO AGORA com o observador da página.
 *
 * Uso: node scripts/qa-diag-io.mjs [url]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const URL_ALVO = process.argv[2] || 'http://localhost:3010/collection.html';
const PORTA_CDP = 9777;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-io-'));

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
  await esperar(3000);

  /* 1. Um observador criado AGORA reage a um elemento já na tela? */
  const testeNovo = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      return new Promise(function(resolve){
        var alvo = document.querySelector('#products-grid .p-card[data-produto-id]');
        var respondeu = false;
        var obs = new IntersectionObserver(function(entradas){
          respondeu = true;
          obs.disconnect();
          resolve({ observadorNovoDispara: true, isIntersecting: entradas[0].isIntersecting });
        }, { threshold: 0.08 });
        obs.observe(alvo);
        setTimeout(function(){ if(!respondeu) resolve({ observadorNovoDispara: false }); }, 2000);
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('1) Observador criado agora na página:', JSON.stringify(testeNovo.result.value));

  /* 2. O que a página declara sobre o próprio observador */
  const estadoPagina = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var cards = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'));
      return {
        temAtivarReveal: typeof window.__GRACIOU_ATIVAR_REVEAL__,
        temRevObs: typeof window.revObs,
        temHeaderVar: typeof window.header,
        adicionarCartType: typeof window.addToCart,
        toggleWishType: typeof window.toggleWish,
        marcadorRender: window.__GRACIOU_GRID_RENDERIZADO__,
        aguardando: window.__GRACIOU_GRID_AGUARDANDO__,
        cards: cards.length,
        revelados: cards.filter(function(c){ return c.classList.contains('revealed'); }).length
      };
    })()`,
    returnByValue: true
  });
  console.log('2) Estado declarado pela página:', JSON.stringify(estadoPagina.result.value, null, 2));

  /* 3. Depois de rolar, quantos revelam por conta própria? */
  await cdp.enviar('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)', returnByValue: true });
  await esperar(2500);
  const depois = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var cards = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'));
      return {
        revelados: cards.filter(function(c){ return c.classList.contains('revealed'); }).length,
        opacityZero: cards.filter(function(c){ return getComputedStyle(c).opacity === '0'; }).length
      };
    })()`,
    returnByValue: true
  });
  console.log('3) Após rolar:', JSON.stringify(depois.result.value));

  /* 4. A rede de segurança é alcançável pelo console? */
  const rede = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var antes = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'))
        .filter(function(c){ return c.classList.contains('revealed'); }).length;
      if (typeof window.__GRACIOU_ATIVAR_REVEAL__ === 'function') window.__GRACIOU_ATIVAR_REVEAL__();
      return { reveladosAntes: antes, chamouAtivarReveal: typeof window.__GRACIOU_ATIVAR_REVEAL__ === 'function' };
    })()`,
    returnByValue: true
  });
  console.log('4) Chamada manual de __GRACIOU_ATIVAR_REVEAL__:', JSON.stringify(rede.result.value));

  await esperar(2000);
  const depois2 = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var cards = Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'));
      return {
        revelados: cards.filter(function(c){ return c.classList.contains('revealed'); }).length,
        opacityZero: cards.filter(function(c){ return getComputedStyle(c).opacity === '0'; }).length
      };
    })()`,
    returnByValue: true
  });
  console.log('5) Depois da chamada manual:', JSON.stringify(depois2.result.value));

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());