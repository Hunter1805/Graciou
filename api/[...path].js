'use strict';

/* Vercel Function catch-all para preservar exatamente as rotas /api/* do
   Express existente. Em produção, o repositório seleciona Supabase porque
   SUPABASE_SERVICE_ROLE_KEY é obrigatória no ambiente da Function. */
require('../backend/env').carregar();

if (!process.env.VERCEL && process.env.NODE_ENV === 'production') {
  process.env.VERCEL = '1';
}

const { app } = require('../backend/servidor');

module.exports = app;
