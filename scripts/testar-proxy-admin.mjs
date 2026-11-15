import proxy, { __test } from '../proxy.js';

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

async function respostaLogin(cookie) {
  return proxy(requisicao('/api/admin/login', cookie ? { Cookie: cookie } : {}));
}

function valorDoSetCookie(cabecalho) {
  return String(cabecalho || '').split(';', 1)[0];
}

const semBasic = await proxy(requisicao('/admin.html'));
conferir('acesso a /admin.html sem Basic bloqueado', semBasic.status === 401 &&
  (semBasic.headers.get('content-type') || '').startsWith('text/plain'));

const autorizada = await proxy(requisicao('/admin.html', {
  Authorization: basic(USUARIO_QA, SENHA_QA)
}));
const setCookie = autorizada.headers.get('set-cookie') || '';
const cookie = valorDoSetCookie(setCookie);
conferir('Basic correto permite a página e emite cookie', autorizada.headers.get('x-middleware-next') === '1' &&
  cookie.startsWith(COOKIE_NOME + '='));
conferir('cookie tem HttpOnly, Secure, SameSite=Strict e Path restrito',
  /(?:^|;\s*)HttpOnly(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)Secure(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)SameSite=Strict(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)Path=\/api\/admin\/login(?:;|$)/i.test(setCookie) &&
  /(?:^|;\s*)Max-Age=600(?:;|$)/i.test(setCookie));
const conteudoCookie = cookie.slice((COOKIE_NOME + '=').length).split('.')[0];
const payloadCookie = atob(conteudoCookie.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - conteudoCookie.length % 4) % 4));
conferir('cookie não contém usuário nem senha em texto puro',
  !payloadCookie.includes(USUARIO_QA) && !payloadCookie.includes(SENHA_QA));

const semCookie = await respostaLogin(null);
conferir('login TOTP sem cookie de barreira recusado', semCookie.status === 401 &&
  (semCookie.headers.get('content-type') || '').startsWith('text/plain'));
const apenasBasic = await proxy(requisicao('/api/admin/login', {
  Authorization: basic(USUARIO_QA, SENHA_QA)
}));
conferir('Basic sozinho não substitui o cookie na rota de login', apenasBasic.status === 401);

const cookieValido = await respostaLogin(cookie);
conferir('cookie válido deixa o POST seguir para o backend TOTP',
  cookieValido.headers.get('x-middleware-next') === '1');

const valor = cookie.slice((COOKIE_NOME + '=').length);
const partesValor = valor.split('.');
const assinaturaAlterada = (partesValor[1][0] === 'A' ? 'B' : 'A') + partesValor[1].slice(1);
const cookieAlterado = await respostaLogin(COOKIE_NOME + '=' + partesValor[0] + '.' + assinaturaAlterada);
conferir('cookie alterado recusado', cookieAlterado.status === 401 &&
  (cookieAlterado.headers.get('content-type') || '').startsWith('text/plain'));

const expiradoSetCookie = await __test.criarCookieBarreira(
  USUARIO_QA, SENHA_QA, Date.now() - (11 * 60 * 1000)
);
const cookieExpirado = await respostaLogin(valorDoSetCookie(expiradoSetCookie));
conferir('cookie expirado recusado', cookieExpirado.status === 401 &&
  (cookieExpirado.headers.get('content-type') || '').startsWith('text/plain'));

console.log('RESULTADO: OK — barreiras Basic e TOTP encadeadas com cookie temporário.');
