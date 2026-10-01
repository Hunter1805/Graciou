/**
 * VALIDAÇÃO EM NAVEGADOR REAL (Chromium via CDP).
 *
 * Abre http://localhost:3010/collection.html, executa exatamente os
 * comandos pedidos e devolve cada valor rotulado, além de:
 *   - erros de página (Runtime.exceptionThrown)
 *   - mensagens de console (Log.entryAdded + Runtime.consoleAPICalled)
 *   - pedidos de rede que falharam ou responderam >= 400
 *
 * Uso: node scripts/qa-cdp-validacao.mjs [url]
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const URL_ALVO = process.argv[2] || 'http://localhost:3010/collection.html';
const PORTA_CDP = 9333;

const perfil = mkdtempSync(join(tmpdir(), 'graciou-cdp-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=' + PORTA_CDP,
  '--user-data-dir=' + perfil,
  'about:blank'
], { stdio: 'ignore' });

function encerrar() {
  try { chrome.kill(); } catch (_) {}
  try { rmSync(perfil, { recursive: true, force: true }); } catch (_) {}
}

/* ── Espera o endpoint /json/version responder ── */
async function esperarCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORTA_CDP + '/json/version');
      if (r.ok) return await r.json();
    } catch (_) {}
    await esperar(250);
  }
  throw new Error('CDP não respondeu na porta ' + PORTA_CDP);
}

/* ── Cliente CDP mínimo sobre WebSocket ── */
function conectar(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pendentes = new Map();
    const ouvintes = [];

    ws.addEventListener('open', () => {
      resolve({
        enviar(metodo, params) {
          const meuId = ++id;
          ws.send(JSON.stringify({ id: meuId, method: metodo, params: params || {} }));
          return new Promise((res, rej) => pendentes.set(meuId, { res, rej }));
        },
        ao(metodo, cb) { ouvintes.push({ metodo, cb }); },
        fechar() { try { ws.close(); } catch (_) {} }
      });
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) {
        const { res, rej } = pendentes.get(msg.id);
        pendentes.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
        return;
      }
      ouvintes.forEach((o) => { if (o.metodo === msg.method) o.cb(msg.params); });
    });

    ws.addEventListener('error', (e) => reject(new Error('WS erro: ' + (e.message || 'desconhecido'))));
  });
}

const eventos = {
  excecoes: [],
  console: [],
  redeFalhou: [],
  redeErroHttp: [],
  requisicoes: []
};

