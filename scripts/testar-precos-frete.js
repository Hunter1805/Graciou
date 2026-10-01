/**
 * ═══════════════════════════════════════════════════════════════
 * GRACIOU — TESTE DAS REGRAS DE PREÇO E FRETE
 * Arquivo: scripts/testar-precos-frete.js
 * ═══════════════════════════════════════
 *
 * Uso:  node scripts/testar-precos-frete.js
 *
 * Cobre os cenários pedidos:
 *   1. uma camiseta no Pix;
 *   2. uma camiseta no cartão;
 *   3. um short;
 *   4. duas peças com frete grátis (2 camisetas e 1 camiseta + 1 short).
 *
 * Sai com código 1 se algum cenário divergir do esperado.
 */

'use strict';

const path = require('path');
const C = require(path.join(__dirname, '..', 'dados', 'catalogo.js'));

let falhas = 0;
const ok = (msg) => console.log('  \u2713 ' + msg);
const erro = (msg) => { falhas++; console.log('  \u2717 ' + msg); };

function conferir(rotulo, recebido, esperado) {
  const igual = JSON.stringify(recebido) === JSON.stringify(esperado);
  if (igual) ok(`${rotulo} = ${JSON.stringify(recebido)}`);
  else erro(`${rotulo} = ${JSON.stringify(recebido)} (esperado ${JSON.stringify(esperado)})`);
}

const CAMISETA = 'tee-raizes';      // Camiseta Oversized Suedine 220g
const DRYFIT = 'dryfit-move';       // Camiseta Dryfit
const SHORT = 'short-move';         // Short 2 em 1

console.log('\nGRACIOU — teste de preços e frete');
console.log('=================================\n');

/* ── 0. Configuração declarada ── */
console.log('0) Configuração do catálogo');
conferir('META.precosConfirmados', C.META.precosConfirmados, true);
conferir('META.freteGratisAtivo', C.META.freteGratisAtivo, true);
conferir('META.freteGratisQuantidadeMinima', C.META.freteGratisQuantidadeMinima, 2);
conferir('META.frete.valoresPorGrupo.sulSudesteSP', C.META.frete.valoresPorGrupo.sulSudesteSP, 1799);
conferir('META.frete.valoresPorGrupo.centroOesteNordesteNorte', C.META.frete.valoresPorGrupo.centroOesteNordesteNorte, 2499);
console.log('');

/* ── 1. Uma camiseta no Pix ── */
console.log('1) Uma camiseta no Pix');
conferir(`precoVenda(${CAMISETA})`, C.busca(CAMISETA).precoVenda, 9990);
conferir('formatado', C.formatarPreco(C.precoPorForma(CAMISETA, 'pix')), 'R$ 99,90');
const p1 = C.calcularPedido([{ id: CAMISETA, quantidade: 1 }], 'pix', 'SP');
conferir('peças', p1.pecas, 1);
conferir('subtotal', p1.subtotal, 9990);
conferir('subtotalFormatado', p1.subtotalFormatado, 'R$ 99,90');
conferir('frete grátis?', p1.freteGratis, false);
conferir('valor do frete SP', p1.frete.valor, 1799);
conferir('total SP', p1.total, 11789);
conferir('totalPendente', p1.totalPendente, false);
console.log('');

/* ── 2. Uma camiseta no cartão ── */
console.log('2) Uma camiseta no cartão');
conferir(`precoCartao(${CAMISETA})`, C.busca(CAMISETA).precoCartao, 10990);
conferir('formatado', C.formatarPreco(C.precoPorForma(CAMISETA, 'cartao')), 'R$ 109,90');
const p2 = C.calcularPedido([{ id: CAMISETA, quantidade: 1 }], 'cartao', 'SP');
conferir('peças', p2.pecas, 1);
conferir('subtotal', p2.subtotal, 10990);
conferir('subtotalFormatado', p2.subtotalFormatado, 'R$ 109,90');
conferir('frete grátis?', p2.freteGratis, false);
conferir('total SP', p2.total, 12789);
console.log('');

