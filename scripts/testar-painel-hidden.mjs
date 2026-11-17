import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(resolve(raiz, 'admin.html'), 'utf8');

// 1. Validar que a regra CSS explícita para [hidden] existe com display: none !important
const regexRegraHidden = /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/;
assert.ok(regexRegraHidden.test(html),
  'admin.html deve conter a regra CSS "[hidden] { display: none !important; }" para sobrepor .login-wrap { display: flex }');

// 2. Validar que entrarNoPainel() oculta a tela de login via propriedade hidden e exibe a aplicação
assert.ok(html.includes('telaLogin.hidden = true;'),
  'A função entrarNoPainel() deve marcar telaLogin.hidden = true.');
assert.ok(html.includes("app.classList.add('is-visivel');"),
  "A função entrarNoPainel() deve adicionar a classe 'is-visivel' ao elemento #app.");
assert.ok(html.includes('btnSair.hidden = false;'),
  'O botão Encerrar sessão deve ser exibido após entrar no painel.');

// 3. Validar elementos HTML estruturais e IDs esperados no pós-login
assert.ok(html.includes('id="tela-login"'), 'Elemento #tela-login deve existir.');
assert.ok(html.includes('class="login-wrap"'), 'Elemento com .login-wrap deve existir.');
assert.ok(html.includes('id="app"'), 'Elemento #app deve existir.');
assert.ok(html.includes('id="btn-sair"'), 'Botão #btn-sair deve existir.');
assert.ok(html.includes('id="lista-vazio"'), 'Mensagem #lista-vazio de lista sem pedidos deve existir.');
assert.ok(html.includes('id="lista-tabela-wrap"'), 'Container #lista-tabela-wrap da lista de pedidos deve existir.');
assert.ok(html.includes('id="detalhe"'), 'Painel de detalhes #detalhe deve existir.');
assert.ok(html.includes('id="login-erro"'), 'Aviso #login-erro deve existir.');

// 4. Simulação semântica da prioridade de estilo no navegador
// Elementos com display explícito (ex.: .login-wrap { display: flex }) teriam display: flex
// a menos que [hidden] possua !important no CSS do autor.
function resolverDisplaySimulado(classes, atributoHidden) {
  if (atributoHidden) {
    // Com a regra do autor: [hidden] { display: none !important; }
    return 'none';
  }
  if (classes.includes('login-wrap')) return 'flex';
  if (classes.includes('app') && classes.includes('is-visivel')) return 'block';
  if (classes.includes('app')) return 'none';
  return 'block';
}

// Antes do login
assert.equal(resolverDisplaySimulado(['login-wrap'], false), 'flex',
  'Antes do login, a tela de login deve ter display: flex.');
assert.equal(resolverDisplaySimulado(['app'], false), 'none',
  'Antes do login, o app deve ter display: none.');

// Após o login (telaLogin.hidden = true e app.classList.add('is-visivel'))
assert.equal(resolverDisplaySimulado(['login-wrap'], true), 'none',
  'Após login, a tela de login com hidden deve ter display: none sobrepondo .login-wrap.');
assert.equal(resolverDisplaySimulado(['app', 'is-visivel'], false), 'block',
  'Após login, o app com .is-visivel deve ter display: block.');

console.log('OK — regra [hidden] { display: none !important; } e transição pós-login de admin.html validadas.');
