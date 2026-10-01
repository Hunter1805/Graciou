/**
 * ═══════════════════════════════════════
 * GRACIOU — VERIFICAÇÃO DO CATÁLOGO
 * Arquivo: scripts/verificar-catalogo.js
 * ═══════════════════════════════════════════════════════════════
 *
 * Uso:  node scripts/verificar-catalogo.js
 *
 * Confirma que:
 *   1. todos os IDs de produto são únicos;
 *   2. todos os slugs são únicos;
 *   3. existem exatamente os 8 produtos oficiais do Drop 01;
 *   4. os campos obrigatórios estão presentes em todos os produtos;
 *   5. nenhum preço foi inventado (precoVenda null ou confirmado).
 *
 * Sai com código 1 se houver qualquer erro. Útil como verificação
 * rápida antes de cada commit.
 */

'use strict';

const path = require('path');
const CATALOGO = require(path.join(__dirname, '..', 'dados', 'catalogo.js'));

const ESPERADOS = [
  'tee-graca-permanece',
  'tee-firmado',
  'tee-sagrado',
  'tee-pela-graca',
  'tee-raizes',
  'dryfit-move',
  'dryfit-forte-serena',
  'short-move'
];

let falhas = 0;
const ok = (msg) => console.log('  \u2713 ' + msg);
const erro = (msg) => { falhas++; console.log('  \u2717 ' + msg); };

console.log('\nGRACIOU — verificação do catálogo central');
console.log('=========================================\n');

/* ── 1. Integridade declarada pelo próprio catálogo ── */
console.log('1) Integridade do catálogo');
const problemas = CATALOGO.verificarIntegridade();
if (problemas.length === 0) {
  ok('nenhum problema encontrado');
} else {
  problemas.forEach(erro);
}
console.log('');

/* ── 2. Unicidade de IDs ── */
console.log('2) Unicidade de IDs');
const ids = CATALOGO.PRODUTOS.map((p) => p.id);
const idsUnicos = new Set(ids);
if (idsUnicos.size === ids.length) {
  ok(`${ids.length} IDs, todos únicos`);
} else {
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  erro(`IDs duplicados: ${[...new Set(dup)].join(', ')}`);
}

const semId = CATALOGO.PRODUTOS.filter((p) => !p.id || !String(p.id).trim());
if (semId.length === 0) ok('nenhum produto sem id'); else erro(`${semId.length} produto(s) sem id`);
console.log('');

/* ── 3. Unicidade de slugs ── */
console.log('3) Unicidade de slugs');
const slugs = CATALOGO.PRODUTOS.map((p) => p.slug);
if (new Set(slugs).size === slugs.length) ok(`${slugs.length} slugs, todos únicos`);
else erro('há slugs duplicados');
console.log('');

/* ── 4. Os 8 produtos oficiais ── */
console.log('4) Produtos oficiais do Drop 01');
if (CATALOGO.PRODUTOS.length === 8) ok('catálogo contém exatamente 8 produtos');
else erro(`esperado 8 produtos, encontrado ${CATALOGO.PRODUTOS.length}`);

ESPERADOS.forEach((id) => {
  if (CATALOGO.busca(id)) ok(`presente: ${id}`);
  else erro(`AUSENTE: ${id}`);
});

/* IDs que não deveriam mais existir */
const proibidos = ['tee-graca'];
proibidos.forEach((id) => {
  const encontrados = CATALOGO.PRODUTOS.filter((p) => p.id === id);
  if (encontrados.length === 0) ok(`id ambíguo removido: ${id}`);
  else erro(`id ainda presente no catálogo: ${id}`);
});
console.log('');

/* ── 5. Campos obrigatórios ── */
console.log('5) Campos obrigatórios por produto');
let camposOk = true;
CATALOGO.PRODUTOS.forEach((p) => {
  const faltando = CATALOGO.CAMPOS_OBRIGATORIOS.filter((c) => !(c in p));
  if (faltando.length) {
    camposOk = false;
    erro(`[${p.id}] faltando: ${faltando.join(', ')}`);
  }
});
if (camposOk) ok(`todos os produtos têm os ${CATALOGO.CAMPOS_OBRIGATORIOS.length} campos obrigatórios`);
console.log('');

/* ── 6. Nenhum preço inventado ── */
console.log('6) Preços (nenhum valor inventado)');
const semConfirmacao = CATALOGO.PRODUTOS.filter((p) => !p.precoConfirmado);
const comPreco = CATALOGO.PRODUTOS.filter((p) => p.precoVenda !== null);
if (comPreco.length === 0) {
  ok(`nenhum preço de venda definido — ${semConfirmacao.length} produtos aguardando tabela da YouDraw`);
} else if (comPreco.every((p) => p.precoConfirmado === true)) {
  ok(`${comPreco.length} preço(s) definidos e explicitamente confirmados`);
} else {
  erro('há preço definido sem confirmação — possível preço inventado');
}
console.log('');

/* ── Resultado ── */
const r = CATALOGO.resumo();
console.log('Resumo');
console.log(`  produtos: ${r.total} (${r.ativos} ativos, ${r.inativos} inativos)`);
console.log(`  IDs únicos: ${r.idsUnicos === r.total ? 'sim' : 'NÃO'}`);
console.log('');

if (falhas > 0) {
  console.log(`RESULTADO: FALHOU com ${falhas} problema(s).\n`);
  process.exit(1);
}
console.log('RESULTADO: OK — catálogo íntegro e com IDs únicos.\n');