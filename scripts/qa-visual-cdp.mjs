/**
 * Verificação visual + contagem dos cards antigos.
 * Salva um screenshot em logs/collection-validacao.png e reporta
 * quantos cards antigos existem dentro do bloco legado.
 *
 * Uso: node scripts/qa-visual-cdp.mjs [url]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const URL_ALVO = process.argv[2] || 'http://localhost:3010/collection.html';
const PORTA_CDP = 9444;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-vis-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORTA_CDP, '--user-data-dir=' + perfil, 'about:blank'
], { stdio: 'ignore' });

function encerrar() {
  try { chrome.kill(); } catch (_) {}
  try { rmSync(perfil, { recursive: true, force: true }); } catch (_) {}
}

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

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false
  });
  await cdp.enviar('Page.navigate', { url: URL_ALVO });

  const prazo = Date.now() + 25000;
  while (Date.now() < prazo) {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: `!!(window.GRACIOU_STORE && window.GRACIOU_CATALOGO && document.querySelectorAll('#products-grid .p-card[data-produto-id]').length === 8)`,
      returnByValue: true
    });
    if (r.result && r.result.value === true) break;
    await esperar(250);
  }
  await esperar(2500);

  const dados = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var legado = document.querySelector('.p-card-legado');
      return {
        'cardsAntigosDentroDoBlocoLegado': legado ? legado.querySelectorAll('.p-card').length : null,
        'blocosLegadoNoGrid': document.querySelectorAll('#products-grid .p-card-legado').length,
        'cardsAntigosForaDoBloco': Array.from(document.querySelectorAll('#products-grid > .p-card'))
          .filter(function(c){ return !c.dataset.produtoId; }).length,
        'cardsRenderizadosVisiveis': Array.from(document.querySelectorAll('#products-grid .p-card[data-produto-id]'))
          .filter(function(c){ return c.offsetParent !== null; }).length,
        'alturaDoGrid': document.getElementById('products-grid').getBoundingClientRect().height
      };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(dados.result.value, null, 2));

  /* Screenshot do topo da página (grid) para conferência visual. */
  const shot = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  mkdirSync('logs', { recursive: true });
  const destino = join(process.cwd(), 'logs', 'collection-validacao.png');
  writeFileSync(destino, Buffer.from(shot.data, 'base64'));
  console.log('screenshot:', destino);

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());