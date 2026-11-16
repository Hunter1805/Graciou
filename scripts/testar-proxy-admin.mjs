import { createRequire } from 'node:module';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import proxy, { __test } from '../proxy.js';

const carregar = createRequire(import.meta.url);
const pastaTemp = mkdtempSync(join(tmpdir(), 'graciou-barreira-admin-'));
const USUARIO_QA = 'usuario-barreira-teste';
const SENHA_QA = 'senha-barreira-falsa-somente-para-testes';
const COOKIE_NOME = 'graciou_admin_gate';
process.env.GRACIOU_SKIP_DOTENV = '1';
process.env.GRACIOU_DB = join(pastaTemp, 'admin-barreira.sqlite');
process.env.ADMIN_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
process.env.ADMIN_GATE_USER = USUARIO_QA;
process.env.ADMIN_GATE_PASSWORD = SENHA_QA;
process.env.VERCEL = '1';
process.env.SUPABASE_URL = 'https://supabase.qa.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-falsa-de-teste';
const fetchOriginal = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, ...args) => String(input).startsWith(process.env.SUPABASE_URL)
  ? Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  : fetchOriginal(input, ...args);
const admin = carregar('../backend/admin.js');
const barreira = carregar('../backend/barreira-admin.js');
const handler = carregar('../api/[...path].js');
const servidor = http.createServer((req, res) => handler(req, res));
servidor.unref();
const servidorPronto = new Promise((resolve, reject) => {
  servidor.once('error', reject);
  servidor.listen(0, '127.0.0.1', resolve);
});

function conferir(nome, condicao) {
  if (!condicao) throw new Error('Falhou: ' + nome);
  console.log('OK — ' + nome);
}

function basic(usuario, senha) {
  return 'Basic ' + btoa(usuario + ':' + senha);
}

function requisicao(caminho, headers = {}) {
  return new Request('https://graciou.example' + caminho, { headers });
}

async function respostaLogin(cookie, codigo = 'invalid-code') {
  await servidorPronto;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}/api/admin/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ codigo })
  });
  return { status: resposta.status, body: await resposta.json().catch(() => ({})) };
}

function valorDoSetCookie(cabecalho) {
  return String(cabecalho || '').split(';', 1)[0];
}

const semAutenticacao = await proxy(requisicao('/admin.html'));
conferir('primeira visita sem autenticação responde 401', semAutenticacao.status === 401 &&
  (semAutenticacao.headers.get('content-type') || '').startsWith('text/plain'));

const basicInvalidoPagina = await proxy(requisicao('/admin.html', {
  Authorization: basic(USUARIO_QA, 'senha-incorreta-de-teste')
}));
conferir('HTTP Basic incorreto é recusado em /admin.html', basicInvalidoPagina.status === 401);

const basicInicial = await proxy(requisicao('/admin.html', {
  Authorization: basic(USUARIO_QA, SENHA_QA)
}));
const setCookie = basicInicial.headers.get('set-cookie') || '';
const cookie = valorDoSetCookie(setCookie);
conferir('Basic correto responde 303 com Set-Cookie e Location gate=1',
  basicInicial.status === 303 && basicInicial.headers.get('location') === '/admin.html?gate=1' &&
  cookie.startsWith(COOKIE_NOME + '=') &&
  basicInicial.headers.get('cache-control') === 'no-store, private');
conferir('cookie tem HttpOnly, Secure, SameSite=Strict, Path=/ e Max-Age=600',
  /(?:^|;\s*)HttpOnly(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)Secure(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)SameSite=Strict(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)Path=\/(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)Max-Age=600(?:;|$)/i.test(setCookie));
const conteudoCookie = cookie.slice((COOKIE_NOME + '=').length).split('.')[0];
const payloadCookie = atob(conteudoCookie.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - conteudoCookie.length % 4) % 4));
conferir('cookie não contém usuário nem senha em texto puro',
  !payloadCookie.includes(USUARIO_QA) && !payloadCookie.includes(SENHA_QA));

const retornoGateSemCookie = await proxy(requisicao('/admin.html?gate=1'));
conferir('gate=1 sem cookie recusa em vez de redirecionar novamente', retornoGateSemCookie.status === 401 &&
  (retornoGateSemCookie.headers.get('content-type') || '').startsWith('text/plain'));

const retornoGate = await proxy(requisicao('/admin.html?gate=1', { Cookie: cookie }));
conferir('retorno gate=1 com cookie redireciona para URL limpa sem apagar cookie', retornoGate.status === 303 &&
  retornoGate.headers.get('location') === '/admin.html' && !retornoGate.headers.has('set-cookie'));

