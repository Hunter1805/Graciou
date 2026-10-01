/**
 * O scroll da collection.html está funcionando?
 * Mede scrollY antes/depois de scrollTo e mostra quem engole o clique.
 *
 * Uso: node scripts/qa-diag-scroll.mjs [base]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:3010';
const PORTA_CDP = 9444;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-scroll-'));

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
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.enviar('Page.navigate', { url: BASE + '/collection.html' });
  await esperar(3000);

  const avaliar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return { ERRO: (r.exceptionDetails.exception || {}).description };
    return r.result ? r.result.value : undefined;
  };

  console.log('A) Estado inicial e possibilidade de rolar');
  console.log(JSON.stringify(await avaliar(`(function(){
    var doc = document.scrollingElement || document.documentElement;
    return {
      scrollY: window.scrollY,
      bodyScrollHeight: document.body.scrollHeight,
      docScrollHeight: doc.scrollHeight,
      docClientHeight: doc.clientHeight,
      podeRolar: doc.scrollHeight > doc.clientHeight,
      overflowBody: getComputedStyle(document.body).overflow,
      overflowXml: getComputedStyle(doc).overflow,
      alturaTotal: Math.round(document.body.getBoundingClientRect().height),
      cardsOpacity: Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]')).map(function(c){
        return c.dataset.produtoId + ':' + getComputedStyle(c).opacity + ':' + Math.round(c.getBoundingClientRect().top);
      })
    };
  })()`), null, 2));

  console.log('\nB) scrollTo(0, 3000) funciona?');
  console.log(JSON.stringify(await avaliar(`(function(){
    var antes = window.scrollY;
    window.scrollTo(0, 3000);
    var depois = window.scrollY;
    return { antes: antes, depois: depois, mudou: antes !== depois };
  })()`), null, 2));

  await esperar(800);
  console.log('\nC) após 800ms');
  console.log(JSON.stringify(await avaliar(`(function(){
    var doc = document.scrollingElement || document.documentElement;
    return { scrollY: window.scrollY, htmlScrollTop: doc.scrollTop, bodyScrollTop: document.body.scrollTop };
  })()`), null, 2));

  console.log('\nD) Quem está no centro da viewport? (se houver overlay, ele engole o clique)');
  console.log(JSON.stringify(await avaliar(`(function(){
    var el = document.elementFromPoint(720, 500);
    return {
      tag: el ? el.tagName : null,
      classe: el ? String(el.className || '') : null,
      id: el ? el.id : null,
      paiClasse: el && el.parentElement ? String(el.parentElement.className || '') : null
    };
  })()`), null, 2));

  console.log('\nE) Posição real dos elementos-chave');
  console.log(JSON.stringify(await avaliar(`(function(){
    var g = document.getElementById('products-grid');
    var lista = ['site-header','products-grid','collection-main'];
    var out = {};
    lista.forEach(function(id){
      var el = document.getElementById(id);
      if (el) { var r = el.getBoundingClientRect(); out[id] = { top: Math.round(r.top), height: Math.round(r.height) }; }
    });
    var b = document.querySelector('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
    if (b) { var rb = b.getBoundingClientRect(); out.botao = { top: Math.round(rb.top), height: Math.round(rb.height) }; }
    out.gridTemPai = g ? g.parentElement.id : null;
    return out;
  })()`), null, 2));

  const shot = await cdp.enviar('Page.captureScreenshot', { format: 'png' });
  mkdirSync('logs', { recursive: true });
  writeFileSync(join(process.cwd(), 'logs', 'diag-scroll-visivel.png'), Buffer.from(shot.data, 'base64'));
  console.log('\nscreenshot da viewport: logs/diag-scroll-visivel.png');

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());