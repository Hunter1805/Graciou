'use strict';

/* Carregador mínimo de .env, sem dependência externa. Nunca substitui
   variáveis já definidas pelo processo/ambiente de execução. */
const fs = require('node:fs');
const path = require('node:path');

function carregar(caminho) {
  const arquivo = caminho || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(arquivo)) return false;
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const indice = linha.indexOf('=');
    if (indice < 1) continue;
    const nome = linha.slice(0, indice).trim();
    let valor = linha.slice(indice + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, nome)) process.env[nome] = valor;
  }
  return true;
}

module.exports = { carregar };
