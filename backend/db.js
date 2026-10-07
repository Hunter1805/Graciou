/**
 * ═══════════════════════════════════════════════════════════════
 * GRACIOU — BANCO DE DADOS LOCAL (SQLite)
 * Arquivo: backend/db.js
 * ═══════════════════════════════════════
 *
 * Banco em arquivo: backend/data/graciou.sqlite
 *
 * ─── POR QUE `node:sqlite` E NÃO `better-sqlite3` ────────────────
 * O Node 22.5+ já traz SQLite embutido (`node:sqlite`), síncrono e
 * sem dependência nativa para compilar. Isso evita:
 *   - instalação de serviço pago (nada de PostgreSQL, nada de nuvem);
 *   - compilador C++ / node-gyp no Windows;
 *   - uma dependência binária a mais para o projeto manter.
 * O módulo é marcado como experimental pelo Node e emite um aviso
 * (ExperimentalWarning) — por isso os scripts `dev`/`start` do
 * package.json sobem com `--no-warnings`. A API usada aqui
 * (DatabaseSync, prepare, run, get, all, exec) é estável na prática;
 * se o Node mudar a API, o ponto de troca é só este arquivo.
 *
 * ─── PRINCÍPIO DESTA CAMADA ──────────────────────────────────
 * Nenhum dado de cartão entra no banco. Não há coluna para número,
 * CVV, validade ou bandeira — e não deve haver.
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');

const CAMINHO_BANCO = process.env.GRACIOU_DB
  ? process.env.GRACIOU_DB
  : join(__dirname, 'data', 'graciou.sqlite');

/* ─────────────────────────────────────────────
   SCHEMA
   ───────────────────────────────────────────── */

/* orders — o pedido como o cliente o enviou, já recalculado no servidor.
   `endereco_json` e `itens_json` guardam a estrutura completa em JSON
   (itens têm tamanho/cor/quantidade por linha, e o endereço tem campos
   demais para virar coluna). As colunas "soltas" cobrem o que o admin
   vai querer filtrar depois sem abrir o JSON. */
const SQL_ORDERS = `
CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  criado_em         TEXT NOT NULL,
  cliente_nome      TEXT NOT NULL,
  cliente_email     TEXT NOT NULL,
  cliente_telefone  TEXT,
  cliente_cpf       TEXT,
  endereco_json     TEXT NOT NULL,
  itens_json        TEXT NOT NULL,
  forma_pagamento   TEXT NOT NULL,
  status_pagamento  TEXT NOT NULL DEFAULT 'aguardando',
  cupom_codigo      TEXT,
  subtotal          INTEGER NOT NULL DEFAULT 0,
  desconto          INTEGER NOT NULL DEFAULT 0,
  frete             INTEGER,
  total             INTEGER,
  status_pedido     TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  rastreio          TEXT,
  observacoes       TEXT,
  pedido_youdraw    TEXT,
  atualizado_em     TEXT,
  mp_preference_id  TEXT,
  mp_payment_id     TEXT,
  mp_status         TEXT,
  pago_em           TEXT,
  email_confirmacao_enviado_em TEXT,
  email_confirmacao_id         TEXT
);
`;

/* coupons — espelho consultável dos cupons oficiais.
   A AUTORIDADE continua sendo dados/catalogo.js (META.cupons).
   Esta tabela existe para: (a) o admin enxergar/gerenciar cupons no
   banco, (b) registrar histórico. Se divergirem, vale o catálogo. */
const SQL_COUPONS = `
CREATE TABLE IF NOT EXISTS coupons (
  codigo       TEXT PRIMARY KEY,
  tipo         TEXT NOT NULL,
  valor        INTEGER NOT NULL,
  ativo        INTEGER NOT NULL DEFAULT 0,
  valor_minimo INTEGER NOT NULL DEFAULT 0,
  validade     TEXT,
  limite_usos  INTEGER
);
`;

const INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_orders_criado_em ON orders (criado_em DESC);',
  'CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (cliente_email);',
  'CREATE INDEX IF NOT EXISTS idx_orders_status_pagamento ON orders (status_pagamento);',
  /* O painel filtra por status do pedido o tempo todo. */
  'CREATE INDEX IF NOT EXISTS idx_orders_status_pedido ON orders (status_pedido);',
  'CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON orders (mp_payment_id);'
];

