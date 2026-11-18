/**
 * ═══════════════════════════════════════════════════════════════
 * GRACIOU — TESTE DE REGRESSÃO DE ACESSIBILIDADE E CONTRASTE
 * Arquivo: scripts/testar-acessibilidade-admin.mjs
 * ═══════════════════════════════════════════════════════════════
 *
 * Valida:
 *   1. Presença dos tokens sólidos de contraste em admin.html:
 *      --texto-principal: #171A14;
 *      --texto-secundario: #454A38;
 *      --texto-auxiliar: #5A6048;
 *      --borda-visivel: #A9AD83;
 *      --fundo-campo: #FFFEEE;
 *      --foco: #394927;
 *   2. Rejeição de cores de texto com opacidade baixa legada:
 *      rgba(26,26,26,.35), rgba(26,26,26,.4), rgba(26,26,26,.45),
 *      rgba(26,26,26,.5), rgba(26,26,26,.55), rgba(26,26,26,.6)
 *   3. Inputs/selects/textareas usam fundo claro sólido e foco de 2px
 *   4. Link de rastreio estilizado com classe e contraste
 *   5. Cálculo matemático do contraste WCAG dos tokens sobre o fundo #FDFDD0
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');

function conferir(nome, condicao) {
  assert.ok(condicao, `Falhou: ${nome}`);
  console.log(`OK — ${nome}`);
}

/* 1. Tokens requeridos */
const tokensEsperados = [
  '--texto-principal: #171A14',
  '--texto-secundario: #454A38',
  '--texto-auxiliar: #5A6048',
  '--borda-visivel: #A9AD83',
  '--fundo-campo: #FFFEEE',
  '--foco: #394927'
];

for (const token of tokensEsperados) {
  const [chave, valor] = token.split(': ');
  const regex = new RegExp(`${chave}\\s*:\\s*${valor}`, 'i');
  conferir(`token ${chave} definido com valor correto (${valor})`, regex.test(html));
}

/* 2. Rejeição estrita das opacidades baixas legadas em textos */
const padroesOpacidadeBaixa = [
  /rgba\(\s*26\s*,\s*26\s*,\s*26\s*,\s*\.35\s*\)/i,
  /rgba\(\s*26\s*,\s*26\s*,\s*26\s*,\s*\.4\s*\)/i,
  /rgba\(\s*26\s*,\s*26\s*,\s*26\s*,\s*0?\.45\s*\)/i,
  /rgba\(\s*26\s*,\s*26\s*,\s*26\s*,\s*0?\.5\s*\)/i,
  /rgba\(\s*26\s*,\s*26\s*,\s*26\s*,\s*0?\.55\s*\)/i,
  /rgba\(\s*26\s*,\s*26\s*,\s*26\s*,\s*0?\.6\s*\)/i
];

for (const padrao of padroesOpacidadeBaixa) {
  conferir(`nenhum texto com opacidade excessivamente baixa (${padrao})`, !padrao.test(html));
}

/* 3. Estilização de campos, placeholders e foco */
conferir('inputs usam var(--fundo-campo)', html.includes('background:var(--fundo-campo)'));
conferir('inputs usam var(--borda-visivel)', html.includes('border:1px solid var(--borda-visivel)'));
conferir('inputs usam var(--texto-principal)', html.includes('color:var(--texto-principal)'));
conferir('inputs têm estilo de foco com 2px e var(--foco)',
  /outline:2px solid var\(--foco\)/.test(html) && /border:2px solid var\(--foco\)/.test(html));
conferir('placeholders visíveis configurados com var(--texto-auxiliar)',
  html.includes('input::placeholder') && html.includes('color:var(--texto-auxiliar)'));

/* 4. Labels, dicas e aviso de pagamento automático */
conferir('labels usam var(--texto-principal)',
  /\.campo__label\s*\{[^}]*color:var\(--texto-principal\)/.test(html));
conferir('dicas usam var(--texto-auxiliar)',
  /\.campo__dica\s*\{[^}]*color:var\(--texto-auxiliar\)/.test(html));
conferir('aviso de pagamento automático tem destaque visual com foco',
  /\.campo__aviso-pagamento\s*\{[^}]*border-left:3px solid var\(--foco\)/.test(html));

/* 5. Link de rastreio */
conferir('link de rastreio usa classe com foco e hover destacados',
  html.includes('.pb-link-rastreio') && html.includes('pb-link-rastreio:hover') &&
  html.includes('pb-link-rastreio:focus-visible'));

/* 6. Validação matemática de contraste WCAG (Luminância relativa) */
function luminancia(hex) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const sRGB = [r, g, b].map((val) => {
    const canal = val / 255;
    return canal <= 0.03928 ? canal / 12.92 : Math.pow((canal + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

function razaoContraste(hex1, hex2) {
  const l1 = luminancia(hex1);
  const l2 = luminancia(hex2);
  const maisClaro = Math.max(l1, l2);
  const maisEscuro = Math.min(l1, l2);
  return (maisClaro + 0.05) / (maisEscuro + 0.05);
}

const fundoEcru = '#FDFDD0';
const cPrincipal = razaoContraste('#171A14', fundoEcru);
const cSecundario = razaoContraste('#454A38', fundoEcru);
const cAuxiliar = razaoContraste('#5A6048', fundoEcru);
const cFoco = razaoContraste('#394927', fundoEcru);

conferir(`contraste texto principal (#171A14 / #FDFDD0) = ${cPrincipal.toFixed(2)}:1 >= 7:1 (AAA)`, cPrincipal >= 7);
conferir(`contraste texto secundário (#454A38 / #FDFDD0) = ${cSecundario.toFixed(2)}:1 >= 4.5:1 (AA)`, cSecundario >= 4.5);
conferir(`contraste texto auxiliar (#5A6048 / #FDFDD0) = ${cAuxiliar.toFixed(2)}:1 >= 4.5:1 (AA)`, cAuxiliar >= 4.5);
conferir(`contraste elemento foco (#394927 / #FDFDD0) = ${cFoco.toFixed(2)}:1 >= 3:1 (UI componente)`, cFoco >= 3);

console.log('\nRESULTADO: OK — todos os critérios de acessibilidade e legibilidade validados.');
