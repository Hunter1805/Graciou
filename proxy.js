import { next } from '@vercel/functions';

const encoder = new TextEncoder();
const COOKIE_BARRIERA = 'graciou_admin_gate';
const DURACAO_COOKIE_SEGUNDOS = 10 * 60;

function base64url(bytes) {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/=/g, '').replace(/[+]/g, '-').replace(/[/]/g, '_');
}

function decodificarBase64url(valor) {
  if (!/^[A-Za-z0-9_-]+$/.test(valor)) return null;
  try {
    const base64 = valor.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - valor.length % 4) % 4);
    const binario = atob(base64);
    return Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
  } catch (_) {
    return null;
  }
}

async function assinatura(valor) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(valor))));
}

async function iguaisEmTempoConstante(a, b) {
  const [hashA, hashB] = await Promise.all([assinatura(a), assinatura(b)]);
  let diferente = 0;
  for (let i = 0; i < hashA.length; i += 1) diferente |= hashA[i] ^ hashB[i];
  return diferente === 0;
}

async function chaveDaBarreira(usuario, senha) {
  const material = JSON.stringify(['GRACIOU_ADMIN_GATE_HMAC_V1', usuario, senha]);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(material)));
}

async function assinar(payload, usuario, senha) {
  const chave = await crypto.subtle.importKey(
    'raw', await chaveDaBarreira(usuario, senha), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', chave, encoder.encode(payload)));
}

async function criarCookieBarreira(usuario, senha, agoraMs = Date.now()) {
  const agora = Math.floor(agoraMs / 1000);
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = base64url(encoder.encode(JSON.stringify({
    iat: agora,
    exp: agora + DURACAO_COOKIE_SEGUNDOS,
    nonce
  })));
  const assinatura = base64url(await assinar(payload, usuario, senha));
  return `${COOKIE_BARRIERA}=${payload}.${assinatura}; Max-Age=${DURACAO_COOKIE_SEGUNDOS}; Path=/api/admin/login; HttpOnly; Secure; SameSite=Strict`;
}

function valorCookie(request) {
  const cookies = String(request.headers.get('cookie') || '').split(';');
  const encontrados = cookies.map((parte) => parte.trim()).filter((parte) => parte.startsWith(COOKIE_BARRIERA + '='));
  if (encontrados.length !== 1) return null;
  return encontrados[0].slice(COOKIE_BARRIERA.length + 1);
}

async function cookieBarreiraValido(request, usuario, senha, agoraMs = Date.now()) {
  const valor = valorCookie(request);
  if (!valor || valor.length > 1024) return false;

  const partes = valor.split('.');
  if (partes.length !== 2) return false;
  const payloadBytes = decodificarBase64url(partes[0]);
  const assinaturaBytes = decodificarBase64url(partes[1]);
  if (!payloadBytes || !assinaturaBytes || assinaturaBytes.length !== 32) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch (_) {
    return false;
  }

  const agora = Math.floor(agoraMs / 1000);
  if (!payload || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
      payload.iat > agora + 30 || payload.exp <= agora || payload.exp <= payload.iat ||
      payload.exp - payload.iat > DURACAO_COOKIE_SEGUNDOS || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce || '')) {
    return false;
  }

  const chave = await crypto.subtle.importKey(
    'raw', await chaveDaBarreira(usuario, senha), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', chave, assinaturaBytes, encoder.encode(partes[0]));
}

function credenciaisBasicas(request) {
  const cabecalho = String(request.headers.get('authorization') || '');
  if (!cabecalho.startsWith('Basic ')) return null;

  try {
    const texto = atob(cabecalho.slice(6));
    const separador = texto.indexOf(':');
    if (separador < 0) return null;
    return {
      usuario: texto.slice(0, separador),
      senha: texto.slice(separador + 1)
    };
  } catch (_) {
    return null;
  }
}

function respostaPrivada(status, corpo, headers = {}) {
  return new Response(corpo, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...headers
    }
  });
}

export default async function proxy(request) {
  const usuarioEsperado = String(process.env.ADMIN_GATE_USER || '');
  const senhaEsperada = String(process.env.ADMIN_GATE_PASSWORD || '');

  /* Falha fechada: sem as duas variáveis, a existência do painel não é confirmada. */
  if (!usuarioEsperado || !senhaEsperada) {
    return respostaPrivada(404, 'Página não encontrada.');
  }

  const recebidas = credenciaisBasicas(request);
  const usuarioOk = recebidas
    ? await iguaisEmTempoConstante(recebidas.usuario, usuarioEsperado)
    : false;
  const senhaOk = recebidas
    ? await iguaisEmTempoConstante(recebidas.senha, senhaEsperada)
    : false;

  const caminho = new URL(request.url).pathname;

  if (caminho === '/admin.html') {
    if (!usuarioOk || !senhaOk) {
      return respostaPrivada(401, 'Acesso restrito.', {
        'WWW-Authenticate': 'Basic realm="GRACIOU Backstage", charset="UTF-8"'
      });
    }

    const cookie = await criarCookieBarreira(usuarioEsperado, senhaEsperada);
    const headers = new Headers({ 'Set-Cookie': cookie });
    const resposta = next({ headers });
    /* Mantém o cookie também no cabeçalho de resposta emitido pelo middleware. */
    resposta.headers.set('Set-Cookie', cookie);
    return resposta;
  }

  if (caminho === '/api/admin/login') {
    if (!await cookieBarreiraValido(request, usuarioEsperado, senhaEsperada)) {
      return respostaPrivada(401, 'Acesso restrito.');
    }
    return next();
  }

  return respostaPrivada(404, 'Página não encontrada.');
}

export const __test = { criarCookieBarreira };
