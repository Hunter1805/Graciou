import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as esperar } from 'node:timers/promises';

const require = createRequire(import.meta.url);
require('../backend/env').carregar();
const raiz = process.cwd();
const porta = 3011;
const base = `http://127.0.0.1:${porta}`;
const env = {
  ...process.env,
  PORT: String(porta),
  ADMIN_EMAIL: 'teste-admin-supabase@example.invalid',
  ADMIN_PASSWORD: 'senha-temporaria-apenas-teste',
  MP_ACCESS_TOKEN: '',
  MP_WEBHOOK_SECRET: '',
  PUBLIC_BASE_URL: ''
};

const pedidoTeste = {
  cliente: {
    nome: 'Teste admin Supabase',
    email: 'teste-admin-supabase@example.invalid',
    telefone: '(11) 90000-0000',
    cpf: '123.456.789-01'
  },
  endereco: {
    cep: '01310-100',
    estado: 'SP',
    cidade: 'São Paulo',
    bairro: 'Teste',
    rua: 'Rua Teste',
    numero: '0',
    complemento: ''
  },
  itens: [{ productId: 'tee-graca-permanece', tamanho: 'M', cor: 'Verde-musgo', quantidade: 2 }],
  pagamento: { forma: 'pix' },
  cupom: { codigo: 'BEMVINDO10' }
};

let processo;
let pedidoId = null;

function conferir(nome, ok) {
  if (!ok) throw new Error(`Falhou: ${nome}`);
  console.log(`OK — ${nome}`);
}

async function api(path, options = {}) {
  const resposta = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return { status: resposta.status, body: await resposta.json().catch(() => ({})) };
}

async function aguardarServidor() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const resposta = await fetch(base + '/api/health');
      if (resposta.status === 200 || resposta.status === 503) return;
    } catch (_) {}
    await esperar(250);
  }
  throw new Error('Servidor de teste não iniciou.');
}

try {
  processo = spawn(process.execPath, ['--no-warnings', 'backend/servidor.js'], {
    cwd: raiz,
    env,
    stdio: ['ignore', 'ignore', 'ignore']
  });
  await aguardarServidor();

  const health = await api('/api/health');
  conferir('health HTTP 200', health.status === 200);
  conferir('modo Supabase', health.body.banco && health.body.banco.tipo === 'supabase');
  conferir('painel admin configurado pelo ambiente herdado', health.body.usuarioAdmin === true);
  conferir('Mercado Pago não configurado', health.body.pagamentoIntegrado === false);

  const criado = await api('/api/orders', { method: 'POST', body: JSON.stringify(pedidoTeste) });
  conferir('pedido temporário criado', criado.status === 201 && criado.body.ok === true);
  pedidoId = criado.body.id;

  const login = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: env.ADMIN_EMAIL, senha: env.ADMIN_PASSWORD })
  });
  conferir('POST /api/admin/login', login.status === 200 && login.body.ok === true);
  const autorizacao = { Authorization: 'Bearer ' + login.body.token };

  const lista = await api('/api/admin/orders', { headers: autorizacao });
  conferir('GET /api/admin/orders', lista.status === 200 && lista.body.pedidos.some((pedido) => pedido.id === pedidoId));

  const detalhe = await api('/api/admin/orders/' + encodeURIComponent(pedidoId), { headers: autorizacao });
  conferir('GET /api/admin/orders/:id', detalhe.status === 200 && detalhe.body.pedido.id === pedidoId);

  const atualizado = await api('/api/admin/orders/' + encodeURIComponent(pedidoId), {
    method: 'PATCH',
    headers: autorizacao,
    body: JSON.stringify({ statusPedido: 'pago', rastreio: 'TESTE-ADMIN-SUPABASE' })
  });
  conferir('PATCH /api/admin/orders/:id', atualizado.status === 200 && atualizado.body.pedido.statusPedido === 'pago' && atualizado.body.pedido.rastreio === 'TESTE-ADMIN-SUPABASE');
} finally {
  if (pedidoId) {
    const repositorio = require('../backend/repositorio');
    const removido = await repositorio.deletarPedido(pedidoId);
    const remanescente = await repositorio.buscarPedido(pedidoId);
    conferir('pedido temporário removido', removido === true);
    conferir('nenhum dado de teste permaneceu', remanescente === null);
  }
  if (processo && !processo.killed) processo.kill('SIGTERM');
}
