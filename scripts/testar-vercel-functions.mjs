import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as esperar } from 'node:timers/promises';

createRequire(import.meta.url)('../backend/env').carregar();

const porta = 3021;
const base = `http://127.0.0.1:${porta}`;
const env = {
  ...process.env,
  PORT: String(porta),
  VERCEL: '1',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  ADMIN_EMAIL: 'vercel-test@example.invalid',
  ADMIN_PASSWORD: 'senha-apenas-teste',
  MP_ACCESS_TOKEN: '',
  MP_WEBHOOK_SECRET: '',
  PUBLIC_BASE_URL: `http://127.0.0.1:${porta}`,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
};
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Teste local exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente, sem exibi-las.');
}

let processo;
let pedidoId = null;

async function api(path, options = {}) {
  const resposta = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return { status: resposta.status, body: await resposta.json().catch(() => ({})) };
}

async function aguardar() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const resposta = await fetch(base + '/api/health');
      if (resposta.status === 200 || resposta.status === 503) return;
    } catch (_) {}
    await esperar(250);
  }
  throw new Error('Function local não iniciou.');
}

function conferir(nome, ok) {
  if (!ok) throw new Error(`Falhou: ${nome}`);
  console.log(`OK — ${nome}`);
}

const pedido = {
  cliente: { nome: 'Teste Vercel', email: 'vercel-test@example.invalid', telefone: '(11) 90000-0000', cpf: '123.456.789-01' },
  endereco: { cep: '01310-100', estado: 'SP', cidade: 'São Paulo', bairro: 'Teste', rua: 'Rua Teste', numero: '0', complemento: '' },
  itens: [{ productId: 'tee-graca-permanece', tamanho: 'M', cor: 'Verde-musgo', quantidade: 2 }],
  pagamento: { forma: 'pix' },
  cupom: { codigo: 'BEMVINDO10' }
};

try {
  processo = spawn(process.execPath, ['--no-warnings', 'backend/servidor.js'], { cwd: process.cwd(), env, stdio: ['ignore', 'inherit', 'inherit'] });
  await aguardar();
  const health = await api('/api/health');
  conferir('Supabase obrigatório em Vercel', health.status === 200 && health.body.banco.tipo === 'supabase');
  const criado = await api('/api/orders', { method: 'POST', body: JSON.stringify(pedido) });
  conferir('Function de pedidos', criado.status === 201);
  pedidoId = criado.body.id;
  const lido = await api('/api/orders/' + encodeURIComponent(pedidoId));
  conferir('Function de consulta', lido.status === 200 && lido.body.pedido.id === pedidoId);
  const login = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: env.ADMIN_EMAIL, senha: env.ADMIN_PASSWORD }) });
  conferir('Function de login admin', login.status === 200);
} finally {
  if (pedidoId) {
    const repositorio = createRequire(import.meta.url)('../backend/repositorio.js');
    await repositorio.deletarPedido(pedidoId);
    conferir('limpeza do pedido de teste', (await repositorio.buscarPedido(pedidoId)) === null);
  }
  if (processo && !processo.killed) processo.kill('SIGTERM');
}
