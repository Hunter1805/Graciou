'use strict';

/* O flag precisa existir antes de qualquer require do backend: isso impede
   que o fallback SQLite seja carregado no bundle/runtime serverless. */
process.env.VERCEL = '1';

/* Na Vercel, as variáveis já vêm do painel. O handler não tenta ler .env:
   isso mantém o carregamento independente de arquivos locais. */
let app;
let erroDeInicializacao = null;
try {
  app = require('../backend/servidor').app;
  } catch (erro) {
    erroDeInicializacao = erro;
    console.error('[graciou-api] falha ao carregar Function:', erro && erro.name ? erro.name : 'Error');
  }

function ehHealth(req) {
  const caminho = String(req && req.url || '').split('?')[0];
  return caminho === '/api/health' || caminho === '/health';
}

function responderHealthIndisponivel(res) {
  return res.status(503).json({
    status: 'ERRO',
    ok: false,
    servico: 'graciou-api',
    erro: 'Health check indisponível.'
  });
}

/* Exporta uma função handler explicitamente. Assim a Vercel não precisa
   inferir o adaptador Express e falhas de carregamento viram JSON seguro. */
module.exports = function handler(req, res) {
  if (erroDeInicializacao || !app) {
    if (ehHealth(req)) return responderHealthIndisponivel(res);
    return res.status(500).json({
      ok: false,
      erro: 'A API não pôde ser inicializada.'
    });
  }
  try {
    return app(req, res);
  } catch (erro) {
    console.error('[graciou-api] falha ao processar requisição:', erro && erro.name ? erro.name : 'Error');
    if (res.headersSent) return res.end();
    return res.status(500).json({ ok: false, erro: 'Erro interno no servidor.' });
  }
};
