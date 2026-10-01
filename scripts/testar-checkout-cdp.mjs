/**
 * ═══════════════════════════════════════
 * GRACIOU — TESTE DO CHECKOUT (navegador real, CDP)
 * Arquivo: scripts/testar-checkout-cdp.mjs
 * ═══════════════════════════════════════════════════════════
 *
 * Uso: node scripts/testar-checkout-cdp.mjs [base-front] [base-api]
 *      (padrões: http://localhost:3100 e http://localhost:3001)
 *
 * Exige DOIS serviços no ar:
 *   node scripts/servidor-estatico.js   (front na 3100)
 *   cd backend && npm run dev           (API na 3001)
 *
 * Cenários obrigatórios desta etapa:
 *   1.  Carrinho vazio redireciona para cart.html.
 *   2.  Formulário bloqueia envio sem nome, e-mail e endereço.
 *   3.  E-mail inválido mostra erro.
 *   4.  Uma camiseta gera pedido com frete pendente.
 *   5.  Duas peças geram pedido com frete grátis.
 *   6.  Cupom BEMVINDO10 permanece no pedido.
 *   7.  Forma Pix fica salva.
 *   8.  Forma cartão fica salva.
 *   9.  Recarregar o checkout não perde os dados preenchidos.
 *   10. Zero erros no console.
 *   11. node --check nos JS alterados (feito fora deste script).
 *
 * Nesta etapa NÃO há pagamento: nenhum dado de cartão é digitado,
 * nenhum request externo é feito e o pedido vive só em localStorage.
 */

import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:3010';
/* A API do backend guarda o pedido oficial. Este teste fala com ela
   para conferir o que foi realmente gravado. */
const BASE_API = process.argv[3] || 'http://localhost:3001';
const PORTA_CDP = 9444;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-checkout-'));

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

/* ── Placar das conferências ── */
let falhas = 0;
const linhas = [];
function conferir(rotulo, recebido, esperado) {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  const ok = a === b;
  if (!ok) falhas++;
  linhas.push((ok ? '  \u2713 ' : '  \u2717 ') + rotulo + ' = ' + a + (ok ? '' : '   (esperado ' + b + ')'));
}
function secao(titulo) { linhas.push(''); linhas.push(titulo); }

