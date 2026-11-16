import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../backend/admin.js');
const barreira = require('../backend/barreira-admin.js');

function conferir(nome, condicao) {
  if (!condicao) throw new Error('Falhou: ' + nome);
  console.log('OK — ' + nome);
}

/* Vetor público do RFC 6238 para HMAC-SHA1 em 59 segundos.
   O RFC usa 8 dígitos (94287082); os seis últimos são 287082. */
const segredoRfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const passo = Math.floor(59000 / 30000);
conferir('vetor RFC 6238', admin.codigoTotp(segredoRfc, passo) === '287082');
conferir('código atual aceito', admin.conferirTotp('287082', segredoRfc, 59000));
conferir('código vizinho aceito pela tolerância', admin.conferirTotp('287082', segredoRfc, 59000 + 30000));
conferir('código incorreto recusado', !admin.conferirTotp('000000', segredoRfc, 59000));
conferir('formato inválido recusado', !admin.conferirTotp('28708', segredoRfc, 59000));

process.env.ADMIN_TOTP_SECRET = segredoRfc;
const codigoAtual = admin.codigoTotp(segredoRfc, Math.floor(Date.now() / 30000));

conferir('credencial TOTP aceita', admin.conferirCredenciais(codigoAtual).ok);
conferir('TOTP errado recusado', !admin.conferirCredenciais('000000').ok);

const usuarioOriginal = process.env.ADMIN_GATE_USER;
const senhaOriginal = process.env.ADMIN_GATE_PASSWORD;
process.env.ADMIN_GATE_USER = 'usuario-barreira-teste';
process.env.ADMIN_GATE_PASSWORD = 'senha-barreira-falsa-somente-para-testes';
conferir('barreira falha fechada sem cookie', !barreira.validarCookieBarreira(''));
process.env.ADMIN_GATE_USER = '';
conferir('barreira falha fechada sem credenciais', !barreira.validarCookieBarreira('graciou_admin_gate=payload.assinatura'));
if (usuarioOriginal === undefined) delete process.env.ADMIN_GATE_USER;
else process.env.ADMIN_GATE_USER = usuarioOriginal;
if (senhaOriginal === undefined) delete process.env.ADMIN_GATE_PASSWORD;
else process.env.ADMIN_GATE_PASSWORD = senhaOriginal;

console.log('RESULTADO: OK — TOTP administrativo e falha fechada da barreira validados.');
