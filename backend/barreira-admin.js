'use strict';

const crypto = require('node:crypto');

const NOME_COOKIE = 'graciou_admin_gate';
const DURACAO_MAX_SEGUNDOS = 10 * 60;
const encoder = new TextEncoder();

function base64urlParaBuffer(valor) {
  if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(valor)) return null;
  try {
    const base64 = valor.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - valor.length % 4) % 4);
    return Buffer.from(base64, 'base64');
  } catch (_) {
    return null;
  }
}

function cookieDoCabecalho(cabecalho) {
  const encontrados = String(cabecalho || '').split(';')
    .map((parte) => parte.trim())
    .filter((parte) => parte.startsWith(NOME_COOKIE + '='));
  if (encontrados.length !== 1) return null;
  const valor = encontrados[0].slice(NOME_COOKIE.length + 1);
  return valor && valor.length <= 1024 ? valor : null;
}

function chaveDaBarreira(usuario, senha) {
  const material = JSON.stringify(['GRACIOU_ADMIN_GATE_HMAC_V1', usuario, senha]);
  return crypto.createHash('sha256').update(material, 'utf8').digest();
}

function assinaturaValida(payload, assinaturaInformada, usuario, senha) {
  const chave = chaveDaBarreira(usuario, senha);
  const assinaturaEsperada = crypto.createHmac('sha256', chave).update(payload, 'utf8').digest();
  const assinaturaRecebida = base64urlParaBuffer(assinaturaInformada);
  if (!assinaturaRecebida || assinaturaRecebida.length !== assinaturaEsperada.length) return false;
  return crypto.timingSafeEqual(assinaturaEsperada, assinaturaRecebida);
}

function validarCookieBarreira(cabecalhoCookie, agoraMs = Date.now()) {
  const usuario = String(process.env.ADMIN_GATE_USER || '');
  const senha = String(process.env.ADMIN_GATE_PASSWORD || '');
  if (!usuario || !senha) return false;

  const valor = cookieDoCabecalho(cabecalhoCookie);
  if (!valor) return false;
  const partes = valor.split('.');
  if (partes.length !== 2) return false;

  const payloadBytes = base64urlParaBuffer(partes[0]);
  if (!payloadBytes || !assinaturaValida(partes[0], partes[1], usuario, senha)) return false;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch (_) {
    return false;
  }

  const agora = Math.floor(agoraMs / 1000);
  if (!payload || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
      payload.iat > agora + 30 || payload.exp <= agora || payload.exp <= payload.iat ||
      payload.exp - payload.iat > DURACAO_MAX_SEGUNDOS || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce || '')) {
    return false;
  }

  return true;
}

module.exports = {
  validarCookieBarreira,
  _test: { cookieDoCabecalho, chaveDaBarreira, DURACAO_MAX_SEGUNDOS }
};