/* ── 3. Um short (Pix e cartão têm o mesmo valor) ── */
console.log('3) Um short');
conferir(`precoVenda(${SHORT})`, C.busca(SHORT).precoVenda, 7990);
conferir(`precoCartao(${SHORT})`, C.busca(SHORT).precoCartao, 7990);
conferir('formatado (pix)', C.formatarPreco(C.precoPorForma(SHORT, 'pix')), 'R$ 79,90');
conferir('formatado (cartão)', C.formatarPreco(C.precoPorForma(SHORT, 'cartao')), 'R$ 79,90');
const p3 = C.calcularPedido([{ id: SHORT, quantidade: 1 }], 'pix', 'BA');
conferir('peças', p3.pecas, 1);
conferir('subtotal', p3.subtotal, 7990);
conferir('frete grátis?', p3.freteGratis, false);
conferir('frete BA', p3.frete.valor, 2499);
conferir('total BA', p3.total, 10489);
console.log('');

/* ── 4. Duas peças com frete grátis ── */
console.log('4) Duas peças com frete grátis');
conferir('freteGratis(2)', C.freteGratis(2), true);
conferir('freteGratis(1)', C.freteGratis(1), false);

console.log('  4a) Duas camisetas (2 peças)');
const p4a = C.calcularPedido([
  { id: CAMISETA, quantidade: 1 },
  { id: DRYFIT, quantidade: 1 }
], 'pix');
conferir('peças', p4a.pecas, 2);
conferir('subtotal', p4a.subtotal, 19980);
conferir('frete grátis?', p4a.freteGratis, true);
conferir('valor do frete', p4a.frete.valor, 0);
conferir('total', p4a.total, 19980);
conferir('totalFormatado', p4a.totalFormatado, 'R$ 199,80');
conferir('totalPendente', p4a.totalPendente, false);

console.log('  4b) Uma camiseta + um short (2 peças)');
const p4b = C.calcularPedido([
  { id: CAMISETA, quantidade: 1 },
  { id: SHORT, quantidade: 1 }
], 'pix');
conferir('peças', p4b.pecas, 2);
conferir('subtotal', p4b.subtotal, 17980);
conferir('frete grátis?', p4b.freteGratis, true);
conferir('valor do frete', p4b.frete.valor, 0);
conferir('total', p4b.total, 17980);
conferir('totalFormatado', p4b.totalFormatado, 'R$ 179,80');

console.log('  4c) Duas camisetas no cartão (2 peças)');
const p4c = C.calcularPedido([
  { id: CAMISETA, quantidade: 2 }
], 'cartao');
conferir('peças', p4c.pecas, 2);
conferir('subtotal', p4c.subtotal, 21980);
conferir('frete grátis?', p4c.freteGratis, true);
conferir('totalFormatado', p4c.totalFormatado, 'R$ 219,80');

console.log('  4d) Três peças (continua grátis)');
const p4d = C.calcularPedido([{ id: SHORT, quantidade: 3 }], 'pix');
conferir('peças', p4d.pecas, 3);
conferir('frete grátis?', p4d.freteGratis, true);
conferir('totalFormatado', p4d.totalFormatado, 'R$ 239,70');
console.log('');

/* ── 5. Tabela dos 8 produtos ── */
console.log('5) Tabela de preços dos 8 produtos');
C.lista().forEach((p) => {
  const t = C.tabelaDePrecos(p);
  console.log(`  · ${p.id.padEnd(20)} ${p.tipo.padEnd(30)} Pix ${t.pixFormatado}  Cartão ${t.cartaoFormatado}`);
});
conferir('produtos no catálogo', C.lista().length, 8);
console.log('');

/* ── Resultado ── */
if (falhas > 0) {
  console.log(`RESULTADO: FALHOU com ${falhas} divergência(s).\n`);
  process.exit(1);
}
console.log('RESULTADO: OK — preços e frete conferem com a tabela oficial.\n');