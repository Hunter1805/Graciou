'use strict';

/* Acesso mínimo ao Supabase. A chave secreta só é lida no backend e nunca
   é incluída em logs, respostas ou dados enviados ao frontend. */

function configuracao() {
  const urlBruta = String(process.env.SUPABASE_URL || '').trim();
  const url = urlBruta.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  return {
    url: url,
    serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  };
}

function validarConfiguracao() {
  const config = configuracao();
  return {
    url: Boolean(config.url),
    serviceRoleKey: Boolean(config.serviceRoleKey),
    completa: Boolean(config.url && config.serviceRoleKey)
  };
}

async function lerCupons() {
  const config = configuracao();
  const endpoint = config.url + '/rest/v1/cupons?select=codigo';
  const nomesHeaders = ['apikey', 'Authorization', 'Accept-Profile'];
  const sanitizar = (texto) => String(texto || '')
    .replace(config.serviceRoleKey, '[REDACTED]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .slice(0, 240)
    .replace(/[\r\n]+/g, " ");
  if (!config.url || !config.serviceRoleKey) {
    const erro = new Error('Supabase não configurado.');
    erro.codigo = 'SUPABASE_CONFIG ausente';
    throw erro;
  }

  let resposta;
  try {
    resposta = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: 'Bearer ' + config.serviceRoleKey,
        'Accept-Profile': 'public'
      }
    });
  } catch (causa) {
    const erro = new Error('Falha de rede ao consultar o Supabase.');
    erro.codigo = causa && causa.cause && causa.cause.code
      ? String(causa.cause.code)
      : 'FETCH_FAILED';
    erro.endpoint = endpoint;
    erro.headerNames = nomesHeaders;
    throw erro;
  }

  const corpo = await resposta.text();
  if (!resposta.ok) {
    const erro = new Error('Supabase recusou a leitura de public.cupons.');
    erro.status = resposta.status;
    erro.endpoint = endpoint;
    erro.headerNames = nomesHeaders;
    erro.detalheTecnico = sanitizar(corpo);
    throw erro;
  }

  try {
    return JSON.parse(corpo);
  } catch (_) {
    const erro = new Error('Supabase devolveu uma resposta JSON inválida.');
    erro.status = resposta.status;
    erro.endpoint = endpoint;
    erro.headerNames = nomesHeaders;
    throw erro;
  }
}

async function testarCupons() {
  const config = configuracao();
  const cupons = await lerCupons();
  return {
    conectado: true,
    statusHttp: 200,
    endpoint: config.url + '/rest/v1/cupons?select=codigo',
    headerNames: ['apikey', 'Authorization', 'Accept-Profile'],
    bemVindo10: cupons.some((cupom) => String(cupom.codigo || '').toUpperCase() === 'BEMVINDO10')
  };
}

module.exports = { configuracao, validarConfiguracao, lerCupons, testarCupons };
