import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Users\\PV\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://localhost:3010';
const PORTA = 9229;
const perfil = mkdtempSync(join(tmpdir(), 'graciou-cupom-'));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port='+PORTA,'--user-data-dir='+perfil,'about:blank'], { stdio:'ignore' });
const encerrar = () => { try { chrome.kill(); } catch (_) {} try { rmSync(perfil,{recursive:true,force:true}); } catch (_) {} };
function conectar(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pend = new Map();
    const events = [];
    ws.addEventListener('open', () => resolve({
      send(method, params) {
        const n = ++id;
        ws.send(JSON.stringify({ id: n, method, params: params || {} }));
        return new Promise((res, rej) => pend.set(n, { res, rej }));
      },
      on(method, cb) { events.push({ method, cb }); },
      close() { try { ws.close(); } catch (_) {} }
    }));
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) {
        const p = pend.get(m.id);
        pend.delete(m.id);
        if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
        return;
      }
      events.forEach((x) => { if (x.method === m.method) x.cb(m.params); });
    });
    ws.addEventListener('error', () => reject(new Error('WS erro')));
  });
}
let fails=0; const out=[]; function check(label,got,want){const ok=JSON.stringify(got)===JSON.stringify(want);if(!ok)fails++;out.push((ok?'✓ ':'✗ ')+label+' = '+JSON.stringify(got)+(ok?'':' esperado '+JSON.stringify(want)));}
async function main(){for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:'+PORTA+'/json/version');if(r.ok)break;}catch(_){}await esperar(250);}const target=await(await fetch('http://127.0.0.1:'+PORTA+'/json/new?about:blank',{method:'PUT'})).json();const c=await conectar(target.webSocketDebuggerUrl);const errors=[];c.on('Runtime.exceptionThrown',p=>errors.push((p.exceptionDetails||{}).text||'exception'));c.on('Log.entryAdded',p=>{const e=p.entry||{};if(e.level==='error'||e.level==='warning')errors.push(e.level+': '+e.text);});await c.send('Page.enable');await c.send('Runtime.enable');await c.send('Log.enable');await c.send('Network.setBlockedURLs',{urls:['*/favicon.ico']});await c.send('Page.navigate',{url:BASE+'/cart.html'});await esperar(1500);const evalPage=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r.result?r.result.value:undefined;};const clear=`(function(){localStorage.clear();window.GRACIOU_STORE.addToCart({productId:'tee-raizes',tamanho:'M'});return true})()`;await evalPage(clear);await esperar(300);check('configuração central do cupom',await evalPage(`window.GRACIOU_CATALOGO.META.cupons`),[{codigo:'BEMVINDO10',tipo:'percentual',valor:10,ativo:true,valorMinimo:0,limiteUsos:null,validade:null}]);check('1 camiseta subtotal Pix',await evalPage(`document.getElementById('cart-subtotal').textContent`),'R$ 99,90');const applied=await evalPage(`(function(){var i=document.getElementById('cart-cupom-input');i.value='bem vindo10';document.getElementById('cart-cupom-form').requestSubmit();return true})()`);await esperar(350);check('cupom minúsculo com espaço aplicado',await evalPage(`window.GRACIOU_STORE.getCoupon()`),'BEMVINDO10');check('desconto 1 camiseta',await evalPage(`document.getElementById('cart-desconto').textContent`),'-R$ 9,99');check('subtotal descontado 1 camiseta',await evalPage(`window.GRACIOU_STORE.totalizar('pix').subtotalComDescontoFormatado`),'R$ 89,91');check('total 1 camiseta com frete pendente',await evalPage(`document.getElementById('cart-total').textContent`),'R$ 89,91 + frete pendente');check('cupom não duplica',await evalPage(`window.GRACIOU_STORE.getCart().length`),1);await evalPage(`window.GRACIOU_STORE.addToCart({productId:'tee-raizes',tamanho:'M'})`);await esperar(300);check('2 camisetas subtotal',await evalPage(`document.getElementById('cart-subtotal').textContent`),'R$ 199,80');check('desconto 2 camisetas',await evalPage(`document.getElementById('cart-desconto').textContent`),'-R$ 19,98');check('frete grátis preservado',await evalPage(`document.getElementById('cart-frete').textContent.includes('Frete grátis')`),true);check('total 2 camisetas',await evalPage(`document.getElementById('cart-total').textContent`),'R$ 179,82');await evalPage(`window.GRACIOU_STORE.setPayment('cartao')`);await esperar(300);check('cartão recalcula subtotal',await evalPage(`document.getElementById('cart-subtotal').textContent`),'R$ 219,80');check('cartão recalcula desconto',await evalPage(`document.getElementById('cart-desconto').textContent`),'-R$ 21,98');check('cartão recalcula total',await evalPage(`document.getElementById('cart-total').textContent`),'R$ 197,82');await evalPage(`(function(){var i=document.getElementById('cart-cupom-input');if(i){i.value='INVALIDO';document.getElementById('cart-cupom-form').requestSubmit()}return true})()`);await esperar(300);check('cupom inválido não substitui o aplicado',await evalPage(`window.GRACIOU_STORE.getCoupon()`),'BEMVINDO10');await evalPage(`window.GRACIOU_STORE.removeCoupon()`);await esperar(250);check('remover cupom restaura cartão',await evalPage(`document.getElementById('cart-total').textContent`),'R$ 219,80');await evalPage(`window.GRACIOU_STORE.setPayment('pix');window.GRACIOU_STORE.setCoupon('BEMVINDO10')`);await esperar(250);await c.send('Page.reload');await esperar(1200);check('cupom persiste após reload',await evalPage(`window.GRACIOU_STORE.getCoupon()`),'BEMVINDO10');check('desconto persiste após reload',await evalPage(`document.getElementById('cart-desconto').textContent`),'-R$ 19,98');await evalPage(`window.GRACIOU_STORE.clearCart()`);await esperar(300);check('limpar carrinho remove cupom',await evalPage(`window.GRACIOU_STORE.getCoupon()`),'');check('estado vazio após limpar',await evalPage(`document.getElementById('cart-vazio').classList.contains('visible')`),true);check('zero erros/warnings',errors,[]);console.log(out.join('\n'));console.log('\nRESULTADO: '+(fails?'FALHOU com '+fails+' divergência(s)':'OK — testes de cupons passaram'));c.close();if(fails)process.exitCode=1;}
main().catch(e=>{console.error('FALHA:',e);process.exitCode=1}).finally(encerrar);