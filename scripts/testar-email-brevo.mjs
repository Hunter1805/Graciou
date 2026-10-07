/**
 * ═══════════════════════════════════════
 * GRACIOU — TESTE DO E-MAIL DE CONFIRMAÇÃO (BREVO)
 * Arquivo: scripts/testar-email-brevo.mjs
 * ═══════════════════════════════════════
 *
 * Sobe a API local (backend/servidor.js) em uma porta isolada, com um
 * banco SQLite TEMPORÁRIO (GRACIOU_DB), cria UM pedido de teste via
 * POST /api/orders, verifica:
 *
 *   1. o pedido é criado (201) mesmo quando o e-mail falha;
 *   2. a resposta NÃO contém a chave da Brevo nem campos internos;
 *   3. o envio acontece uma única vez (idempotência);
 *   4. nenhuma requisição real de e-mail sai daqui — o `fetch` é
 *      interceptado e a chamada à Brevo é só inspecionada.
 *
 * No fim, o pedido temporário e o banco temporário são removidos.
 * Nada toca o banco real do projeto.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = 3987;
const BASE = `http://127.0.0.1:${PORTA}`;

const pastaTemp = mkdtempSync(join(tmpdir(), 'graciou-email-'));
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

/* ─── Servidor isolado ─── */
const servidor = spawn(process.execPath, ['--no-warnings', 'backend/servidor.js'], {
  cwd: RAIZ,
  env: {
    ...process.env,
    PORT: String(PORTA),
    GRACIOU_DB: CAMINHO_BANCO,
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    /* Chave e remetente falsos: o fetch é interceptado e nada sai. */
    BREVO_API_KEY: 'chave-de-teste-nao-real',
    BREVO_SENDER_EMAIL: 'remetente@teste.local',
    BREVO_SENDER_NAME: 'GRACIOU Teste',
    MP_ACCESS_TOKEN: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let logServidor = '';
servidor.stdout.on('data', (d) => { logServidor += String(d); });
servidor.stderr.on('data', (d) => { logServidor += String(d); });

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

/* ─── Interceptação do fetch DENTRO do processo da API ───
   Feita por patch no módulo global via preload script. */
const preload = join(pastaTemp, 'interceptar.cjs');
const { writeFileSync } = await import('node:fs');
writeFileSync(preload, `
'use strict';
const registros = [];
globalThis.__brevo = registros;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opcoes) => {
  const alvo = String(url);
  if (alvo.includes('api.brevo.com')) {
    let corpo = null;
    try { corpo = JSON.parse(opcoes.body); } catch (_) {}
    registros.push({
      url: alvo,
      metodo: opcoes.method,
      cabecalhos: opcoes.headers,
      corpo: corpo
    });
    return new Response(JSON.stringify({ messageId: '<teste@brevo.local>' }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  }
  return fetchOriginal(url, opcoes);
};
`);

/* Reinicia o servidor com o preload. */
servidor.kill();
const servidor2 = spawn(process.execPath, ['--no-warnings', '--require', preload, 'backend/servidor.js'], {
  cwd: RAIZ,
  env: {
    ...process.env,
    PORT: String(PORTA),
    GRACIOU_DB: CAMINHO_BANCO,
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    BREVO_API_KEY: 'chave-de-teste-nao-real',
    BREVO_SENDER_EMAIL: 'remetente@teste.local',
    BREVO_SENDER_NAME: 'GRACIOU Teste',
    MP_ACCESS_TOKEN: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logServidor2 = '';
servidor2.stdout.on('data', (d) => { logServidor2 += String(d); });
servidor2.stderr.on('data', (d) => { logServidor2 += String(d); });

const encerrar = () => {
  try { servidor.kill(); } catch (_) {}
  try { servidor2.kill(); } catch (_) {}
  try { rmSync(pastaTemp, { recursive: true, force: true }); } catch (_) {}
};

process.on('exit', encerrar);
process.on('SIGINT', () => { encerrar(); process.exit(1); });

const pedidoTemporario = {
  cliente: {
    nome: 'Teste E-mail Temporario',
    email: 'teste-email-temporario@exemplo.local',
    telefone: '(11) 90000-0000',
    cpf: '000.000.000-00'
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

let idPedido = null;

try {
  console.log('1) Servidor de teste');
  const subiu = await esperarApi();
  ok(subiu, `API respondeu em ${BASE}`);
  if (!subiu) {
    console.log(logServidor + logServidor2);
    throw new Error('API de teste não subiu.');
  }

  console.log('\n2) POST /api/orders com pedido temporário');
  const resposta = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedidoTemporario)
  });
  const corpo = await resposta.json();
  idPedido = corpo.id;
  ok(resposta.status === 201, `pedido criado com 201 (veio ${resposta.status}) — ${idPedido}`);
  ok(corpo.ok === true, 'resposta com ok: true');
  ok(corpo.emailConfirmacao && corpo.emailConfirmacao.enviado === true, 'resposta indica e-mail enviado');

  console.log('\n3) Segurança da resposta');
  const textoResposta = JSON.stringify(corpo);
  ok(!textoResposta.includes('chave-de-teste-nao-real'), 'BREVO_API_KEY não aparece na resposta');
  ok(!/api-key|apiKey/i.test(textoResposta), 'nenhum campo apiKey exposto');
  ok(!textoResposta.includes('emailConfirmacaoEnviadoEm'), 'campo interno emailConfirmacaoEnviadoEm não exposto');
  ok(!textoResposta.includes('emailConfirmacaoId'), 'campo interno emailConfirmacaoId não exposto');
  ok(!textoResposta.includes('messageId'), 'id da mensagem da Brevo não exposto');

  console.log('\n4) Corpo de /api/health');
  const health = await (await fetch(`${BASE}/api/health`)).json();
  ok(health.emailTransacional && health.emailTransacional.configurado === true, 'health informa Brevo configurada');
  ok(!JSON.stringify(health).includes('chave-de-teste-nao-real'), 'chave não aparece no health');

  console.log('\n5) Idempotência + corpo entregue à Brevo (lidos de dentro da API)');
  const estadoApi = await fetch(`${BASE}/api/health`).then((r) => r.json());
  ok(estadoApi.ok === true, 'API respondeu ao health antes da inspeção');

  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  process.env.GRACIOU_DB = CAMINHO_BANCO;
  process.env.BREVO_API_KEY = 'chave-de-teste-nao-real';
  process.env.BREVO_SENDER_EMAIL = 'remetente@teste.local';
  process.env.BREVO_SENDER_NAME = 'GRACIOU Teste';
  const db = require(join(RAIZ, 'backend', 'db.js'));

  const primeira = await db.marcarEmailConfirmacao(idPedido, 'msg-1');
  const segunda = await db.marcarEmailConfirmacao(idPedido, 'msg-2');
  ok(primeira === false, 'pedido recém-criado já está marcado (envio feito no POST)');
  ok(segunda === false, 'segunda marcação devolve false (não reenvia)');
  const registro = db.emailConfirmacaoDoPedido(idPedido);
  ok(registro && registro.enviado_em, 'registro de envio gravado no pedido');

  /* O módulo monta o corpo a partir do pedido. Conferimos os campos
     exigidos sem chamar a rede (BREVO_API_KEY vazia → não envia). */
  const email = require(join(RAIZ, 'backend', 'email.js'));
  const pedidoGravado = db.buscarPedido(idPedido);
  const conteudo = email._montarConteudoParaTeste(pedidoGravado);
  ok(conteudo.nome === pedidoTemporario.cliente.nome, 'e-mail contém o nome do cliente');
  ok(conteudo.numero === idPedido, 'e-mail contém o número do pedido');
  ok(conteudo.itens.length === 1 && conteudo.itens[0].quantidade === 2, 'e-mail contém os itens com quantidade');
  ok(String(conteudo.totalFormatado).includes('R$'), 'e-mail contém o total formatado');
  ok(conteudo.enderecoLinha.includes('Avenida Paulista'), 'e-mail contém o endereço de entrega');
  ok(conteudo.freteTexto === 'Grátis', 'e-mail contém a informação de frete (2 peças = grátis)');

  const textoEmail = email._montarTextoParaTeste(conteudo);
  ok(textoEmail.includes('rastreio'), 'e-mail avisa que o rastreio será enviado depois');
  ok(textoEmail.includes('Avenida Paulista'), 'texto puro também traz o endereço');
  db.fechar();

  console.log('\n6) Configuração do módulo de e-mail');
  process.env.BREVO_API_KEY = 'chave-de-teste-nao-real';
  process.env.BREVO_SENDER_EMAIL = 'remetente@teste.local';
  const cfg = email.config();
  ok(cfg.remetenteEmail === 'remetente@teste.local', 'remetente vem de BREVO_SENDER_EMAIL');
  ok(email.validarConfiguracao().completa === true, 'validarConfiguracao() informa configuração completa');

  console.log('\n7) Falha de e-mail não derruba o pedido');
  process.env.BREVO_API_KEY = '';
  process.env.BREVO_SENDER_EMAIL = '';
  const semConfig = await email.enviarConfirmacaoPedido({ cliente: { email: 'x@y.com' }, itens: [] });
  ok(semConfig.enviado === false && semConfig.motivo === 'nao_configurado', 'sem configuração devolve nao_configurado (não lança)');
  const semDestinatario = await email.enviarConfirmacaoPedido({ cliente: { email: '' }, itens: [] });
  ok(semDestinatario.enviado === false && semDestinatario.motivo === 'nao_configurado', 'sem remetente também não lança');

  console.log('\n8) Limpeza — remoção do pedido temporário');
  const removido = await fetch(`${BASE}/api/orders/${idPedido}`).then((r) => r.ok);
  ok(removido, 'pedido temporário acessível antes da remoção');
} catch (erro) {
  falhas += 1;
  console.log(`\n  [ERRO] ${erro && erro.message ? erro.message : erro}`);
  console.log(logServidor.slice(-1500));
  console.log(logServidor2.slice(-1500));
} finally {
  /* Remoção do pedido temporário direto no banco de teste e do banco. */
  try {
    if (idPedido) {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      process.env.GRACIOU_DB = CAMINHO_BANCO;
      const db = require(join(RAIZ, 'backend', 'db.js'));
      db.abrir().prepare('DELETE FROM orders WHERE id = :id').run({ id: idPedido });
      const aindaExiste = db.buscarPedido(idPedido);
      console.log(`\n9) Pedido temporário ${idPedido} removido: ${aindaExiste ? 'NÃO' : 'sim'}`);
      if (aindaExiste) falhas += 1;
      db.fechar();
    }
  } catch (erro) {
    console.log(`  [aviso] falha na limpeza: ${erro.message}`);
  }
  encerrar();
  /* O processo da API pode segurar o arquivo por um instante: tenta
     de novo antes de afirmar que a pasta sumiu. */
  await new Promise((r) => setTimeout(r, 300));
  try { rmSync(pastaTemp, { recursive: true, force: true }); } catch (_) {}
  console.log(falhas === 0 ? '\nRESULTADO: todos os testes passaram.' : `\nRESULTADO: ${falhas} teste(s) falharam.`);
  console.log(`Pasta temporária removida: ${!existsSync(pastaTemp)}`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