/* ─────────────────────────────────────────────
   MIGRAÇÕES
   Colunas acrescentadas depois que o banco já existia em disco.
   `CREATE TABLE IF NOT EXISTS` não altera tabela pronta, então
   bancos antigos precisam de ALTER TABLE — e isso é seguro porque
   a operação só acrescenta coluna nova, nunca toca em dado.
   ───────────────────────────────────────────── */
const COLUNAS_NOVAS = [
  { nome: 'pedido_youdraw', sql: 'ALTER TABLE orders ADD COLUMN pedido_youdraw TEXT;' },
  { nome: 'atualizado_em', sql: 'ALTER TABLE orders ADD COLUMN atualizado_em TEXT;' },
  { nome: 'mp_preference_id', sql: 'ALTER TABLE orders ADD COLUMN mp_preference_id TEXT;' },
  { nome: 'mp_payment_id', sql: 'ALTER TABLE orders ADD COLUMN mp_payment_id TEXT;' },
  { nome: 'mp_status', sql: 'ALTER TABLE orders ADD COLUMN mp_status TEXT;' },
  { nome: 'pago_em', sql: 'ALTER TABLE orders ADD COLUMN pago_em TEXT;' },
  /* Controle de e-mail transacional (Brevo). Guardamos apenas QUANDO
     foi enviado e o id da mensagem — o conteúdo do e-mail não é
     persistido, e nada disso é exposto como dado financeiro. */
  { nome: 'email_confirmacao_enviado_em', sql: 'ALTER TABLE orders ADD COLUMN email_confirmacao_enviado_em TEXT;' },
  { nome: 'email_confirmacao_id', sql: 'ALTER TABLE orders ADD COLUMN email_confirmacao_id TEXT;' }
];

/** Nomes das colunas existentes em `orders` (introspecção do SQLite). */
function colunasDeOrders(db) {
  const linhas = db.prepare('PRAGMA table_info(orders)').all();
  return new Set(linhas.map(function (l) { return l.name; }));
}

/**
 * Acrescenta as colunas que faltam, sem apagar nada.
 * Idempotente: rodar a cada boot não muda nada depois da primeira.
 */
function migrar(db) {
  const existentes = colunasDeOrders(db);
  for (const coluna of COLUNAS_NOVAS) {
    if (!existentes.has(coluna.nome)) {
      db.exec(coluna.sql);
    }
  }
}

/* ─────────────────────────────────────────────
   CONEXÃO
   ───────────────────────────────────────────── */

let banco = null;

function abrir() {
  if (banco) return banco;

  mkdirSync(dirname(CAMINHO_BANCO), { recursive: true });

  banco = new DatabaseSync(CAMINHO_BANCO);

  /* WAL melhora leitura concorrente; FK liga as integridades. */
  banco.exec('PRAGMA journal_mode = WAL;');
  banco.exec('PRAGMA foreign_keys = ON;');

  banco.exec(SQL_ORDERS);
  banco.exec(SQL_COUPONS);
  migrar(banco);
  INDICES.forEach((sql) => banco.exec(sql));

  return banco;
}

function fechar() {
  if (!banco) return;
  try { banco.close(); } catch (_) {}
  banco = null;
}

/* ─────────────────────────────────────────────
   CUPONS — espelho do catálogo central
   ───────────────────────────────────────────── */

/**
 * Sincroniza a tabela `coupons` com META.cupons do catálogo.
 * Idempotente: pode rodar a cada boot. O catálogo manda.
 */
