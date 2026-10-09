/**
 * ═══════════════════════════════════════
 * GRACIOU — TESTE DO ACOMPANHAMENTO DE PEDIDO
 * Arquivo: scripts/testar-acompanhamento.mjs
 * ═══════════════════════════════════════
 *
 * Sobe a API local (backend/servidor.js) com um banco SQLite TEMPORÁRIO
 * e um painel admin configurado. Depois valida a consulta pública de
 * acompanhamento ponta a ponta:
 *
 *   1. consulta correta → 200 com número, status, linha do tempo;
 *   2. combinação incorreta (e-mail errado / número inexistente) → 404
 *      com mensagem GENÉRICA (não revela qual campo falhou);
 *   3. pedido sem rastreio → "sem rastreio" na resposta;
 *   4. atualização manual pelo painel → aparece na consulta do cliente;
 *   5. histórico gravado com data/hora e ordem cronológica;
 *   6. a resposta NUNCA expõe CPF, telefone, e-mail, endereço completo
 *      nem observação interna;
 *   7. link de rastreio inválido (http) é RECUSADO pelo painel;
 *   8. limite de tentativas por IP.
 *
 * Nada toca o banco real: tudo é removido no final.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = 3988;
const BASE = `http://127.0.0.1:${PORTA}`;

const pastaTemp = mkdtempSync(join(tmpdir(), 'graciou-acomp-'));
const CAMINHO_BANCO = join(pastaTemp, 'teste.sqlite');

let falhas = 0;
const ok = (condicao, texto) => {
  if (condicao) {
    console.log(`  [ok] ${texto}`);
  } else {
    falhas += 1;
    console.log(`  [FALHOU] ${texto}`);
  }
};

const servidor = spawn(process.execPath, ['--no-warnings', 'backend/servidor.js'], {
  cwd: RAIZ,
  env: {
    ...process.env,
    PORT: String(PORTA),
    GRACIOU_DB: CAMINHO_BANCO,
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    BREVO_API_KEY: '',
    BREVO_SENDER_EMAIL: '',
    MP_ACCESS_TOKEN: '',
    ADMIN_EMAIL: 'admin@graciou.local',
    ADMIN_PASSWORD: 'senha-de-teste-forte'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logServidor = '';
servidor.stdout.on('data', (d) => { logServidor += String(d); });
servidor.stderr.on('data', (d) => { logServidor += String(d); });

const encerrar = () => {
  try { servidor.kill(); } catch (_) { }
  try { rmSync(pastaTemp, { recursive: true, force: true }); } catch (_) { }
};
process.on('exit', encerrar);
process.on('SIGINT', () => { encerrar(); process.exit(1); });

async function esperarApi() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch (_) { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const EMAIL_CLIENTE = 'cliente-acompanhamento@exemplo.local';

const pedidoTemporario = {
  cliente: {
    nome: 'Cliente Acompanhamento',
    email: EMAIL_CLIENTE,
    telefone: '(11) 91234-5678',
    cpf: '111.444.777-35'
  },
  endereco: {
    cep: '01310-100',
    estado: 'SP',
    cidade: 'São Paulo',
    bairro: 'Bela Vista',
    rua: 'Avenida Paulista',
    numero: '1000',
    complemento: 'Apto 42'
  },
  itens: [{ productId: 'tee-raizes', tamanho: 'M', quantidade: 2 }],
  pagamento: { forma: 'pix' }
};

async function consultar(numero, email) {
  const r = await fetch(`${BASE}/api/orders/tracking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero, email })
  });
  return { status: r.status, corpo: await r.json() };
}

let idPedido = null;
let tokenAdmin = null;

try {
  console.log('1) Servidor de teste');
  const subiu = await esperarApi();
  ok(subiu, `API respondeu em ${BASE}`);
  if (!subiu) {
    console.log(logServidor);
    throw new Error('API de teste não subiu.');
  }

  console.log('\n2) Criação do pedido de teste');
  const criado = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedidoTemporario)
  }).then((r) => r.json());
  idPedido = criado.id;
  ok(!!idPedido, `pedido criado: ${idPedido}`);
  ok(criado.pedido.statusPedido === 'aguardando_pagamento', 'pedido nasce em aguardando_pagamento (pagamento NÃO marcado como confirmado)');
  ok(criado.pedido.pagamento.status === 'aguardando', 'status de pagamento nasce como aguardando');

  console.log('\n3) Consulta correta (número + e-mail)');
  const correta = await consultar(idPedido, EMAIL_CLIENTE);
  ok(correta.status === 200 && correta.corpo.ok === true, 'consulta correta devolve 200');
  ok(correta.corpo.pedido.numero === idPedido, 'resposta traz o número do pedido');
  ok(correta.corpo.pedido.status === 'aguardando_pagamento', 'resposta traz o status atual');
  ok(Array.isArray(correta.corpo.pedido.linhaDoTempo), 'resposta traz a linha do tempo');
  ok(correta.corpo.pedido.linhaDoTempo.length === 5, 'a linha do tempo tem as 5 etapas oficiais');
  const recebido = correta.corpo.pedido.linhaDoTempo[0];
  ok(recebido.chave === 'recebido' && recebido.registrada === true && !!recebido.data, 'etapa "Pedido recebido" registrada com data');
  const naoRegistrada = correta.corpo.pedido.linhaDoTempo.filter((e) => !e.registrada);
  ok(naoRegistrada.length === 4, 'as demais etapas NÃO têm data (nada inventado)');

  console.log('\n4) Privacidade da resposta');
  const texto = JSON.stringify(correta.corpo);
  ok(!texto.includes('111.444.777-35'), 'CPF não aparece na resposta');
  ok(!texto.includes('91234-5678'), 'telefone não aparece na resposta');
  ok(!texto.includes(EMAIL_CLIENTE), 'e-mail não é devolvido');
  ok(!texto.includes('Avenida Paulista') && !texto.includes('Bela Vista'), 'endereço completo não aparece');
  ok(!texto.includes('Apto 42'), 'complemento do endereço não aparece');
  ok(!/mp_payment_id|mpPaymentId|mercadoPago/i.test(texto), 'dados internos de pagamento não aparecem');

  console.log('\n5) Pedido sem rastreio');
  ok(correta.corpo.pedido.rastreio.disponivel === false, 'rastreio marcado como indisponível');
  ok(correta.corpo.pedido.rastreio.codigo === null, 'sem código de rastreio');

  console.log('\n6) Combinação incorreta');
  const emailErrado = await consultar(idPedido, 'outro@exemplo.local');
  ok(emailErrado.status === 404 && emailErrado.corpo.ok === false, 'e-mail errado devolve 404');
  const numeroErrado = await consultar('GR-19000101-9999-ZZZZ', EMAIL_CLIENTE);
  ok(numeroErrado.status === 404 && numeroErrado.corpo.ok === false, 'número inexistente devolve 404');
  ok(emailErrado.corpo.erro === numeroErrado.corpo.erro, 'mensagem GENÉRICA é idêntica nos dois casos');
  ok(!/e-mail|email/i.test(emailErrado.corpo.erro) || /número e e-mail/.test(emailErrado.corpo.erro), 'mensagem não revela qual campo falhou');

  console.log('\n7) Login admin + atualização manual');
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@graciou.local', senha: 'senha-de-teste-forte' })
  }).then((r) => r.json());
  tokenAdmin = login.token;
  ok(!!tokenAdmin, 'login admin devolveu token');

  const cabecalhosAdmin = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokenAdmin };

  /* Link http:// deve ser RECUSADO. */
  const linkInvalido = await fetch(`${BASE}/api/admin/orders/${idPedido}`, {
    method: 'PATCH',
    headers: cabecalhosAdmin,
    body: JSON.stringify({ rastreioUrl: 'http://inseguro.exemplo.com/rastreio' })
  });
  ok(linkInvalido.status === 400, 'link http:// é recusado (400)');

  /* Atualização válida: status + transportadora + código + link https + observação pública. */
  const atualizacao = await fetch(`${BASE}/api/admin/orders/${idPedido}`, {
    method: 'PATCH',
    headers: cabecalhosAdmin,
    body: JSON.stringify({
      statusPedido: 'enviado',
      transportadora: 'Correios',
      rastreio: 'BR123456789BR',
      rastreioUrl: 'https://rastreamento.correios.com.br/app/index.php',
      observacaoPublica: 'Seu pedido saiu do ateliê.'
    })
  }).then((r) => r.json());
  ok(atualizacao.ok === true, 'atualização do painel aceita');
  ok(Array.isArray(atualizacao.historico) && atualizacao.historico.length >= 2, 'histórico devolvido ao painel');

  console.log('\n8) Atualização manual aparece na consulta do cliente');
  const depois = await consultar(idPedido, EMAIL_CLIENTE);
  ok(depois.status === 200, 'consulta continua respondendo');
  ok(depois.corpo.pedido.status === 'enviado', 'status atualizado aparece na consulta');
  ok(depois.corpo.pedido.rastreio.disponivel === true, 'rastreio agora disponível');
  ok(depois.corpo.pedido.rastreio.codigo === 'BR123456789BR', 'código de rastreio exposto');
  ok(depois.corpo.pedido.rastreio.transportadora === 'Correios', 'transportadora exposta');
  ok(String(depois.corpo.pedido.rastreio.url).startsWith('https://'), 'link de rastreio HTTPS exposto');
  ok(depois.corpo.pedido.observacaoPublica === 'Seu pedido saiu do ateliê.', 'observação pública aparece');
  const enviado = depois.corpo.pedido.linhaDoTempo.find((e) => e.chave === 'enviado');
  ok(enviado && enviado.registrada === true && !!enviado.data, 'etapa "Enviado" agora tem data registrada');
  ok(enviado.atual === true, 'etapa "Enviado" marcada como atual');

  console.log('\n9) Histórico em ordem cronológica e sem observação interna');
  const datas = depois.corpo.pedido.linhaDoTempo.filter((e) => e.registrada).map((e) => e.data);
  const ordenado = datas.slice().sort();
  ok(JSON.stringify(datas) === JSON.stringify(ordenado), 'datas em ordem cronológica');

  /* Observação INTERNA não pode vazar para a consulta pública. */
  await fetch(`${BASE}/api/admin/orders/${idPedido}`, {
    method: 'PATCH',
    headers: cabecalhosAdmin,
    body: JSON.stringify({ observacoes: 'NOTA-INTERNA-SECRETA', observacoesModo: 'adicionar' })
  });
  const comInterna = await consultar(idPedido, EMAIL_CLIENTE);
  ok(!JSON.stringify(comInterna.corpo).includes('NOTA-INTERNA-SECRETA'), 'observação interna NÃO aparece na consulta');

  console.log('\n10) Cancelamento tratado à parte');
  await fetch(`${BASE}/api/admin/orders/${idPedido}`, {
    method: 'PATCH',
    headers: cabecalhosAdmin,
    body: JSON.stringify({ statusPedido: 'cancelado' })
  });
  const cancelado = await consultar(idPedido, EMAIL_CLIENTE);
  ok(cancelado.corpo.pedido.cancelado === true, 'consulta sinaliza cancelamento');
  ok(cancelado.corpo.pedido.status === 'cancelado', 'status cancelado exposto');

  console.log('\n11) Limite de tentativas por IP');
  let bloqueado = false;
  for (let i = 0; i < 15; i += 1) {
    const r = await consultar('GR-19000101-0000-XXXX', 'ninguem@exemplo.local');
    if (r.status === 429) { bloqueado = true; break; }
  }
  ok(bloqueado, 'após várias tentativas, a API responde 429');

  console.log('\n12) Limpeza — remoção do pedido temporário');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  process.env.GRACIOU_DB = CAMINHO_BANCO;
  const db = require(join(RAIZ, 'backend', 'db.js'));
  db.abrir().prepare('DELETE FROM orders WHERE id = :id').run({ id: idPedido });
  ok(!db.buscarPedido(idPedido), 'pedido temporário removido');
  db.fechar();
} catch (erro) {
  falhas += 1;
  console.log(`\n  [ERRO] ${erro && erro.message ? erro.message : erro}`);
  console.log(logServidor.slice(-2000));
} finally {
  encerrar();
  await new Promise((r) => setTimeout(r, 300));
  try { rmSync(pastaTemp, { recursive: true, force: true }); } catch (_) { }
  console.log(falhas === 0 ? '\nRESULTADO: todos os testes passaram.' : `\nRESULTADO: ${falhas} teste(s) falharam.`);
  console.log(`Pasta temporária removida: ${!existsSync(pastaTemp)}`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
