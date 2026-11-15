import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../backend/admin.js');

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

console.log('RESULTADO: OK — TOTP administrativo validado.');
