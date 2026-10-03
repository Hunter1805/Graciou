'use strict';

/* O flag precisa existir antes de qualquer require do backend: isso impede
   que o fallback SQLite seja carregado no bundle/runtime serverless. */
process.env.VERCEL = '1';

/* Na Vercel, as variáveis já vêm do painel. O .env local é opcional e só é
   lido quando existir; nunca é necessário para carregar a Function. */
try {
  require('../backend/env').carregar();
} catch (_) {}

let app;
let erroDeInicializacao = null;
try {
  app = require('../backend/servidor').app;
} catch (erro) {
  erroDeInicializacao = erro;
}

/* Exporta uma função handler explicitamente. Assim a Vercel não precisa
   inferir o adaptador Express e falhas de carregamento viram JSON seguro. */
module.exports = function handler(req, res) {
  if (erroDeInicializacao || !app) {
    return res.status(500).json({
      ok: false,
      erro: 'A API não pôde ser inicializada.'
    });
  }
  try {
    return app(req, res);
  } catch (_) {
    if (res.headersSent) return res.end();
    return res.status(500).json({ ok: false, erro: 'Erro interno no servidor.' });
  }
};
