'use strict';
const C = require('../dados/catalogo.js');
const R = require('../backend/regras.js');
const assert = require('node:assert/strict');

for (const uf of ['SP', 'PR', 'RJ']) assert.equal(C.frete([{ quantidade: 1 }], uf).valor, 1799);
for (const uf of ['BA', 'DF', 'AM']) assert.equal(C.frete([{ quantidade: 1 }], uf).valor, 2499);
assert.equal(C.frete([{ quantidade: 2 }], 'XX').valor, 0);
assert.equal(C.frete([{ quantidade: 1 }, { quantidade: 1 }], 'XX').valor, 0);
assert.equal(C.frete([{ quantidade: 1 }], 'sp').uf, 'SP');
assert.equal(C.descontoCupom('BEMVINDO10', 10000).desconto, 1000);
assert.equal(C.calcularPedido([{ id: 'tee-raizes', quantidade: 1 }], 'pix', 'SP', 'BEMVINDO10').total, 10790);
assert.equal(C.calcularPedido([{ id: 'tee-raizes', quantidade: 1 }], 'cartao', 'SP', 'BEMVINDO10').total, 11690);
assert.throws(() => R.validarCorpo({ cliente: { nome: 'x', email: 'x@y.com', telefone: '11987654321', cpf: '12345678901' }, endereco: { cep: '01310100', estado: 'XX', cidade: 'x', bairro: 'x', rua: 'x', numero: '1' }, itens: [{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }] }));
const entrada = R.validarCorpo({ cliente: { nome: 'x', email: 'x@y.com', telefone: '11987654321', cpf: '12345678901' }, endereco: { cep: '01310100', estado: 'sp', cidade: 'x', bairro: 'x', rua: 'x', numero: '1' }, itens: [{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }], frete: 1 });
assert.equal(R.montarPedido(entrada).pedido.frete, 1799);
console.log('OK — frete regional, UFs, cupons, formas de pagamento e adulteração passaram.');
