/**
 * GRACIOU — teste ponta a ponta: checkout.html -> API (/api/orders)
 * Arquivo: scripts/testar-checkout-api-cdp.mjs
 *
 * Uso:
 *   node scripts/servidor-estatico.js        (em outro terminal)
 *   cd backend && npm run dev                (em outro terminal)
 *   node scripts/testar-checkout-api-cdp.mjs
 *
 * O que este teste prova (coisas que a suíte de backend não alcança
 * porque ela fala direto com a API, sem navegador):
 *
 *   1. O checkout envia de verdade para POST /api/orders.
 *   2. A confirmação mostra o NÚMERO QUE O SERVIDOR gerou, e esse
 *      número existe no banco.
 *   3. Com a API DESLIGADA aparece exatamente
 *      "Não foi possível registrar o pedido. Tente novamente."
 *      e o pedido NÃO é removido do localStorage (nada de perder
 *      o pedido por causa de servidor fora do ar).
 *   4. Ao religar a API, o mesmo clique funciona e o local é limpo.
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE_FRONT = process.argv[2] || 'http://localhost:3100';
const BASE_API = process.argv[3] || 'http://localhost:3001';
const PORTA_CDP = 9777;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-e2e-'));

const MSG_FALHA = 'Não foi possível registrar o pedido. Tente novamente.';

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
    const pend = new Map();
    const ouvintes = [];
    ws.addEventListener('open', () => resolve({
      enviar(metodo, params) {
        const n = ++id;
        ws.send(JSON.stringify({ id: n, method: metodo, params: params || {} }));
        return new Promise((res, rej) => pend.set(n, { res, rej }));
      },
      ao(metodo, cb) { ouvintes.push({ metodo, cb }); },
      fechar() { try { ws.close(); } catch (_) {} }
    }));
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id); pend.delete(m.id);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
        return;
      }
      ouvintes.forEach((o) => { if (o.metodo === m.method) o.cb(m.params); });
    });
    ws.addEventListener('error', () => reject(new Error('WS erro')));
  });
}

let falhas = 0;
const linhas = [];
function conferir(rotulo, recebido, esperado) {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  const ok = a === b;
  if (!ok) falhas++;
  linhas.push((ok ? '  \u2713 ' : '  \u2717 ') + rotulo + ' = ' + a + (ok ? '' : '   (esperado ' + b + ')'));
}
function conferirTexto(rotulo, recebido, contem) {
  const texto = String(recebido === null || recebido === undefined ? '' : recebido);
  const ok = texto.includes(contem);
  if (!ok) falhas++;
  linhas.push((ok ? '  \u2713 ' : '  \u2717 ') + rotulo + ' = "' + texto + '"' +
    (ok ? '' : '   (esperado conter "' + contem + '")'));
}
function secao(t) { linhas.push(''); linhas.push(t); }

async function principal() {
  /* A API precisa estar no ar para o primeiro cenário. */
  let apiNoAr = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE_API + '/api/health'); if (r.ok) { apiNoAr = true; break; } } catch (_) {}
    await esperar(250);
  }
  if (!apiNoAr) {
    console.error('\nA API precisa estar no ar em ' + BASE_API + ' para este teste.');
    console.error('  cd backend && npm run dev\n');
    process.exitCode = 1;
    return;
  }

  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORTA_CDP + '/json/version'); if (r.ok) break; } catch (_) {}
    await esperar(250);
  }
  const alvo = await (await fetch('http://127.0.0.1:' + PORTA_CDP + '/json/new?about:blank', { method: 'PUT' })).json();
  const cdp = await conectar(alvo.webSocketDebuggerUrl);

  const errosConsole = [];
  cdp.ao('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    errosConsole.push('pageerror: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
  });
  cdp.ao('Log.entryAdded', (p) => {
    const e = p.entry || {};
    /* Falha de rede esperada no cenário da API desligada é registrada
       como erro pelo navegador; ela é o OBJETO do teste, não um bug. */
    if ((e.level === 'error' || e.level === 'warning') &&
        String(e.url || '').indexOf('favicon') === -1 &&
        !/Failed to load resource|ERR_CONNECTION_REFUSED|net::/i.test(e.text || '')) {
      errosConsole.push(e.level + ': ' + e.text);
    }
  });

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Log.enable');
  await cdp.enviar('Network.enable');
  await cdp.enviar('Network.setBlockedURLs', { urls: ['*/favicon.ico'] });
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const ir = async (url) => { await cdp.enviar('Page.navigate', { url }); await esperar(1800); };
  const avaliar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : undefined;
  };
  const preencher = async (id, valor) => avaliar(`(function(){
    var el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    el.focus(); el.value = ${JSON.stringify(valor)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  })()`);

  const preencherTudo = async () => {
    await preencher('ck-nome', 'Maria de Souza');
    await preencher('ck-email', 'maria@exemplo.com');
    await preencher('ck-telefone', '11987654321');
    await preencher('ck-cpf', '12345678901');
    await preencher('ck-cep', '01310100');
    await preencher('ck-estado', 'sp');
    await preencher('ck-cidade', 'São Paulo');
    await preencher('ck-bairro', 'Bela Vista');
    await preencher('ck-rua', 'Avenida Paulista');
    await preencher('ck-numero', '1000');
    await preencher('ck-complemento', 'Apto 42');
  };

  /* Espera a confirmação aparecer (ou desistir após o timeout). */
  const esperarConfirmacao = async (ms) => {
    const limite = ms || 15000;
    const passo = 250;
    for (let t = 0; t < limite; t += passo) {
      if (await avaliar(`!document.getElementById('ck-confirmacao').hidden`)) return true;
      await esperar(passo);
    }
    return false;
  };

  /* ══════════════════════════════════════════════
     1. Fluxo feliz: checkout -> API -> confirmação
     ══════════════════════════════════════════════ */
  secao('1) Checkout envia o pedido para a API e mostra o numero do servidor');
  await ir(BASE_FRONT + '/cart.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    window.GRACIOU_STORE.addToCart({ productId:'short-move', tamanho:'P' });
    window.GRACIOU_STORE.setCoupon('BEMVINDO10');
    return true;
  })()`);

  await ir(BASE_FRONT + '/checkout.html');
  await preencherTudo();

  const antesDoEnvio = await avaliar(`!!localStorage.getItem('graciou-pedido-v1')`);
  conferir('nenhum pedido local antes de enviar', antesDoEnvio, false);

  await avaliar(`document.getElementById('ck-continuar').click()`);
  const confirmou = await esperarConfirmacao(15000);
  conferir('confirmacao apareceu', confirmou, true);

  const numeroNaTela = await avaliar(`document.getElementById('ck-conf-id').textContent`);
  conferirTexto('numero na confirmacao comeca com GR-', numeroNaTela, 'GR-');
  conferir('recebimento informa que a API registrou',
    await avaliar(`document.getElementById('ck-conf-recebimento').textContent`), 'Registrado na API GRACIOU');
  conferir('mensagem da etapa mantida',
    await avaliar(`document.querySelector('.ck-confirmacao__texto').textContent`),
    'Dados salvos. O pagamento será conectado na próxima etapa.');

  /* O número mostrado tem de existir no banco, via GET /api/orders/:id */
  const consulta = await fetch(BASE_API + '/api/orders/' + encodeURIComponent(numeroNaTela));
  const lido = await consulta.json();
  conferir('GET do numero mostrado na tela', consulta.status, 200);
  conferir('mesmo numero no banco', lido.pedido.id, numeroNaTela);
  conferir('pedido gravado com 2 linhas', lido.pedido.itens.length, 2);
  conferir('subtotal recalculado no servidor', lido.pedido.subtotal, 17980);
  conferir('cupom BEMVINDO10 gravado', lido.pedido.cupom && lido.pedido.cupom.codigo, 'BEMVINDO10');
  conferir('desconto do cupom', lido.pedido.desconto, 1798);
  conferir('frete gratis (2 pecas)', lido.pedido.frete, 0);
  conferir('total', lido.pedido.total, 16182);
  conferir('status de pagamento', lido.pedido.pagamento.status, 'aguardando');
  conferir('status do pedido', lido.pedido.statusPedido, 'aguardando_pagamento');
  conferir('acentos preservados no banco', lido.pedido.endereco.cidade, 'São Paulo');

  /* O pedido local foi limpo APÓS a confirmação da API */
  conferir('pedido local removido apos sucesso',
    await avaliar(`localStorage.getItem('graciou-pedido-v1')`), null);
  conferir('rascunho do formulario permanece',
    await avaliar(`!!localStorage.getItem('graciou-checkout-rascunho-v1')`), true);

  /* ══════════════════════════════════════════════
     2. API desligada: mensagem clara e pedido preservado
     ══════════════════════════════════════════════ */
  secao('2) API desligada: mensagem clara e pedido NAO e perdido');

  /* Aponta o checkout para uma porta sem servidor. Isso reproduz
     exatamente o efeito de "a API está desligada" (recusa de conexão),
     sem precisar derrubar a API que os outros testes usam. */
  await ir(BASE_FRONT + '/checkout.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    return true;
  })()`);
  await ir(BASE_FRONT + '/checkout.html');
  await preencherTudo();

  /* Intercepta o fetch para redirecionar só /api/orders -> porta morta. */
  await avaliar(`(function(){
    var original = window.fetch;
    window.__fetchOriginal = original;
    window.fetch = function(url, opcoes){
      if (String(url).indexOf('/api/orders') !== -1) {
        return original.call(window, 'http://127.0.0.1:3999/api/orders', opcoes);
      }
      return original.apply(window, arguments);
    };
    return true;
  })()`);

  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(3500);

  conferir('confirmacao NAO apareceu', await avaliar(`document.getElementById('ck-confirmacao').hidden`), true);
  conferir('formulario continua visivel',
    await avaliar(`!document.getElementById('ck-resumo').hidden`), true);
  conferirTexto('mensagem de erro exata na tela',
    await avaliar(`document.getElementById('ck-alerta').textContent`), MSG_FALHA);
  conferir('alerta de erro visivel',
    await avaliar(`!document.getElementById('ck-alerta').hidden`), true);

  /* O ponto central do requisito 19: o pedido NÃO pode ser perdido. */
  const pedidoPreservado = await avaliar(`localStorage.getItem('graciou-pedido-v1')`);
  conferir('pedido temporario PRESERVADO no localStorage',
    pedidoPreservado !== null && pedidoPreservado !== undefined, true);
  conferirTexto('pedido preservado tem os itens', pedidoPreservado, 'tee-raizes');

  /* E os dados digitados continuam lá */
  conferir('nome ainda preenchido', await avaliar(`document.getElementById('ck-nome').value`), 'Maria de Souza');
  conferir('email ainda preenchido', await avaliar(`document.getElementById('ck-email').value`), 'maria@exemplo.com');
  conferir('botao voltou ao normal',
    await avaliar(`document.getElementById('ck-continuar').textContent.trim()`), 'CONTINUAR PARA PAGAMENTO');
  conferir('botao nao ficou travado',
    await avaliar(`document.getElementById('ck-continuar').disabled`), false);

  /* ══════════════════════════════════════════════
     3. Religou a API: o reenvio funciona
     ══════════════════════════════════════════════ */
  secao('3) Com a API de volta, o mesmo pedido registra');
  await avaliar(`(function(){
    window.fetch = window.__fetchOriginal;
    return true;
  })()`);

  await avaliar(`document.getElementById('ck-continuar').click()`);
  const confirmou2 = await esperarConfirmacao(15000);
  conferir('confirmacao apareceu no reenvio', confirmou2, true);

  const numero2 = await avaliar(`document.getElementById('ck-conf-id').textContent`);
  conferirTexto('numero do servidor no reenvio', numero2, 'GR-');
  const consulta2 = await fetch(BASE_API + '/api/orders/' + encodeURIComponent(numero2));
  conferir('pedido do reenvio existe no banco', consulta2.status, 200);
  conferir('pedido local limpo apos o reenvio dar certo',
    await avaliar(`localStorage.getItem('graciou-pedido-v1')`), null);

  /* ══════════════════════════════════════════════
     4. Console limpo
     ══════════════════════════════════════════════ */
  secao('4) Console do navegador');
  conferir('zero erros inesperados no console', errosConsole, []);

  /* ══════════════════════════════════════════════
     5. Screenshot
     ══════════════════════════════════════════════ */
  const shot = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  mkdirSync('logs', { recursive: true });
  writeFileSync(join(process.cwd(), 'logs', 'checkout-api.png'), Buffer.from(shot.data, 'base64'));

  console.log('\nGRACIOU — checkout -> API (ponta a ponta, navegador real)');
  console.log('=======================================================');
  console.log('front: ' + BASE_FRONT + '   api: ' + BASE_API);
  linhas.forEach((l) => console.log(l));
  console.log('\nscreenshot: logs/checkout-api.png');
  console.log(falhas === 0
    ? '\nRESULTADO: OK — o fluxo checkout -> API está íntegro.\n'
    : '\nRESULTADO: FALHOU com ' + falhas + ' divergência(s).\n');

  cdp.fechar();
  if (falhas > 0) process.exitCode = 1;
}

principal()
  .catch((e) => { console.error('FALHA NA VALIDACAO:', e && e.message); process.exitCode = 1; })
  .finally(encerrar);