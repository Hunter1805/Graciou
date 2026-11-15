import crypto from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');

  let saida = '';
  for (let i = 0; i < bits.length; i += 5) {
    saida += ALFABETO[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return saida;
}

const conta = String(process.argv[2] || 'administrador').trim() || 'administrador';
const segredo = base32(crypto.randomBytes(20));
const uri = 'otpauth://totp/' + encodeURIComponent('GRACIOU:' + conta) +
  '?secret=' + segredo + '&issuer=GRACIOU&algorithm=SHA1&digits=6&period=30';

console.log('\nGRACIOU — configuração do Google Authenticator\n');
console.log('Chave para cadastrar manualmente no aplicativo:');
console.log(segredo);
console.log('\nVariável da Vercel: ADMIN_TOTP_SECRET');
console.log('\nURI compatível com aplicativos autenticadores:');
console.log(uri);
console.log('\nIMPORTANTE: não envie esta chave por mensagem, não tire print e não a salve no Git.');
