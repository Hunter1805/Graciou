#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   GRACIOU — testes da validação do checkout (CPF e CEP).

   Não sobe servidor e não toca em serviço externo: o ViaCEP é
   substituído por um `fetch` falso. Roda com:

     node scripts/testar-validacao-checkout.js

   Cobre exatamente os quatro cenários pedidos:
     - CPF válido
     - CPF inválido (dígitos verificadores, sequência repetida,
       formato incompleto)
     - CEP válido (preenche estado, cidade, bairro e rua)
     - CEP inexistente (devolve "não encontrado", sem exceção)
   e mais: cache (não repetir consulta) e ViaCEP fora do ar.
   ══════════════════════════════════════════════════════════════ */
'use strict';

const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const CPF = require(path.join(RAIZ, 'assets', 'graciou-cpf.js'));
const CEP = require(path.join(RAIZ, 'assets', 'graciou-cep.js'));

let falhas = 0;
let total = 0;

function teste(nome, condicao, detalhe) {
  total++;
  if (condicao) {
    console.log('  ok   ' + nome);
  } else {
    falhas++;
    console.log('  FALHA ' + nome + (detalhe ? ' → ' + detalhe : ''));
  }
}

/* ─────────────────────────────────────────────
   1. CPF
   ───────────────────────────────────────────── */
console.log('\nCPF');

console.log(' máscara');
teste('mascara 8 dígitos', CPF.mascara('12345678') === '123.456.78', CPF.mascara('12345678'));
teste('mascara 11 dígitos', CPF.mascara('12345678901') === '123.456.789-01', CPF.mascara('12345678901'));
teste('mascara ignora letras', CPF.mascara('abc123.456.789-01xyz') === '123.456.789-01', CPF.mascara('abc123.456.789-01xyz'));

console.log(' válidos');
// CPFs com dígitos verificadores corretos, usados só como dado de teste.
teste('529.982.247-25', CPF.valido('529.982.247-25') === true);
teste('52998224725 (sem pontuação)', CPF.valido('52998224725') === true);
teste('111.444.777-35', CPF.valido('111.444.777-35') === true);
teste('mensagem vazia para CPF válido', CPF.mensagem('529.982.247-25') === '', CPF.mensagem('529.982.247-25'));

console.log(' inválidos');
teste('vazio → pede o CPF', CPF.mensagem('') === 'Informe seu CPF.');
teste('incompleto → mensagem clara', CPF.mensagem('123.456.789').indexOf('incompleto') !== -1, CPF.mensagem('123.456.789'));
teste('incompleto não é válido', CPF.valido('123.456.789') === false);
teste('dígito verificador errado', CPF.valido('529.982.247-24') === false);
teste('dígito verificador errado (2º)', CPF.valido('529.982.247-35') === false);
teste('dígito errado → mensagem de inválido', CPF.mensagem('529.982.247-24') === 'CPF inválido. Confira os números e digite novamente.', CPF.mensagem('529.982.247-24'));
teste('sequência repetida 000.000.000-00', CPF.valido('000.000.000-00') === false);
teste('sequência repetida 111.111.111-11', CPF.valido('111.111.111-11') === false);
teste('sequência repetida → mensagem de repetidos', CPF.mensagem('111.111.111-11') === 'CPF inválido: não use números repetidos.', CPF.mensagem('111.111.111-11'));
teste('só zeros puros', CPF.valido('00000000000') === false);
teste('letras misturadas não formam CPF', CPF.valido('529.982.247-AB') === false);

/* ─────────────────────────────────────────────
   2. CEP — ViaCEP simulado
   ───────────────────────────────────────────── */
console.log('\nCEP');

teste('mascara 8 dígitos', CEP.mascara('01310100') === '01310-100', CEP.mascara('01310100'));
teste('mascara parcial', CEP.mascara('01310') === '01310', CEP.mascara('01310'));
teste('URL do ViaCEP montada corretamente',
  CEP.urls('01310100').json === 'https://viacep.com.br/ws/01310100/json/',
  CEP.urls('01310100').json);

