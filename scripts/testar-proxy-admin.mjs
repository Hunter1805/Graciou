import { createRequire } from 'node:module';
import proxy, { __test } from '../proxy.js';

const admin = createRequire(import.meta.url)('../backend/admin.js');
process.env.ADMIN_TOTP_SECRET = '';
const USUARIO_QA = 'usuario-barreira-teste';
const SENHA_QA = 'senha-barreira-falsa-somente-para-testes';
const COOKIE_NOME = 'graciou_admin_gate';

process.env.ADMIN_GATE_USER = USUARIO_QA;
process.env.ADMIN_GATE_PASSWORD = SENHA_QA;

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

async function respostaLogin(cookie, authorization) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (authorization) headers.Authorization = authorization;
  return proxy(new Request('https://graciou.example/api/admin/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ codigo: 'invalid-code' })
  }));
}

function valorDoSetCookie(cabecalho) {
  return String(cabecalho || '').split(';', 1)[0];
}

const semAutenticacao = await proxy(requisicao('/admin.html'));
conferir('primeira visita sem autenticação responde 401', semAutenticacao.status === 401 &&
  (semAutenticacao.headers.get('content-type') || '').startsWith('text/plain'));

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

const semCookie = await respostaLogin(null);
conferir('sem cookie e sem Basic a rota de login é recusada', semCookie.status === 401 &&
  (semCookie.headers.get('content-type') || '').startsWith('text/plain'));

const cookieValido = await respostaLogin(cookie);
conferir('cookie válido deixa o POST seguir para o backend TOTP',
  cookieValido.headers.get('x-middleware-next') === '1');

const basicValido = await respostaLogin(null, basic(USUARIO_QA, SENHA_QA));
conferir('Basic válido permite chegar ao backend TOTP',
  basicValido.headers.get('x-middleware-next') === '1');
const basicInvalido = await respostaLogin(null, basic(USUARIO_QA, 'senha-incorreta-de-teste'));
conferir('Basic inválido é recusado mesmo com código enviado', basicInvalido.status === 401 &&
  (basicInvalido.headers.get('content-type') || '').startsWith('text/plain'));
conferir('proxy autoriza Basic, mas backend exige TOTP configurado',
  basicValido.headers.get('x-middleware-next') === '1' &&
  !admin.conferirCredenciais('invalid-code').ok);

const valor = cookie.slice((COOKIE_NOME + '=').length);
const partesValor = valor.split('.');
const assinaturaAlterada = (partesValor[1][0] === 'A' ? 'B' : 'A') + partesValor[1].slice(1);
const cookieAlterado = await respostaLogin(COOKIE_NOME + '=' + partesValor[0] + '.' + assinaturaAlterada);
conferir('cookie adulterado recusado', cookieAlterado.status === 401 &&
  (cookieAlterado.headers.get('content-type') || '').startsWith('text/plain'));

const expiradoSetCookie = await __test.criarCookieBarreira(
  USUARIO_QA, SENHA_QA, Date.now() - (11 * 60 * 1000)
);
const cookieExpirado = await respostaLogin(valorDoSetCookie(expiradoSetCookie));
conferir('cookie expirado recusado', cookieExpirado.status === 401 &&
  (cookieExpirado.headers.get('content-type') || '').startsWith('text/plain'));

console.log('RESULTADO: OK — barreiras Basic e TOTP encadeadas com cookie temporário.');
