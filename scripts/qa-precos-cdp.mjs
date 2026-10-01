/**
 * Verificação no navegador real de que os preços oficiais chegaram à tela
 * e de que o grid/design continuam intactos. Salva screenshot.
 *
 * Uso: node scripts/qa-precos-cdp.mjs [url]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const URL_ALVO = process.argv[2] || 'http://localhost:3010/collection.html';
const PORTA_CDP = 9555;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-preco-'));

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
    const ouvintes = [];
    ws.addEventListener('open', () => resolve({
      enviar(metodo, params) {
        const meuId = ++id;
        ws.send(JSON.stringify({ id: meuId, method: metodo, params: params || {} }));
        return new Promise((res, rej) => pendentes.set(meuId, { res, rej }));
      },
      ao(metodo, cb) { ouvintes.push({ metodo, cb }); },
      fechar() { try { ws.close(); } catch (_) {} }
    }));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) {
        const { res, rej } = pendentes.get(msg.id);
        pendentes.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
        return;
      }
      ouvintes.forEach((o) => { if (o.metodo === msg.method) o.cb(msg.params); });
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

  const erros = [];
  cdp.ao('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    erros.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
  });
  cdp.ao('Log.entryAdded', (p) => {
    const e = p.entry || {};
    if (e.level === 'error' || e.level === 'warning') erros.push(e.level + ': ' + e.text);
  });

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Log.enable');
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.enviar('Page.navigate', { url: URL_ALVO });

  const prazo = Date.now() + 25000;
  while (Date.now() < prazo) {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: `!!(window.GRACIOU_STORE && document.querySelectorAll('#products-grid .p-card[data-produto-id]').length === 8)`,
      returnByValue: true
    });
    if (r.result && r.result.value === true) break;
    await esperar(250);
  }
  await esperar(2500);

  const r = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var grid = document.getElementById('products-grid');
      var cards = Array.from(grid.querySelectorAll('.p-card[data-produto-id]'));
      var C = window.GRACIOU_CATALOGO;
      return {
        'catalogo.precosConfirmados': C.META.precosConfirmados,
        'catalogo.freteGratisAtivo': C.META.freteGratisAtivo,
        'catalogo.freteGratisQuantidadeMinima': C.META.freteGratisQuantidadeMinima,
        'catalogo.valorFrete': C.META.valorFrete,
        'produtos': C.lista().length,
        'precoNaTela_porCard': cards.map(function(c){
          var el = c.querySelector('.p-card__price');
          return el ? el.textContent.trim() : '(sem preco)';
        }),
        'cardsComPREcoEMBREVE': cards.filter(function(c){
          return c.querySelector('.p-card__price--pendente') !== null;
        }).length,
        'cardsVisiveis': cards.filter(function(c){ return c.offsetParent !== null; }).length,
        'cardsAntigosVisiveis': Array.from(grid.querySelectorAll('.p-card-legado .p-card'))
          .filter(function(c){ return c.offsetParent !== null; }).length,
        'regrasCssDeCor': ['creme','off-white','preto','verde-musgo','verde-militar','marrom'].filter(function(k){
          return Array.from(document.styleSheets).some(function(sh){
            try { return Array.from(sh.cssRules).some(function(r){ return r.selectorText && r.selectorText.indexOf('.p-card__img--' + k) !== -1; }); }
            catch(e){ return false; }
          });
        }).length,
        'alturaDoGrid': Math.round(grid.getBoundingClientRect().height),
        'tipoDeCard1': cards[0] ? cards[0].className : null,
        'testePedido_2pecas': (function(){
          var p = C.calcularPedido([{ id: 'tee-raizes', quantidade: 1 }, { id: 'short-move', quantidade: 1 }], 'pix');
          return { pecas: p.pecas, subtotal: p.subtotalFormatado, freteGratis: p.freteGratis, total: p.totalFormatado };
        })(),
        'testePedido_1camisetaCartao': (function(){
          var p = C.calcularPedido([{ id: 'tee-raizes', quantidade: 1 }], 'cartao');
          return { subtotal: p.subtotalFormatado, freteGratis: p.freteGratis, total: p.totalFormatado, pendente: p.totalPendente };
        })()
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(r.result.value, null, 2));
  console.log('\nerros/warnings de console:', JSON.stringify(erros, null, 2));

  const shot = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  mkdirSync('logs', { recursive: true });
  const destino = join(process.cwd(), 'logs', 'collection-precos.png');
  writeFileSync(destino, Buffer.from(shot.data, 'base64'));
  console.log('screenshot:', destino);

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());