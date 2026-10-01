/**
 * Por que o clique físico (Input.dispatchMouseEvent) não abre o painel?
 * Compara a posição calculada com elementFromPoint naquele ponto.
 *
 * Uso: node scripts/qa-diag-clique.mjs [base]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:3010';
const PORTA_CDP = 9333;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-clique-'));

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
  await esperar(2500);

  const avaliar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return { ERRO: (r.exceptionDetails.exception || {}).description };
    return r.result ? r.result.value : undefined;
  };

  const info = await avaliar(`(function(){
    var b = document.querySelector('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
    if (!b) return 'sem botao';
    b.scrollIntoView({ block:'center' });
    var r = b.getBoundingClientRect();
    var cx = Math.round(r.left + r.width/2);
    var cy = Math.round(r.top + r.height/2);
    var noPonto = document.elementFromPoint(cx, cy);
    var cs = getComputedStyle(b);
    return {
      rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      centro: { x: cx, y: cy },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      noPontoEhO_Botao: noPonto === b,
      noPontoTag: noPonto ? noPonto.tagName + '.' + noPonto.className : null,
      pointerEvents: cs.pointerEvents,
      visibility: cs.visibility,
      opacity: cs.opacity,
      display: cs.display,
      cardOpacityPai: getComputedStyle(b.closest('.p-card')).opacity
    };
  })()`);
  console.log('estado do botão:', JSON.stringify(info, null, 2));

  const cx = info.centro.x;
  const cy = info.centro.y;

  /* Tenta o clique físico informando também o "botão" e o foco. */
  await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'none' });
  await cdp.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1 });
  await esperar(800);

  console.log('\napós clique físico — painel aberto?', await avaliar(`!!document.querySelector('.tamanho-painel')`));
  console.log('carrinho:', JSON.stringify(await avaliar(`window.GRACIOU_STORE.getCart().length`)));

  /* Marca se o mousedown foi recebido no elemento. */
  const recebeu = await avaliar(`(function(){
    return new Promise(function(resolve){
      var b = document.querySelector('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
      var flags = { mousedown: false, mouseup: false, click: false };
      b.addEventListener('mousedown', function(){ flags.mousedown = true; }, { once: true });
      b.addEventListener('mouseup', function(){ flags.mouseup = true; }, { once: true });
      b.addEventListener('click', function(){ flags.click = true; }, { once: true });
      setTimeout(function(){ resolve(flags); }, 300);
    });
  })()`);
  console.log('listeners registrados como sonda (sem clique):', JSON.stringify(recebeu));

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());