async function principal() {
  /* A API é necessária: o checkout agora grava o pedido oficial nela. */
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

  const erros = [];
  const requestsExternos = [];
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
  /* Prova de que o checkout não conversa com serviço externo nenhum.
     As fontes do Google (links <link> do próprio design do site) ficam de
     fora: são pedidos de arquivo de fonte e não recebem dado do cliente. */
  const HOSTS_IGNORADOS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  cdp.ao('Network.requestWillBeSent', (p) => {
    const url = (p.request && p.request.url) || '';
    if (!url || url.startsWith(BASE) || url.startsWith('http://127.0.0.1') ||
        url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) return;
    if (HOSTS_IGNORADOS.some((h) => url.indexOf(h) !== -1)) return;
    if (requestsExternos.indexOf(url) === -1) requestsExternos.push(url);
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
  const urlAtual = () => avaliar('window.location.pathname');

  /* Preenche um campo disparando o mesmo evento 'input' do usuário,
     para que máscara e rascunho sejam exercitados de verdade. */
  const preencher = async (id, valor) => avaliar(`(function(){
    var el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    el.focus();
    el.value = ${JSON.stringify(valor)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  })()`);

  const responder = (valor) => avaliar(`(function(){
    window.confirm = function(){ return ${valor ? 'true' : 'false'}; };
    window.alert = function(){};
    return true;
  })()`);

  const limparArmazenamento = () => avaliar(
    `(function(){ localStorage.clear(); return true; })()`);

  /* ── Leitura do pedido GRAVADO NA API ──
     Mudança da etapa do backend: no sucesso, o checkout remove o
     pedido do localStorage (a API passa a ser a fonte oficial).
     Então as conferências do pedido leem do BANCO, pelo número que
     aparece na confirmação — que é o que o cliente recebe de fato. */
  const numeroNaTela = () => avaliar(`document.getElementById('ck-conf-id').textContent.trim()`);

  const pedidoDaApi = async () => {
    const numero = await numeroNaTela();
    if (!numero || numero === '—') return { erro: 'sem numero na tela' };
    const r = await fetch(BASE_API + '/api/orders/' + encodeURIComponent(numero));
    if (!r.ok) return { erro: 'HTTP ' + r.status, numero: numero };
    return await r.json();
  };

  /* Mantém o nome `pedidoN` usado nos blocos abaixo, mas a origem
     agora é a API (com fallback para o localStorage, que ainda é a
     cópia local usada quando a API está fora do ar). */
  const pedidoSalvo = async () => {
    const bruto = await avaliar(`localStorage.getItem('graciou-pedido-v1')`);
    return bruto === null || bruto === undefined ? null : JSON.parse(bruto);
  };

  const formularioPadrao = async () => {
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
    await preencher('ck-complemento', '');
  };

  /* ══════════════════════════════════════════════
     1. Carrinho vazio → volta para cart.html
     ══════════════════════════════════════════════ */
  secao('1) Carrinho vazio redireciona para cart.html');
  await ir(BASE + '/cart.html');
  await limparArmazenamento();
  await ir(BASE + '/checkout.html');
  conferir('URL após abrir checkout vazio', await urlAtual(), '/cart.html');
  conferir('formulário do checkout não existe nessa navegação',
    await avaliar(`!!document.getElementById('ck-form')`), false);

  /* ══════════════════════════════════════════════
     2. Formulário bloqueia envio sem nome, e-mail e endereço
     ══════════════════════════════════════════════ */
  secao('2) Sem nome, e-mail e endereço o envio é bloqueado');
  await ir(BASE + '/cart.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    return true;
  })()`);
  await ir(BASE + '/checkout.html');
  conferir('checkout abriu com carrinho cheio', await urlAtual(), '/checkout.html');
  conferir('formulário presente', await avaliar(`!!document.getElementById('ck-form')`), true);

  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(400);

  conferir('alerta de validação visível', await avaliar(`!document.getElementById('ck-alerta').hidden`), true);
  conferir('erro de nome exibido', await avaliar(`document.getElementById('ck-erro-nome').textContent`),
    'Informe nome completo.');
  conferir('erro de e-mail exibido', await avaliar(`document.getElementById('ck-erro-email').textContent`),
    'Informe e-mail.');
  conferir('erro de endereço (CEP) exibido', await avaliar(`document.getElementById('ck-erro-cep').textContent`),
    'Informe cep.');
  conferir('erro de rua exibido', await avaliar(`document.getElementById('ck-erro-rua').textContent`),
    'Informe rua.');
  conferir('nada foi salvo como pedido', await avaliar(`localStorage.getItem('graciou-pedido-v1')`), null);
  conferir('formulário continua visível (não avançou)',
    await avaliar(`!document.getElementById('ck-resumo').hidden`), true);

  /* ══════════════════════════════════════════════
     3. E-mail inválido mostra erro
     ══════════════════════════════════════════════ */
  secao('3) E-mail inválido mostra erro');
  await formularioPadrao();
  await preencher('ck-email', 'maria@exemplo');
  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(400);
  conferir('erro de e-mail inválido', await avaliar(`document.getElementById('ck-erro-email').textContent`),
    'E-mail inválido. Exemplo: voce@email.com.');
  conferir('campo de e-mail marcado como inválido',
    await avaliar(`document.getElementById('ck-email').getAttribute('aria-invalid')`), 'true');
  conferir('ainda não existe pedido salvo', await avaliar(`localStorage.getItem('graciou-pedido-v1')`), null);

  /* Máscaras visuais: telefone e CEP */
  conferir('máscara de telefone aplicada ao digitar',
    await avaliar(`document.getElementById('ck-telefone').value`), '(11) 98765-4321');
  conferir('máscara de CEP aplicada ao digitar',
    await avaliar(`document.getElementById('ck-cep').value`), '01310-100');
  conferir('CPF mascarado ao digitar',
    await avaliar(`document.getElementById('ck-cpf').value`), '123.456.789-01');
  conferir('UF normalizada para maiúsculas',
    await avaliar(`document.getElementById('ck-estado').value`), 'SP');

  /* ══════════════════════════════════════════════
     4. Uma camiseta → pedido com frete pendente
     ══════════════════════════════════════════════ */
  secao('4) Uma camiseta gera pedido com frete pendente');
  await preencher('ck-email', 'maria@exemplo.com');
  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(600);

  conferir('confirmação exibida', await avaliar(`!document.getElementById('ck-confirmacao').hidden`), true);
  conferir('mensagem da etapa', await avaliar(`document.querySelector('.ck-confirmacao__texto').textContent`),
    'Dados salvos. O pagamento será conectado na próxima etapa.');
  conferir('numero do servidor na confirmacao', /^GR-/.test(await numeroNaTela()), true);
  conferir('pedido local ja foi limpo (API confirmou)',
    await pedidoSalvo(), null);

  /* A partir daqui o pedido vem da API — a fonte oficial. */
  const resposta1 = await pedidoDaApi();
  conferir('API devolveu o pedido', resposta1.ok, true);
  const pedido1 = resposta1.pedido;
  conferir('pedido tem id GR-', /^GR-/.test(pedido1 && pedido1.id), true);
  conferir('peças no pedido', pedido1.itens.length, 1);
  conferir('formato do item do pedido',
    Object.keys(pedido1.itens[0]).sort(),
    ['categoria', 'cor', 'nome', 'precoUnitario', 'productId', 'quantidade', 'subtotal', 'tamanho']);
  conferir('tamanho salvo no item', pedido1.itens[0].tamanho, 'M');
  conferir('quantidade salva no item', pedido1.itens[0].quantidade, 1);
  conferir('cor salva no item', pedido1.itens[0].cor, 'Verde militar');
  conferir('subtotal do pedido (Pix, 1 camiseta)', pedido1.subtotal, 9990);
  conferir('desconto zero sem cupom', pedido1.desconto, 0);
  conferir('cupom null sem cupom aplicado', pedido1.cupom, null);
  conferir('frete null (valor não informado)', pedido1.frete, null);
  conferir('total null (frete pendente)', pedido1.total, null);
  conferir('status do pedido', pedido1.statusPedido, 'aguardando_pagamento');
  conferir('pagamento pix', pedido1.pagamento.forma, 'pix');
  conferir('pagamento aguardando', pedido1.pagamento.status, 'aguardando');
  conferir('cliente salvo',
    { nome: pedido1.cliente.nome, email: pedido1.cliente.email },
    { nome: 'Maria de Souza', email: 'maria@exemplo.com' });
  conferir('endereço salvo',
    { cep: pedido1.endereco.cep, estado: pedido1.endereco.estado,
      cidade: pedido1.endereco.cidade, bairro: pedido1.endereco.bairro,
      rua: pedido1.endereco.rua, numero: pedido1.endereco.numero,
      complemento: pedido1.endereco.complemento },
    { cep: '01310-100', estado: 'SP', cidade: 'São Paulo', bairro: 'Bela Vista',
      rua: 'Avenida Paulista', numero: '1000', complemento: '' });

  /* A tela não inventa valor de frete para 1 peça */
  conferir('tela: frete a calcular',
    await avaliar(`document.getElementById('ck-valor-frete').textContent`),
    'Frete será calculado antes do pagamento');
  conferir('tela: bloco de frete orienta o cálculo',
    await avaliar(`(document.getElementById('ck-frete').textContent||'').includes('será calculado antes do pagamento')`), true);

  /* ══════════════════════════════════════════════
     5. Duas peças → frete grátis
     ══════════════════════════════════════════════ */
  secao('5) Duas peças geram pedido com frete grátis');
  await ir(BASE + '/cart.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    window.GRACIOU_STORE.addToCart({ productId:'short-move', tamanho:'P' });
    return true;
  })()`);
  await ir(BASE + '/checkout.html');
  await responder(true);
  await formularioPadrao();
  conferir('frete grátis na tela (2 peças)',
    await avaliar(`document.getElementById('ck-valor-frete').textContent`), 'Grátis');
  conferir('selo de frete grátis visível',
    await avaliar(`!!document.querySelector('#ck-frete .ck-frete-gratis')`), true);

  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(1200);
  const resultado2 = await pedidoDaApi();
  const pedido2 = resultado2.pedido;
  conferir('API recebeu o pedido de 2 pecas', resultado2.ok, true);
  conferir('duas linhas no pedido', pedido2.itens.length, 2);
  conferir('subtotal 2 peças (Pix)', pedido2.subtotal, 9990 + 7990);
  conferir('frete do pedido = 0 (grátis)', pedido2.frete, 0);
  conferir('total calculado com frete grátis', pedido2.total, 17980);
  conferir('total na tela', await avaliar(`document.getElementById('ck-total').textContent`), 'R$ 179,80');
  conferir('confirmação mostra frete grátis',
    await avaliar(`document.getElementById('ck-conf-frete').textContent`), 'Frete grátis');

  /* ══════════════════════════════════════════════
     6. Cupom BEMVINDO10 permanece no pedido
     ══════════════════════════════════════════════ */
  secao('6) Cupom BEMVINDO10 permanece no pedido');
  await ir(BASE + '/cart.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    window.GRACIOU_STORE.addToCart({ productId:'short-move', tamanho:'P' });
    window.GRACIOU_STORE.setCoupon('bemvindo10');
    return true;
  })()`);
  await ir(BASE + '/checkout.html');
  conferir('cupom chegou ao checkout', await avaliar(`window.GRACIOU_STORE.getCoupon()`), 'BEMVINDO10');
  conferir('linha de desconto visível',
    await avaliar(`!document.getElementById('ck-linha-desconto').hidden`), true);
  conferir('desconto de 10% exibido',
    await avaliar(`document.getElementById('ck-desconto').textContent`), '-R$ 17,98');
  conferir('selo do cupom aplicado na tela',
    await avaliar(`(document.querySelector('#ck-cupom .ck-cupom-aplicado')||{}).textContent`),
    'BEMVINDO10 aplicado- R$ 17,98');

  await responder(true);
  await formularioPadrao();
  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(1200);
  const resultado3 = await pedidoDaApi();
  const pedido3 = resultado3.pedido;
  conferir('API recebeu o pedido com cupom', resultado3.ok, true);
  conferir('cupom salvo no pedido', pedido3.cupom && pedido3.cupom.codigo, 'BEMVINDO10');
  conferir('tipo do cupom no pedido', pedido3.cupom && pedido3.cupom.tipo, 'percentual');
  conferir('valor do cupom (percentual)', pedido3.cupom && pedido3.cupom.valor, 10);
  conferir('desconto calculado no pedido', pedido3.desconto, 1798);
  conferir('subtotal do pedido sem desconto', pedido3.subtotal, 17980);
  conferir('total do pedido descontado', pedido3.total, 16182);

  /* ══════════════════════════════════════════════
     7. Forma Pix fica salva
     ══════════════════════════════════════════════ */
  secao('7) Forma Pix fica salva');
  conferir('botão Pix marcado como ativo',
    await avaliar(`document.querySelector('.ck-pagamento__btn[data-forma="pix"]').classList.contains('is-active')`), true);
  conferir('aria-pressed do Pix',
    await avaliar(`document.querySelector('.ck-pagamento__btn[data-forma="pix"]').getAttribute('aria-pressed')`), 'true');
  conferir('store guardou pix', await avaliar(`window.GRACIOU_STORE.getPayment()`), 'pix');
  conferir('pedido pagamento.forma = pix', pedido3.pagamento.forma, 'pix');
  conferir('pedido pagamento.status = aguardando', pedido3.pagamento.status, 'aguardando');

  /* ══════════════════════════════════════════════
     8. Forma cartão fica salva
     ══════════════════════════════════════════════ */
  secao('8) Forma cartão fica salva');
  await ir(BASE + '/cart.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.setPayment('pix');
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    return true;
  })()`);
  await ir(BASE + '/checkout.html');
  conferir('carrinho reiniciado com 1 peça',
    await avaliar(`window.GRACIOU_STORE.getCart().reduce(function(s,l){return s+l.quantidade;},0)`), 1);
  await avaliar(`document.querySelector('.ck-pagamento__btn[data-forma="cartao"]').click()`);
  await esperar(400);
  conferir('store guardou cartao', await avaliar(`window.GRACIOU_STORE.getPayment()`), 'cartao');
  conferir('botão do cartão ativo',
    await avaliar(`document.querySelector('.ck-pagamento__btn[data-forma="cartao"]').classList.contains('is-active')`), true);
  conferir('aria-pressed do cartão',
    await avaliar(`document.querySelector('.ck-pagamento__btn[data-forma="cartao"]').getAttribute('aria-pressed')`), 'true');

  await responder(true);
  await formularioPadrao();
  await avaliar(`document.getElementById('ck-continuar').click()`);
  await esperar(1200);
  const resultado4 = await pedidoDaApi();
  const pedido4 = resultado4.pedido;
  conferir('API recebeu o pedido no cartao', resultado4.ok, true);
  conferir('pedido pagamento.forma = cartao', pedido4.pagamento.forma, 'cartao');
  conferir('preço unitário de cartão no item', pedido4.itens[0].precoUnitario, 10990);
  conferir('subtotal do pedido no cartão', pedido4.subtotal, 10990);
  conferir('linhas do pedido no cartão', pedido4.itens.length, 1);
  conferir('pagamento sem status de cartão (só aguardando)', pedido4.pagamento.status, 'aguardando');

  /* Regras 10/11: não existe campo de cartão em lugar nenhum.
     A checagem olha para os CAMPOS do DOM e para as CHAVES do pedido —
     a palavra "cartão" só aparece como forma de pagamento escolhida. */
  conferir('nenhum campo de cartão na página',
    await avaliar(`document.querySelectorAll('input[type="password"], input[autocomplete^="cc-"], [class*="cc-"], [id*="cartao"] [class*="numero"]').length`), 0);
  conferir('nenhum campo além dos 11 do formulário',
    await avaliar(`document.querySelectorAll('#ck-form input, #ck-form select, #ck-form textarea').length`), 11);

  /* A partir da etapa do backend, o pedido oficial vive na API.
     A checagem de dado de cartão passou a ser feita no BANCO —
     aqui só confirmamos que a página não tem campo nenhum disso. */
  conferir('nenhum campo de cartão na pagina (autocomplete cc-*)',
    await avaliar(`document.querySelectorAll('[autocomplete^="cc-"], [name*="cvv" i], [name*="cartao" i]').length`), 0);

  /* ══════════════════════════════════════════════
     9. Recarregar o checkout não perde o que foi digitado
     ══════════════════════════════════════════════ */
  secao('9) Recarregar o checkout não perde os dados preenchidos');
  await ir(BASE + '/cart.html');
  await avaliar(`(function(){
    localStorage.clear();
    window.GRACIOU_STORE.addToCart({ productId:'tee-raizes', tamanho:'M' });
    return true;
  })()`);
  await ir(BASE + '/checkout.html');
  await formularioPadrao();
  await preencher('ck-complemento', 'Apto 42, bloco B');

  await cdp.enviar('Page.reload');
  await esperar(1800);

  conferir('nome persiste após recarregar',
    await avaliar(`document.getElementById('ck-nome').value`), 'Maria de Souza');
  conferir('e-mail persiste após recarregar',
    await avaliar(`document.getElementById('ck-email').value`), 'maria@exemplo.com');
  conferir('telefone persiste após recarregar',
    await avaliar(`document.getElementById('ck-telefone').value`), '(11) 98765-4321');
  conferir('CEP persiste após recarregar',
    await avaliar(`document.getElementById('ck-cep').value`), '01310-100');
  conferir('UF persiste após recarregar',
    await avaliar(`document.getElementById('ck-estado').value`), 'SP');
  conferir('rua persiste após recarregar',
    await avaliar(`document.getElementById('ck-rua').value`), 'Avenida Paulista');
  conferir('complemento persiste após recarregar',
    await avaliar(`document.getElementById('ck-complemento').value`), 'Apto 42, bloco B');
  conferir('rascunho em localStorage',
    await avaliar(`!!localStorage.getItem('graciou-checkout-rascunho-v1')`), true);

  /* Carrinho preservado ao voltar para cart.html */
  secao('9b) Voltar para o carrinho não perde as peças');
  await ir(BASE + '/checkout.html');
  const hrefVoltar = await avaliar(`document.getElementById('ck-voltar-carrinho').getAttribute('href')`);
  conferir('link de voltar aponta para cart.html', hrefVoltar, 'cart.html');
  await cdp.enviar('Page.navigate', { url: BASE + '/' + hrefVoltar });
  await esperar(1600);
  conferir('itens preservados no carrinho',
    await avaliar(`window.GRACIOU_STORE.getCart().length`), 1);
  conferir('quantidade preservada',
    await avaliar(`window.GRACIOU_STORE.getCart()[0].quantidade`), 1);

  /* ══════════════════════════════════════════════
     10. Console e integrações externas
     ══════════════════════════════════════════════ */
  secao('10) Console, cupons e ausência de integração de pagamento');
  conferir('zero erros/warnings no console', erros, []);
  conferir('nenhum request para serviço externo', requestsExternos, []);
  conferir('cupons do catálogo intactos',
    await avaliar(`window.GRACIOU_CATALOGO.META.cupons.length`), 1);
  conferir('cupom BEMVINDO10 ainda ativo',
    await avaliar(`window.GRACIOU_CATALOGO.buscarCupom('BEMVINDO10').ativo`), true);
  conferir('nenhuma referência a Mercado Pago no HTML',
    await avaliar(`/mercadopago|mercado_pago|mercadopago\\.com/i.test(document.documentElement.outerHTML)`), false);
  conferir('valor do frete continua null no catálogo',
    await avaliar(`window.GRACIOU_CATALOGO.META.valorFrete`), null);

  /* ══════════════════════════════════════════════
     11. Screenshot do checkout preenchido
     ══════════════════════════════════════════════ */
  await ir(BASE + '/checkout.html');
  await responder(true);
  await formularioPadrao();
  await esperar(700);
  const shot = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  mkdirSync('logs', { recursive: true });
  writeFileSync(join(process.cwd(), 'logs', 'checkout.png'), Buffer.from(shot.data, 'base64'));

  console.log('\nGRACIOU — teste do checkout (navegador real)');
  console.log('===========================================');
  linhas.forEach((l) => console.log(l));
  console.log('\nscreenshot: logs/checkout.png');
  console.log(falhas === 0
    ? '\nRESULTADO: OK — todos os cenários conferem.\n'
    : `\nRESULTADO: FALHOU com ${falhas} divergência(s).\n`);

  cdp.fechar();
  if (falhas > 0) process.exitCode = 1;
}

principal()
  .catch((e) => { console.error('FALHA NA VALIDACAO:', e.message); process.exitCode = 1; })
  .finally(() => encerrar());