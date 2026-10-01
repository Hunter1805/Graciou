/**
 * O clique no botão "+ ADICIONAR AO CARRINHO" chega ao handler?
 * Chama a função direto e observa o resultado.
 *
 * Uso: node scripts/qa-diag-carrinho.mjs [base]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:3010';
const PORTA_CDP = 9222;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-diagcart-'));

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
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  const avaliar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { ERRO: (r.exceptionDetails.exception || {}).description };
    return r.result ? r.result.value : undefined;
  };

  await cdp.enviar('Page.navigate', { url: BASE + '/collection.html' });
  await esperar(2500);

  console.log('1) O botão existe e tem o atributo certo?');
  console.log(JSON.stringify(await avaliar(`(function(){
    var b = document.querySelector('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
    return {
      existe: !!b,
      texto: b ? b.textContent : null,
      acao: b ? b.getAttribute('data-acao') : null,
      cardTemId: !!(b && b.closest('.p-card[data-produto-id]'))
    };
  })()`), null, 2));

  console.log('\n2) Clique disparado por código (btn.click()) abre o painel?');
  console.log(JSON.stringify(await avaliar(`(function(){
    var b = document.querySelector('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
    if (!b) return 'sem botao';
    b.click();
    var p = document.querySelector('.tamanho-painel');
    var info = {
      painelCriado: !!p,
      chips: p ? p.querySelectorAll('[data-tamanho]').length : 0,
      cartAntes: window.GRACIOU_STORE ? window.GRACIOU_STORE.getCart().length : null
    };
    return info;
  })()`), null, 2));

  console.log('\n3) Se houver painel, escolher M e conferir o carrinho');
  console.log(JSON.stringify(await avaliar(`(function(){
    var chip = document.querySelector('.tamanho-painel [data-tamanho="M"]');
    if (!chip) return 'sem painel/chip';
    chip.click();
    var S = window.GRACIOU_STORE;
    return {
      cart: S ? S.getCart() : null,
      painelAinda: !!document.querySelector('.tamanho-painel')
    };
  })()`), null, 2));

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());