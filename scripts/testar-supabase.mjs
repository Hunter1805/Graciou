import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('../backend/env').carregar();
const supabase = require('../backend/supabase');
const estado = supabase.validarConfiguracao();

function diagnosticarEnv() {
  const arquivo = path.join(process.cwd(), '.env');
  const linhas = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8').split(/\r?\n/) : [];
  const linha = (nome) => linhas.find((item) => new RegExp(`^\\s*${nome}\\s*=`).test(item));
  const valorDaLinha = (item) => item ? item.slice(item.indexOf('=') + 1) : '';
  const urlBruta = valorDaLinha(linha('SUPABASE_URL'));
  const chaveBruta = valorDaLinha(linha('SUPABASE_SERVICE_ROLE_KEY'));
  const chaveNormalizada = chaveBruta.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  return {
    urlValida: /^https:\/\/[^/\s=]+\.supabase\.co$/.test(urlBruta.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '')),
    chavePresente: chaveNormalizada.length > 0
  };
}

/* Saída deliberadamente booleana: jamais imprime URL, chave ou resposta bruta. */
console.log(JSON.stringify(diagnosticarEnv()));

if (!estado.completa) {
  console.error('Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente da API.');
  process.exitCode = 2;
} else {
  try {
    const resultado = await supabase.testarCupons();
    console.log(JSON.stringify({
      endpoint: resultado.endpoint,
      headersEnviados: resultado.headerNames,
      statusHttp: resultado.statusHttp
    }));
    if (!resultado.bemVindo10) process.exitCode = 3;
  } catch (erro) {
    console.error(JSON.stringify({
      endpoint: erro.endpoint || null,
      headersEnviados: erro.headerNames || null,
      statusHttp: Number.isInteger(erro.status) ? erro.status : null,
      erro: erro.message,
      codigoTecnico: erro.codigo || null,
      corpoErroSanitizado: erro.detalheTecnico || null
    }));
    process.exitCode = 4;
  }
}