function sincronizarCupons(catalogo) {
  const db = abrir();
  const cupons = (catalogo && catalogo.META && Array.isArray(catalogo.META.cupons))
    ? catalogo.META.cupons
    : [];

  const inserir = db.prepare(`
    INSERT INTO coupons (codigo, tipo, valor, ativo, valor_minimo, validade, limite_usos)
    VALUES (:codigo, :tipo, :valor, :ativo, :valor_minimo, :validade, :limite_usos)
    ON CONFLICT(codigo) DO UPDATE SET
      tipo = excluded.tipo,
      valor = excluded.valor,
      ativo = excluded.ativo,
      valor_minimo = excluded.valor_minimo,
      validade = excluded.validade,
      limite_usos = excluded.limite_usos
  `);

  for (const cupom of cupons) {
    inserir.run({
      codigo: String(cupom.codigo || '').toUpperCase(),
      tipo: String(cupom.tipo || ''),
      valor: Number(cupom.valor) || 0,
      ativo: cupom.ativo === true ? 1 : 0,
      valor_minimo: Number(cupom.valorMinimo) || 0,
      validade: cupom.validade || null,
      limite_usos: (cupom.limiteUsos === null || cupom.limiteUsos === undefined)
        ? null
        : Number(cupom.limiteUsos)
    });
  }

  return cupons.length;
}

/* ─────────────────────────────────────────────
   ORDERS
   ───────────────────────────────────────────── */

/** Próximo número sequencial do dia, para o id do pedido. */
function proximoSequencial(dataTexto) {
  const db = abrir();
  const prefixo = dataTexto + '-';
  const linha = db.prepare(
    'SELECT COUNT(*) AS n FROM orders WHERE id LIKE :prefixo'
  ).get({ prefixo: 'GR-' + prefixo + '%' });
  return (linha && linha.n ? Number(linha.n) : 0) + 1;
}

/**
 * Gera um id único de pedido.
 * Formato: GR-AAAAMMDD-NNNN-XXXX  (data + sequencial do dia + sufixo)
 * O sufixo aleatório evita colisão entre processos concorrentes.
 */
