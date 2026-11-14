import { next } from '@vercel/functions';

const encoder = new TextEncoder();

async function assinatura(valor) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(valor))));
}

async function iguaisEmTempoConstante(a, b) {
  const [hashA, hashB] = await Promise.all([assinatura(a), assinatura(b)]);
  let diferente = 0;
  for (let i = 0; i < hashA.length; i += 1) diferente |= hashA[i] ^ hashB[i];
  return diferente === 0;
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

  if (!usuarioOk || !senhaOk) {
    return respostaPrivada(401, 'Acesso restrito.', {
      'WWW-Authenticate': 'Basic realm="GRACIOU Backstage", charset="UTF-8"'
    });
  }

  return next();
}
