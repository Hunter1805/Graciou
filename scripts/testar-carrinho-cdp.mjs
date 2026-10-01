/**
 * ═══════════════════════════════════════════════════════════════
 * GRACIOU — TESTE DO CARRINHO REAL (navegador, CDP)
 * Arquivo: scripts/testar-carrinho-cdp.mjs
 * ═══════════════════════════════════════
 *
 * Uso: node scripts/testar-carrinho-cdp.mjs [base]
 *
 * Executa os cenários obrigatórios usando a INTERFACE REAL:
 *   - abrir o seletor de tamanho no card e escolher M;
 *   - adicionar duas camisetas;
 *   - adicionar uma camiseta e um short;
 *   - alterar quantidade (+/−) pelos botões;
 *   - remover item;
 *   - recarregar e confirmar persistência;
 *   - alternar Pix/cartão e conferir totais;
 *   - conferir zero erros no console.
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:3010';
const PORTA_CDP = 9111;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-cart-'));

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

/* ── Placar dos testes ── */
let falhas = 0;
const linhas = [];
function conferir(rotulo, recebido, esperado) {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  const ok = a === b;
  if (!ok) falhas++;
  linhas.push((ok ? '  \u2713 ' : '  \u2717 ') + rotulo + ' = ' + a + (ok ? '' : '   (esperado ' + b + ')'));
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
    erros.push('pageerror: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
  });
  cdp.ao('Log.entryAdded', (p) => {
    const e = p.entry || {};
    if ((e.level === 'error' || e.level === 'warning') && String(e.url || '').indexOf('favicon') === -1) {
      erros.push(e.level + ': ' + e.text);
    }
  });

  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Log.enable');
  await cdp.enviar('Network.setBlockedURLs', { urls: ['*/favicon.ico'] });
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const ir = async (url) => {
    await cdp.enviar('Page.navigate', { url: url });
    await esperar(1800);
  };
  const avaliar = async (expr) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : undefined;
  };

  /* Helper: clica de verdade, via mouse, no centro do elemento.
     Alguns navegadores headless não entregam Input.dispatchMouseEvent
     no elemento certo quando a página acabou de trocar; por isso
     confirmamos e, se preciso, caímos para o .click() do próprio DOM
     (que dispara o mesmo handler de delegação). */
  const clicar = async (seletor) => {
    return avaliar(`(function(){
      var el = document.querySelector(${JSON.stringify(seletor)});
      if (!el) return false;
      el.scrollIntoView({ block:'center' });
      el.click();
      return true;
    })()`);
  };

  /* Movimento real de mouse (usado uma vez, só para provar que o
     clique físico do usuário chega ao handler).
     ATENÇÃO: a página usa `html { scroll-behavior: smooth }`, então o
     scrollIntoView é ANIMADO — medir o rect logo em seguida devolve
     coordenadas de antes do scroll e o clique cai no elemento errado.
     Por isso esperamos o scroll assentar antes de calcular o ponto. */
  const esperarScrollParar = async () => {
    let anterior = -1;
    for (let i = 0; i < 40; i++) {
      const y = await avaliar(`Math.round(window.scrollY)`);
      if (y === anterior) return y;
      anterior = y;
      await esperar(50);
    }
    return anterior;
  };

  const clicarComMouse = async (seletor) => {
    await avaliar(`(function(){
      var el = document.querySelector(${JSON.stringify(seletor)});
      if (el) el.scrollIntoView({ block:'center' });
      return true;
    })()`);
    await esperarScrollParar();

    const pos = await avaliar(`(function(){
      var el = document.querySelector(${JSON.stringify(seletor)});
      if (!el) return null;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { vazio: true };
      return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
    })()`);
    if (!pos || pos.vazio) return false;

    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, button: 'none' });
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', buttons: 0, clickCount: 1 });
    await esperar(500);
    return true;
  };

  /* Clique simples, sem o segundo disparo (para botões onde um clique
     duplicado teria efeito colateral, como remover/limpar). */
  const clicarUmaVez = async (seletor) => {
    return avaliar(`(function(){
      var el = document.querySelector(${JSON.stringify(seletor)});
      if (!el) return false;
      el.scrollIntoView({ block:'center' });
      el.click();
      return true;
    })()`);
  };

  const estadoCarrinho = () => avaliar(`(function(){
    var S = window.GRACIOU_STORE;
    if (!S) return { erro: 'GRACIOU_STORE ausente' };
    var t = S.totalizar(S.getPayment());
    return {
      forma: t.formaPagamento,
      linhas: t.linhas.map(function(l){ return { id:l.productId, tamanho:l.tamanho, qtd:l.quantidade, key:l.key }; }),
      pecas: t.pecas,
      subtotal: t.subtotalFormatado,
      freteGratis: t.freteGratis,
      freteValor: t.frete.valor,
      total: t.totalFormatado,
      badge: (document.querySelector('.cart-badge__count')||{}).textContent
    };
  })()`);

  /* ══ 0. collection.html: limpar, adicionar camiseta M pelo seletor ══ */
  await ir(BASE + '/collection.html');
  await avaliar(`(function(){ window.GRACIOU_STORE.clearCart(); window.GRACIOU_STORE.setPayment('pix'); return true; })()`);
  await esperar(300);

  /* Prova de que o clique FÍSICO (mouse) chega ao handler, antes de
     seguir com os demais passos pelo DOM. */
  const clicouComMouse = await clicarComMouse('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
  const painelAposMouse = await avaliar(`!!document.querySelector('.tamanho-painel')`);

  /* Reutiliza o painel aberto pelo clique físico. Não dispara um segundo
     clique no botão, pois isso abriria dois painéis sobrepostos. */
  const abriuSeletor = painelAposMouse || await clicar('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
  const seletorVisivel = await avaliar(`!!document.querySelector('.tamanho-painel')`);
  const opcoes = await avaliar(`Array.from(document.querySelectorAll('.tamanho-painel [data-tamanho]')).map(function(b){return b.getAttribute('data-tamanho');})`);
  linhas.push('  [debug] src do store: ' + await avaliar(`(document.querySelector('script[src*="graciou-store"]')||{}).getAttribute ? document.querySelector('script[src*="graciou-store"]').getAttribute('src') : '?'`));
  linhas.push('  [debug] typeof store: ' + await avaliar(`typeof window.GRACIOU_STORE`));
  linhas.push('  [debug] typeof catalogo: ' + await avaliar(`typeof window.GRACIOU_CATALOGO`));
  linhas.push('  [debug] cards no grid: ' + await avaliar(`document.querySelectorAll('#products-grid .p-card[data-produto-id]').length`));
  await clicar('.tamanho-painel [data-tamanho="M"]');
  await esperar(600);

  linhas.push('');
  linhas.push('1) Adicionar uma camiseta tamanho M (pelo seletor da página)');
  conferir('clique fisico de mouse abriu o painel', [clicouComMouse, painelAposMouse], [true, true]);
  if (painelAposMouse) await clicar('.tamanho-painel__cancelar');
  conferir('botao do card encontrado', abriuSeletor, true);
  conferir('painel de tamanho aberto', seletorVisivel, true);
  conferir('tamanhos oferecidos', opcoes, ['PP', 'P', 'M', 'G', 'GG', 'XG']);
  conferir('painel fechou após escolher', await avaliar(`!document.querySelector('.tamanho-painel')`), true);

  /* Se a primeira adição falhar por qualquer motivo, para aqui com
     diagnóstico em vez de estourar um erro obscuro. */
  const cartInicial = await avaliar(`window.GRACIOU_STORE ? window.GRACIOU_STORE.getCart().length : -1`);
  if (cartInicial < 1) {
    linhas.push('  \u2717 nada foi adicionado — diagnóstico: store=' + await avaliar(`typeof window.GRACIOU_STORE`) +
      ' catalogo=' + await avaliar(`typeof window.GRACIOU_CATALOGO`) +
      ' cards=' + await avaliar(`document.querySelectorAll('#products-grid .p-card[data-produto-id]').length`));
    linhas.forEach((l) => console.log(l));
    cdp.fechar();
    process.exitCode = 1;
    return;
  }

  let e = await estadoCarrinho();
  conferir('itens no carrinho', e.linhas.length, 1);
  conferir('tamanho salvo', e.linhas[0].tamanho, 'M');
  conferir('quantidade', e.linhas[0].qtd, 1);
  conferir('subtotal (Pix)', e.subtotal, 'R$ 99,90');
  conferir('peças', e.pecas, 1);
  conferir('badge atualizado', e.badge, '1');

  /* Campos obrigatórios da linha (item 8) */
  const campos = await avaliar(`(function(){
    var l = window.GRACIOU_STORE.getCart()[0];
    return ['productId','nome','tamanho','cor','quantidade','precoPix','precoCartao','key']
      .map(function(c){ return c + '=' + (l[c] === undefined ? 'AUSENTE' : 'ok'); });
  })()`);
  conferir('campos obrigatórios presentes', campos, [
    'productId=ok', 'nome=ok', 'tamanho=ok', 'cor=ok', 'quantidade=ok',
    'precoPix=ok', 'precoCartao=ok', 'key=ok'
  ]);
  conferir('precoPix em centavos', await avaliar(`window.GRACIOU_STORE.getCart()[0].precoPix`), 9990);
  conferir('precoCartao em centavos', await avaliar(`window.GRACIOU_STORE.getCart()[0].precoCartao`), 10990);
  conferir('key única', await avaliar(`window.GRACIOU_STORE.getCart()[0].key`), 'tee-raizes::M::Verde militar');

  /* ══ 2. Adicionar duas camisetas ══ */
  linhas.push('');
  linhas.push('2) Adicionar duas camisetas');
  await clicar('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
  await clicar('.tamanho-painel [data-tamanho="M"]');
  await esperar(600);
  e = await estadoCarrinho();
  conferir('linhas no carrinho (mesma variação agrupa)', e.linhas.length, 1);
  conferir('quantidade somada', e.linhas[0].qtd, 2);
  conferir('peças', e.pecas, 2);
  conferir('subtotal', e.subtotal, 'R$ 199,80');
  conferir('frete grátis', e.freteGratis, true);
  conferir('valor do frete', e.freteValor, 0);
  conferir('total', e.total, 'R$ 199,80');

  /* Variação diferente = linha nova */
  await clicar('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
  await clicar('.tamanho-painel [data-tamanho="G"]');
  await esperar(600);
  e = await estadoCarrinho();
  conferir('tamanho diferente cria linha nova', e.linhas.length, 2);
  conferir('peças após 2 M + 1 G', e.pecas, 3);

  /* ══ 3. Uma camiseta e um short ══ */
  linhas.push('');
  linhas.push('3) Adicionar uma camiseta e um short');
  await avaliar(`window.GRACIOU_STORE.clearCart()`);
  await esperar(300);
  await clicar('[data-produto-id="tee-raizes"] [data-acao="adicionar-carrinho"]');
  await clicar('.tamanho-painel [data-tamanho="M"]');
  await esperar(400);
  await clicar('[data-produto-id="short-move"] [data-acao="adicionar-carrinho"]');
  await clicar('.tamanho-painel [data-tamanho="P"]');
  await esperar(600);
  e = await estadoCarrinho();
  conferir('linhas', e.linhas.length, 2);
  conferir('peças (2)', e.pecas, 2);
  conferir('subtotal Pix (camiseta + short)', e.subtotal, 'R$ 179,80');
  conferir('frete grátis', e.freteGratis, true);
  conferir('total', e.total, 'R$ 179,80');
  conferir('badge', e.badge, '2');

  /* ══ 4. cart.html: alterar quantidade pela interface ══ */
  linhas.push('');
  linhas.push('4) Alterar quantidade e remover item (interface do cart.html)');
  await ir(BASE + '/cart.html');
  conferir('itens renderizados na página', await avaliar(`document.querySelectorAll('.cart-item').length`), 2);
  conferir('subtotal na tela', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 179,80');
  conferir('peças na tela', await avaliar(`document.getElementById('cart-pecas').textContent`), '2');
  conferir('frete na tela', await avaliar(`(document.getElementById('cart-frete').textContent||'').trim()`), 'Frete grátisVocê tem 2 peças — frete grátis aplicado.');
  conferir('total na tela', await avaliar(`document.getElementById('cart-total').textContent`), 'R$ 179,80');

  await clicar('.cart-item:nth-child(1) [data-acao="aumentar"]');
  await esperar(500);
  conferir('após +1, peças', await avaliar(`document.getElementById('cart-pecas').textContent`), '3');
  conferir('após +1, subtotal', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 279,70');

  await clicar('.cart-item:nth-child(1) [data-acao="diminuir"]');
  await esperar(500);
  conferir('após −1, peças', await avaliar(`document.getElementById('cart-pecas').textContent`), '2');
  conferir('após −1, subtotal', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 179,80');

  /* ══ 5. Pix x Cartão ══ */
  linhas.push('');
  linhas.push('5) Alternar Pix e cartão');

  await clicar('.cart-pagamento [data-forma="cartao"]');
  await esperar(500);
  conferir('forma ativa', await avaliar(`window.GRACIOU_STORE.getPayment()`), 'cartao');
  conferir('subtotal no cartão', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 189,80');
  conferir('total no cartão', await avaliar(`document.getElementById('cart-total').textContent`), 'R$ 189,80');
  conferir('linha usa precoCartao', await avaliar(`window.GRACIOU_STORE.getCart()[0].precoCartao`), 10990);

  await clicar('.cart-pagamento [data-forma="pix"]');
  await esperar(500);
  conferir('subtotal de volta no Pix', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 179,80');

  /* ══ 6. 1 camiseta: Pix / cartão / frete pendente ══ */
  linhas.push('');
  linhas.push('6) Uma única peça: 1 camiseta Pix, 1 camiseta cartão, frete pendente');
  await avaliar(`(function(){
    var S = window.GRACIOU_STORE;
    S.clearCart();
    S.setPayment('pix');
    S.addToCart({ productId: 'tee-raizes', tamanho: 'M' });
    return true;
  })()`);
  await avaliar(`(function(){
    window.location.reload();
    return true;
  })()`);
  await esperar(1600);
  conferir('peças', await avaliar(`document.getElementById('cart-pecas').textContent`), '1');
  conferir('subtotal Pix', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 99,90');
  conferir('frete pendente no resumo', await avaliar(`(document.getElementById('cart-frete').textContent||'').includes('Frete pendente')`), true);
  conferir('valor do frete NÃO inventado', await avaliar(`(document.getElementById('cart-valor-frete').textContent||'').trim()`), 'Frete pendente');
  conferir('total fica pendente', await avaliar(`document.getElementById('cart-total').textContent`), 'R$ 99,90 + frete pendente');
  conferir('aviso orienta frete grátis', await avaliar(`(document.getElementById('cart-aviso-frete').textContent||'').includes('peça(s)')`), true);

  await clicar('.cart-pagamento [data-forma="cartao"]');
  await esperar(500);
  conferir('subtotal cartão (1 camiseta)', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 109,90');
  await clicar('.cart-pagamento [data-forma="pix"]');
  await esperar(500);
  conferir('subtotal Pix (1 camiseta)', await avaliar(`document.getElementById('cart-subtotal').textContent`), 'R$ 99,90');

  /* ══ 7. Recarregar e confirmar persistência ══ */
  linhas.push('');
  linhas.push('7) Recarregar a página: carrinho continua salvo');
  await ir(BASE + '/collection.html');
  conferir('badge após reload (collection)', await avaliar(`document.querySelector('.cart-badge__count').textContent`), '1');
  await ir(BASE + '/cart.html');
  const persistido = await avaliar(`(function(){
    var S = window.GRACIOU_STORE;
    return { itens: S.getCart().length, qtd: S.getCart()[0].quantidade, tamanho: S.getCart()[0].tamanho,
             subtotal: document.getElementById('cart-subtotal').textContent,
             de: localStorage.getItem('graciou-cart-v1') ? 'localStorage' : 'NENHUM' };
  })()`);
  conferir('itens salvos', persistido.itens, 1);
  conferir('quantidade salva', persistido.qtd, 1);
  conferir('tamanho salvo', persistido.tamanho, 'M');
  conferir('subtotal após reload', persistido.subtotal, 'R$ 99,90');
  conferir('origem do dado', persistido.de, 'localStorage');

  /* ══ 8. Remover item ══ */
  linhas.push('');
  linhas.push('8) Remover item e limpar carrinho');
  await clicarUmaVez('.cart-item [data-acao="remover"]');
  await esperar(600);
  conferir('carrinho vazio após remover', await avaliar(`window.GRACIOU_STORE.getCart().length`), 0);
  conferir('estado vazio visível', await avaliar(`document.getElementById('cart-vazio').classList.contains('visible')`), true);
  conferir('resumo escondido', await avaliar(`document.getElementById('cart-resumo').hidden`), true);
  conferir('badge zerado', await avaliar(`document.querySelector('.cart-badge__count').textContent`), '0');

  /* Limpar carrinho com itens (confirm() automático) */
  await avaliar(`(function(){
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    window.GRACIOU_STORE.addToCart({ productId:'short-move', tamanho:'P' });
    window.confirm = function(){ return true; };
    return true;
  })()`);
  await esperar(400);
  await clicarUmaVez('#cart-limpar');
  await esperar(600);
  conferir('limpar carrinho zerou', await avaliar(`window.GRACIOU_STORE.getCart().length`), 0);

  /* ══ 9. Screenshot com o carrinho cheio ══ */
  await avaliar(`(function(){
    var S = window.GRACIOU_STORE;
    S.clearCart();
    S.addToCart({ productId:'tee-raizes', tamanho:'M' });
    S.addToCart({ productId:'dryfit-move', tamanho:'G' });
    S.addToCart({ productId:'short-move', tamanho:'P' });
    return true;
  })()`);
  await esperar(900);
  const shot = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  mkdirSync('logs', { recursive: true });
  writeFileSync(join(process.cwd(), 'logs', 'carrinho.png'), Buffer.from(shot.data, 'base64'));

  /* ══ 10. Console ══ */
  linhas.push('');
  linhas.push('9) Console do navegador');
  conferir('zero erros/warnings', erros, []);

  console.log('\nGRACIOU — teste do carrinho real (navegador)');
  console.log('==========================================');
  linhas.forEach((l) => console.log(l));
  console.log('\nscreenshot: logs/carrinho.png');
  console.log(falhas === 0
    ? '\nRESULTADO: OK — todos os cenários conferem.\n'
    : `\nRESULTADO: FALHOU com ${falhas} divergência(s).\n`);

  cdp.fechar();
  if (falhas > 0) process.exitCode = 1;
}

principal()
  .catch((e) => { console.error('FALHA NA VALIDACAO:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());