function gerarIdPedido(agora) {
  const d = agora || new Date();
  const pad = (n, t) => String(n).padStart(t || 2, '0');
  const dataTexto = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

  let seq = 1;
  try { seq = proximoSequencial(dataTexto); } catch (_) { seq = 1; }

  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GR-${dataTexto}-${pad(seq, 4)}-${sufixo}`;
}

/**
 * Insere um pedido JÁ RECALCULADO pelo servidor.
 * `dados` vem de regras.montarPedido() — nunca direto do cliente.
 */
function inserirPedido(dados) {
  const db = abrir();

  db.prepare(`
    INSERT INTO orders (
      id, criado_em, cliente_nome, cliente_email, cliente_telefone, cliente_cpf,
      endereco_json, itens_json, forma_pagamento, status_pagamento, cupom_codigo,
      subtotal, desconto, frete, total, status_pedido, rastreio, observacoes
    ) VALUES (
      :id, :criado_em, :cliente_nome, :cliente_email, :cliente_telefone, :cliente_cpf,
      :endereco_json, :itens_json, :forma_pagamento, :status_pagamento, :cupom_codigo,
      :subtotal, :desconto, :frete, :total, :status_pedido, :rastreio, :observacoes
    )
  `).run(dados);

  return buscarPedido(dados.id);
}

/** Busca um pedido por id e devolve no formato de resposta da API. */
function buscarPedido(id) {
  const db = abrir();
  const linha = db.prepare('SELECT * FROM orders WHERE id = :id').get({ id: id });
  return linha ? linhaParaPedido(linha) : null;
}

/** Persiste o estado oficial retornado pelo Mercado Pago. */
function associarPreferencia(id, preferenceId) {
  const db = abrir();
  const atual = buscarPedido(id);
  if (!atual) return null;
  db.prepare('UPDATE orders SET mp_preference_id = :preference_id, atualizado_em = :atualizado_em WHERE id = :id')
    .run({ id: id, preference_id: preferenceId, atualizado_em: agoraLocalISO() });
  return buscarPedido(id);
}

function atualizarPagamento(id, dados) {
  const db = abrir();
  const atual = buscarPedido(id);
  if (!atual) return null;

  const agora = agoraLocalISO();
  const aprovado = dados.statusPagamento === 'pago';
  const colunas = [
    'mp_status = CASE WHEN mp_status = \'approved\' AND :mp_status <> \'approved\' THEN mp_status ELSE :mp_status END',
    'mp_payment_id = COALESCE(:mp_payment_id, mp_payment_id)',
    'atualizado_em = :atualizado_em'
  ];
  const valores = {
    id: id,
    mp_status: dados.mpStatus || null,
    mp_payment_id: dados.mpPaymentId || null,
    atualizado_em: agora
  };

  if (dados.mpPreferenceId) {
    colunas.push('mp_preference_id = COALESCE(:mp_preference_id, mp_preference_id)');
    valores.mp_preference_id = dados.mpPreferenceId;
  }
  if (aprovado) {
    colunas.push("status_pagamento = 'pago'");
    colunas.push("status_pedido = CASE WHEN status_pedido = 'aguardando_pagamento' THEN 'pago' ELSE status_pedido END");
    colunas.push('pago_em = COALESCE(pago_em, :pago_em)');
    valores.pago_em = agora;
  } else if ((dados.statusPagamento === 'pendente' || dados.statusPagamento === 'recusado') && atual.pagamento.status !== 'pago') {
    /* Uma notificação atrasada/repetida nunca rebaixa uma aprovação já confirmada. */
    colunas.push('status_pagamento = :status_pagamento');
    valores.status_pagamento = dados.statusPagamento;
  }

  db.prepare('UPDATE orders SET ' + colunas.join(', ') + ' WHERE id = :id').run(valores);
  return buscarPedido(id);
}

function pagamentoDoPedido(id) {
  const db = abrir();
  return db.prepare(`SELECT id, status_pedido, status_pagamento, total,
    mp_preference_id, mp_payment_id, mp_status, pago_em
    FROM orders WHERE id = :id`).get({ id: id }) || null;
}

/**
 * Dados completos do cupom aplicado, para a API devolver o tipo e o
 * valor junto do pedido. A tabela `orders` guarda apenas o código
 * (é o que o checkout e o operador precisam ver), mas `tipo`/`valor`
 * vivem em `coupons` — assim não há duplicação de dado financeiro
 * no registro do pedido, e a resposta continua completa.
 */
function detalhesDoCupom(codigo) {
  if (!codigo) return null;
  const db = abrir();
  const linha = db.prepare('SELECT tipo, valor FROM coupons WHERE codigo = :codigo')
    .get({ codigo: String(codigo).toUpperCase() });
  return linha ? { tipo: linha.tipo, valor: linha.valor } : null;
}

/** Lista pedidos (uso interno/admin futuro). Não exposta nesta etapa. */
function listarPedidos(limite) {
  const db = abrir();
  const n = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const linhas = db.prepare(
    'SELECT * FROM orders ORDER BY criado_em DESC LIMIT :n'
  ).all({ n: n });
  return linhas.map(linhaParaPedido);
}

/**
 * Lista pedidos com filtro opcional por status (uso do painel admin).
 * O filtro é validado antes de virar SQL: só entra na consulta um
 * status da lista oficial, e ainda assim como parâmetro nomeado.
 *
 * A resposta é uma VERSÃO RESUMIDA do pedido — sem CPF, sem
 * endereço e sem itens — porque a lista não precisa disso e o dado
 * pessoal só deve trafegar quando o operador abrir o detalhe.
 */
function listarResumoPedidos(opcoes) {
  const db = abrir();
  const config = opcoes || {};

  const n = Math.min(Math.max(Number(config.limite) || 100, 1), 500);
  const status = config.status ? String(config.status) : null;

  const sql = status
    ? 'SELECT * FROM orders WHERE status_pedido = :status ORDER BY criado_em DESC LIMIT :n'
    : 'SELECT * FROM orders ORDER BY criado_em DESC LIMIT :n';

  const parametros = status ? { status: status, n: n } : { n: n };

  return db.prepare(sql).all(parametros).map(function (linha) {
    const pedido = linhaParaPedido(linha);
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];

    return {
      id: pedido.id,
      criadoEm: pedido.criadoEm,
      atualizadoEm: pedido.atualizadoEm,
      clienteNome: pedido.cliente.nome,
      clienteEmail: pedido.cliente.email,
      telefone: pedido.cliente.telefone,
      cidade: pedido.endereco.cidade || '',
      estado: pedido.endereco.estado || '',
      statusPedido: pedido.statusPedido,
      statusPagamento: pedido.pagamento.status,
      formaPagamento: pedido.pagamento.forma,
      total: pedido.total,
      subtotal: pedido.subtotal,
      frete: pedido.frete,
      cupom: pedido.cupom ? pedido.cupom.codigo : null,
      rastreio: pedido.rastreio,
      pedidoYouDraw: pedido.pedidoYouDraw,
      temObservacao: Boolean(pedido.observacoes),
      pecas: itens.reduce(function (soma, item) {
        return soma + (Number(item.quantidade) || 0);
      }, 0),
      linhas: itens.length
    };
  });
}

/**
 * Quantos pedidos existem por status (usado nos totais do painel).
 * Devolve um objeto { aguardando_pagamento: 2, pago: 1, ... } com
 * todos os status oficiais presentes, mesmo os que estão em zero.
 */
function contagemPorStatus(statusPermitidos) {
  const db = abrir();
  const linhas = db.prepare(
    'SELECT status_pedido AS status, COUNT(*) AS n FROM orders GROUP BY status_pedido'
  ).all();

  const contagem = {};
  (statusPermitidos || []).forEach(function (status) { contagem[status] = 0; });
  linhas.forEach(function (linha) { contagem[linha.status] = Number(linha.n) || 0; });
  return contagem;
}

/**
 * Atualiza um pedido SEM APAGAR o que já existe.
 *
 * `alteracoes` chega já validada por admin.validarAtualizacao() e só
 * contém as chaves que o operador realmente enviou. O UPDATE é
 * montado dinamicamente a partir dessas chaves — coluna ausente não
 * entra no SET, então o valor antigo permanece intacto.
 *
 * Observação: em modo "adicionar" a nota nova é concatenada ao texto
 * existente, também sem sobrescrever a anterior.
 */
function atualizarPedido(id, alteracoes) {
  const db = abrir();
  const atual = buscarPedido(id);
  if (!atual) return null;

  const colunas = [];
  const valores = { id: id, atualizado_em: agoraLocalISO() };

  if (alteracoes.statusPedido !== undefined) {
    colunas.push('status_pedido = :status_pedido');
    valores.status_pedido = alteracoes.statusPedido;
  }

  if (alteracoes.statusPagamento !== undefined) {
    colunas.push('status_pagamento = :status_pagamento');
    valores.status_pagamento = alteracoes.statusPagamento;
  }

  /* rastreio e pedidoYouDraw aceitam null de propósito: isso é o
     operador LIMPANDO um campo que estava preenchido. Só entram no
     SET quando a chave veio no corpo — nunca por omissão. */
  if (alteracoes.rastreio !== undefined) {
    colunas.push('rastreio = :rastreio');
    valores.rastreio = alteracoes.rastreio;
  }

  if (alteracoes.pedidoYouDraw !== undefined) {
    colunas.push('pedido_youdraw = :pedido_youdraw');
    valores.pedido_youdraw = alteracoes.pedidoYouDraw;
  }

  if (alteracoes.observacoes !== undefined) {
    const nota = alteracoes.observacoes;
    const anterior = atual.observacoes || '';

    if (alteracoes.observacoesModo === 'substituir') {
      valores.observacoes = nota || null;
    } else if (!nota) {
      /* Nada digitado: mantém exatamente o que já havia. */
      valores.observacoes = anterior || null;
    } else {
      valores.observacoes = anterior ? anterior + '\n' + nota : nota;
    }

    colunas.push('observacoes = :observacoes');
  }

  if (!colunas.length) return atual;

  colunas.push('atualizado_em = :atualizado_em');

  db.prepare(
    'UPDATE orders SET ' + colunas.join(', ') + ' WHERE id = :id'
  ).run(valores);

  return buscarPedido(id);
}

/** Data/hora local (mesmo formato de `criado_em`), para `atualizado_em`. */
function agoraLocalISO(agora) {
  const d = agora || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Converte a linha do banco no objeto JSON que a API devolve. */
function linhaParaPedido(linha) {
  const parse = (texto) => {
    try { return JSON.parse(texto); } catch (_) { return null; }
  };

  return {
    id: linha.id,
    criadoEm: linha.criado_em,
    cliente: {
      nome: linha.cliente_nome,
      email: linha.cliente_email,
      telefone: linha.cliente_telefone,
      cpf: linha.cliente_cpf
    },
    endereco: parse(linha.endereco_json) || {},
    itens: parse(linha.itens_json) || [],
    pagamento: {
      forma: linha.forma_pagamento,
      status: linha.status_pagamento
    },
    cupom: linha.cupom_codigo ? montarCupom(linha.cupom_codigo) : null,
    subtotal: linha.subtotal,
    desconto: linha.desconto,
    frete: linha.frete,
    total: linha.total,
    statusPedido: linha.status_pedido,
    rastreio: linha.rastreio,
    observacoes: linha.observacoes,
    pedidoYouDraw: linha.pedido_youdraw || null,
    atualizadoEm: linha.atualizado_em || null,
    /* Uso interno: a API não devolve estes dois campos ao frontend. */
    emailConfirmacaoEnviadoEm: linha.email_confirmacao_enviado_em || null,
    emailConfirmacaoId: linha.email_confirmacao_id || null,
    mercadoPago: {
      preferenceId: linha.mp_preference_id || null,
      paymentId: linha.mp_payment_id || null,
      status: linha.mp_status || null,
      pagoEm: linha.pago_em || null
    }
  };
}

/** Monta o cupom da resposta: código + tipo/valor vindos de `coupons`. */
function montarCupom(codigo) {
  const cupom = { codigo: codigo };
  const detalhes = detalhesDoCupom(codigo);
  if (detalhes) {
    cupom.tipo = detalhes.tipo;
    cupom.valor = detalhes.valor;
  }
  return cupom;
}

/** Cupons gravados no banco (diagnóstico/teste). */
function listarCupons() {
  const db = abrir();
  return db.prepare('SELECT * FROM coupons ORDER BY codigo').all();
}

/* ─────────────────────────────────────────────
   E-MAIL DE CONFIRMAÇÃO (idempotência)
   Marca no pedido que a confirmação já saiu. O UPDATE condicional
   (`WHERE ... IS NULL`) só afeta a primeira chamada: uma segunda
   tentativa para o mesmo pedido devolve `false` e não reenvia. É o
   que impede e-mail duplicado mesmo com cliques repetidos.
   ───────────────────────────────────────────── */
function marcarEmailConfirmacao(id, messageId) {
  const db = abrir();
  const resultado = db.prepare(
    'UPDATE orders SET email_confirmacao_enviado_em = :quando, email_confirmacao_id = :msg\n' +
    ' WHERE id = :id AND email_confirmacao_enviado_em IS NULL'
  ).run({
    id: id,
    quando: agoraLocalISO(),
    msg: messageId || null
  });
  return Number(resultado && resultado.changes) > 0;
}

function emailConfirmacaoDoPedido(id) {
  const db = abrir();
  return db.prepare(
    'SELECT email_confirmacao_enviado_em AS enviado_em, email_confirmacao_id AS message_id FROM orders WHERE id = :id'
  ).get({ id: id }) || null;
}

module.exports = {
  CAMINHO_BANCO: CAMINHO_BANCO,
  abrir: abrir,
  fechar: fechar,
  sincronizarCupons: sincronizarCupons,
  listarCupons: listarCupons,
  detalhesDoCupom: detalhesDoCupom,
  gerarIdPedido: gerarIdPedido,
  inserirPedido: inserirPedido,
  buscarPedido: buscarPedido,
  listarPedidos: listarPedidos,
  listarResumoPedidos: listarResumoPedidos,
  contagemPorStatus: contagemPorStatus,
  atualizarPedido: atualizarPedido,
  atualizarPagamento: atualizarPagamento,
  pagamentoDoPedido: pagamentoDoPedido,
  associarPreferencia: associarPreferencia,
  marcarEmailConfirmacao: marcarEmailConfirmacao,
  emailConfirmacaoDoPedido: emailConfirmacaoDoPedido
};

/* Expostos acima para manter a API de persistência explícita. */

module.exports.atualizarPagamento = atualizarPagamento;
module.exports.pagamentoDoPedido = pagamentoDoPedido;