/* fetch falso: conta chamadas e responde conforme o CEP. */
function fetchFalso(mapa) {
  const chamadas = [];
  function impl(url) {
    chamadas.push(url);
    const cep = String(url).match(/ws\/(\d{8})\//);
    const chave = cep ? cep[1] : '';
    const resposta = mapa[chave];
    if (resposta === 'rede') return Promise.reject(new Error('rede fora'));
    if (resposta === 'http500') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    if (!resposta) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ erro: true }) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(resposta) });
  }
  impl.chamadas = chamadas;
  return impl;
}

const VIA_CEP_SAO_PAULO = {
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  bairro: 'Bela Vista',
  localidade: 'São Paulo',
  uf: 'SP'
};

(async function () {
  /* CEP válido */
  {
    CEP.limparCache();
    const f = fetchFalso({ '01310100': VIA_CEP_SAO_PAULO });
    const r = await CEP.consultar('01310-100', f);
    teste('CEP válido → ok', r.ok === true);
    teste('CEP válido → UF', r.estado === 'SP', r.estado);
    teste('CEP válido → cidade', r.cidade === 'São Paulo', r.cidade);
    teste('CEP válido → bairro', r.bairro === 'Bela Vista', r.bairro);
    teste('CEP válido → rua', r.rua === 'Avenida Paulista', r.rua);
    teste('CEP válido → uma única chamada', f.chamadas.length === 1, String(f.chamadas.length));

    /* Mesmo CEP de novo: cache, sem nova consulta. */
    const r2 = await CEP.consultar('01310100', f);
    teste('cache → não repete a consulta', f.chamadas.length === 1, String(f.chamadas.length));
    teste('cache → mesma resposta', r2.ok === true && r2.cidade === 'São Paulo');
  }

  /* CEP inexistente */
  {
    CEP.limparCache();
    const f = fetchFalso({});
    const r = await CEP.consultar('99999-999', f);
    teste('CEP inexistente → não encontrado', r.ok === false && r.motivo === 'nao_encontrado', JSON.stringify(r));
    teste('CEP inexistente → não lança exceção', true);
    /* Falha NÃO entra no cache: uma nova tentativa é permitida. */
    const r2 = await CEP.consultar('99999-999', f);
    teste('não encontrado pode ser tentado de novo', f.chamadas.length === 2, String(f.chamadas.length));
    teste('segunda tentativa também tratada', r2.ok === false && r2.motivo === 'nao_encontrado');
  }

  /* CEP incompleto: nem chega na rede */
  {
    CEP.limparCache();
    const f = fetchFalso({});
    const r = await CEP.consultar('01310', f);
    teste('CEP incompleto → motivo incompleto', r.ok === false && r.motivo === 'incompleto', JSON.stringify(r));
    teste('CEP incompleto → nenhuma chamada de rede', f.chamadas.length === 0, String(f.chamadas.length));
  }

  /* ViaCEP indisponível: rede, HTTP 500 e JSON quebrado */
  {
    CEP.limparCache();
    const rede = await CEP.consultar('01310100', fetchFalso({ '01310100': 'rede' }));
    teste('ViaCEP fora do ar (rede) → falha tratada', rede.ok === false && rede.motivo === 'falha', JSON.stringify(rede));

    CEP.limparCache();
    const http = await CEP.consultar('01310100', fetchFalso({ '01310100': 'http500' }));
    teste('ViaCEP HTTP 500 → falha tratada', http.ok === false && http.motivo === 'falha', JSON.stringify(http));

    CEP.limparCache();
    const quebrado = fetchFalso({});
    const falso = (url) => { quebrado(url); return Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('JSON inválido')) }); };
    const json = await CEP.consultar('01310100', falso);
    teste('ViaCEP JSON inválido → falha tratada', json.ok === false && json.motivo === 'falha', JSON.stringify(json));

    CEP.limparCache();
    const semFetch = await CEP.consultar('01310100', null);
    teste('sem fetch disponível → falha tratada (não quebra)', semFetch.ok === false && semFetch.motivo === 'falha', JSON.stringify(semFetch));
  }

  console.log('\n' + (total - falhas) + '/' + total + ' verificações passaram.');
  if (falhas) {
    console.error(falhas + ' falha(s).');
    process.exit(1);
  }
})();