const paginaLimpa = await proxy(requisicao('/admin.html', { Cookie: cookie }));
conferir('URL limpa com cookie válido continua com next()', paginaLimpa.headers.get('x-middleware-next') === '1');
conferir('cookie emitido pelo proxy passa no validador backend', barreira.validarCookieBarreira(cookie));

const valor = cookie.slice((COOKIE_NOME + '=').length);
const partesValor = valor.split('.');
const assinaturaAlterada = (partesValor[1][0] === 'A' ? 'B' : 'A') + partesValor[1].slice(1);
const cookieAlterado = COOKIE_NOME + '=' + partesValor[0] + '.' + assinaturaAlterada;
conferir('cookie adulterado recusado pelo validador backend', !barreira.validarCookieBarreira(cookieAlterado));
const respostaAdulterado = await respostaLogin(cookieAlterado,
  admin.codigoTotp(process.env.ADMIN_TOTP_SECRET, Math.floor(Date.now() / 30000)));
conferir('login com cookie adulterado recusado antes da validação TOTP',
  respostaAdulterado.status === 404 && respostaAdulterado.body.erro === 'Acesso não autorizado.');

const expiradoSetCookie = await __test.criarCookieBarreira(
  USUARIO_QA, SENHA_QA, Date.now() - (11 * 60 * 1000)
);
const cookieExpirado = valorDoSetCookie(expiradoSetCookie);
conferir('cookie expirado recusado pelo validador backend', !barreira.validarCookieBarreira(cookieExpirado));
const respostaExpirado = await respostaLogin(cookieExpirado,
  admin.codigoTotp(process.env.ADMIN_TOTP_SECRET, Math.floor(Date.now() / 30000)));
conferir('login com cookie expirado recusado', respostaExpirado.status === 404);

const conferirCredenciaisOriginal = admin.conferirCredenciais;
let chamadasValidacaoTotp = 0;
admin.conferirCredenciais = (...args) => {
  chamadasValidacaoTotp += 1;
  return conferirCredenciaisOriginal(...args);
};
const semCookie = await respostaLogin(null,
  admin.codigoTotp(process.env.ADMIN_TOTP_SECRET, Math.floor(Date.now() / 30000)));
conferir('login sem cookie retorna JSON 404 mesmo com TOTP correto',
  semCookie.status === 404 && semCookie.body.ok === false && semCookie.body.erro === 'Acesso não autorizado.');
conferir('login sem cookie não chega à validação TOTP nem cria sessão',
  chamadasValidacaoTotp === 0 && admin.sessoesAtivas() === 0);
const totpValido = admin.codigoTotp(process.env.ADMIN_TOTP_SECRET, Math.floor(Date.now() / 30000));
const codigoInvalido = admin.codigoTotp(process.env.ADMIN_TOTP_SECRET, Math.floor(Date.now() / 30000) + 1000);
conferir('código TOTP inválido de seis dígitos', /^\d{6}$/.test(codigoInvalido) && !admin.conferirTotp(codigoInvalido, process.env.ADMIN_TOTP_SECRET));
const totpInvalido = await respostaLogin(cookie, codigoInvalido);
conferir('cookie válido com TOTP inválido é recusado', totpInvalido.status === 401 &&
  totpInvalido.body.erro === 'Código temporário inválido.' && totpInvalido.body.ok === false);
const loginValido = await respostaLogin(cookie, totpValido);
conferir('cookie válido com TOTP válido cria sessão', loginValido.status === 200 &&
  loginValido.body.ok === true && typeof loginValido.body.token === 'string' && admin.sessoesAtivas() === 1);

const health = await fetch(`http://127.0.0.1:${servidor.address().port}/api/health`);
const healthBody = await health.json();
conferir('/api/health alcançável pela Function/Express', health.status === 200 && healthBody.ok === true && healthBody.banco.tipo === 'supabase');
const loginFunction = await fetch(`http://127.0.0.1:${servidor.address().port}/api/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: totpValido })
});
conferir('/api/admin/login alcançável pela Function e protegido pelo backend', loginFunction.status === 404);

await new Promise((resolve) => servidor.close(resolve));
rmSync(pastaTemp, { recursive: true, force: true });
globalThis.fetch = fetchOriginal;
console.log('RESULTADO: OK — Basic no proxy, cookie validado no backend e login TOTP protegido.');