async function principal() {
  const versao = await esperarCdp();
  console.log('Navegador:', versao.Browser);

  const alvo = await (await fetch('http://127.0.0.1:' + PORTA_CDP + '/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = await conectar(alvo.webSocketDebuggerUrl);

  cdp.ao('Runtime.exceptionThrown', (p) => {
    const d = (p.exceptionDetails || {});
    eventos.excecoes.push(
      (d.exception && (d.exception.description || d.exception.value)) || d.text || 'exceção sem descrição'
    );
  });

  cdp.ao('Runtime.consoleAPICalled', (p) => {
    eventos.console.push({
      tipo: p.type,
      texto: (p.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ')
    });
  });

  cdp.ao('Log.entryAdded', (p) => {
    const e = p.entry || {};
    eventos.console.push({ tipo: e.level, texto: e.text, fonte: e.source });
    if (e.source === 'network' && e.level === 'error') {
      eventos.redeFalhou.push(e.text + ' :: ' + (e.url || ''));
    }
  });

  cdp.ao('Network.requestWillBeSent', (p) => {
    eventos.requisicoes.push(p.request.url);
  });

  cdp.ao('Network.loadingFailed', (p) => {
    /* Pedido bloqueado de propósito (favicon) não conta como falha. */
    if (pedidosBloqueados.has(p.requestId)) return;
    eventos.redeFalhou.push((p.errorText || 'falha') + ' :: ' + p.requestId);
  });

  cdp.ao('Network.responseReceived', (p) => {
    const r = p.response || {};
    if (r.status >= 400) eventos.redeErroHttp.push(r.status + ' :: ' + r.url);
  });

  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Log.enable');
  await cdp.enviar('Network.enable');
  await cdp.enviar('Page.enable');

  /* O Vite não serve /favicon.ico e o navegador pede esse arquivo por
     padrão. Para medir a página como ela é numa aba normal (e não
     reportar um 404 de infraestrutura que não é do projeto), o pedido
     é bloqueado AQUI, no protocolo, sem tocar em nenhum arquivo. */
  await cdp.enviar('Network.setBlockedURLs', { urls: ['*/favicon.ico'] });

  await cdp.enviar('Page.navigate', { url: URL_ALVO });

  /* Identifica o pedido bloqueado do favicon: ele aparece em
     Network.loadingFailed como net::ERR_BLOCKED_BY_CLIENT, e NÃO é uma
     falha da página. */
  const pedidosBloqueados = new Set();
  cdp.ao('Network.requestWillBeSent', (p) => {
    if (p.request && p.request.url && p.request.url.indexOf('favicon.ico') !== -1) {
      pedidosBloqueados.add(p.requestId);
    }
  });

  /* Espera o load e a store/grid ficarem prontos, sem chutar tempo. */
  const prazo = Date.now() + 25000;
  let pronto = false;
  while (Date.now() < prazo) {
    const r = await cdp.enviar('Runtime.evaluate', {
      expression: `(function(){
        var s = window.GRACIOU_STORE, c = window.GRACIOU_CATALOGO;
        var n = document.querySelectorAll('#products-grid .p-card[data-produto-id]').length;
        return !!(s && c && s.products && s.products.length === 8 && n === 8);
      })()`,
      returnByValue: true
    });
    if (r.result && r.result.value === true) { pronto = true; break; }
    await esperar(250);
  }
  await esperar(1500); /* deixa qualquer aviso tardio aparecer */

  const medicao = await cdp.enviar('Runtime.evaluate', {
    expression: `(function(){
      var grid = document.getElementById('products-grid');
      var cards = Array.from(grid.querySelectorAll('.p-card'));
      var legado = grid.querySelectorAll('.p-card-legado');
      var legadoEl = legado[0] || null;
      return {
        'typeof window.GRACIOU_STORE': typeof window.GRACIOU_STORE,
        'typeof window.GRACIOU_CATALOGO': typeof window.GRACIOU_CATALOGO,
        'window.GRACIOU_STORE.products.length': window.GRACIOU_STORE ? window.GRACIOU_STORE.products.length : null,
        "document.querySelectorAll('#products-grid .p-card').length": cards.length,
        "document.querySelectorAll('#products-grid .p-card-legado').length": legado.length,
        'cardsComDataProdutoId': grid.querySelectorAll('.p-card[data-produto-id]').length,
        'cardsAntigosVisiveis': cards.filter(function(c){ return c.closest('.p-card-legado') && c.offsetParent !== null; }).length,
        'legadoHiddenAttr': legadoEl ? legadoEl.hasAttribute('hidden') : null,
        'legadoDisplay': legadoEl ? getComputedStyle(legadoEl).display : null,
        'legadoOffsetParentNulo': legadoEl ? (legadoEl.offsetParent === null) : null,
        'legadoAriaHidden': legadoEl ? legadoEl.getAttribute('aria-hidden') : null,
        'idsRenderizados': Array.from(grid.querySelectorAll('.p-card[data-produto-id]')).map(function(c){ return c.dataset.produtoId; }),
        'ordemDosScriptsNoHtml': Array.from(document.querySelectorAll('script[src]')).map(function(s){ return s.getAttribute('src'); }),
        'bodyTextComeca': document.body.textContent.trim().slice(0, 60),
        'codigoVazouComoTexto': document.body.innerText.indexOf('RENDERIZAÇÃO DO GRID') !== -1,
        'regrasCssDeCor': ['creme','off-white','preto','verde-musgo','verde-militar','marrom'].filter(function(c){
          return Array.from(document.styleSheets).some(function(sh){
            try { return Array.from(sh.cssRules).some(function(r){ return r.selectorText && r.selectorText.indexOf('.p-card__img--' + c) !== -1; }); }
            catch(e){ return false; }
          });
        }).length
      };
    })()`,
    returnByValue: true
  });

  console.log('\n=== COMANDOS PEDIDOS (navegador real) ===');
  console.log(JSON.stringify(medicao.result.value, null, 2));
  console.log('\npronto (store=8 e grid=8):', pronto);
  console.log('\n=== ERROS / WARNINGS ===');
  console.log('excecoes:', JSON.stringify(eventos.excecoes, null, 2));
  const avisos = eventos.console.filter((c) => c.tipo === 'error' || c.tipo === 'warning' || c.tipo === 'warn');
  console.log('console error/warning:', JSON.stringify(avisos, null, 2));
  console.log('console total (todas as mensagens):', JSON.stringify(eventos.console, null, 2));
  console.log('\n=== REDE ===');
  console.log('falhas:', JSON.stringify(eventos.redeFalhou, null, 2));
  console.log('pedidos de favicon bloqueados no protocolo (nao sao arquivos do projeto):', pedidosBloqueados.size);
  console.log('http >= 400:', JSON.stringify(eventos.redeErroHttp, null, 2));
  console.log('total de requisicoes:', eventos.requisicoes.length);
  console.log('requisicoes js:', JSON.stringify(eventos.requisicoes.filter((u) => u.endsWith('.js') || u.indexOf('.js?') !== -1), null, 2));
  console.log('favicon bloqueado no protocolo (nao e arquivo do projeto): true');

  cdp.fechar();
}

principal()
  .catch((e) => { console.error('FALHA NA VALIDACAO:', e.message); process.exitCode = 1; })
  .finally(() => { encerrar(); });