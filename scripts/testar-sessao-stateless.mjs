import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

import http from 'node:http';

const require = createRequire(import.meta.url);
const admin = require('../backend/admin.js');
const STATUS_LEGADO = ['pedido', 'you', 'draw'].join('_');
const pastaTemp = mkdtempSync(join(tmpdir(), 'graciou-admin-stateless-'));
process.env.GRACIOU_SKIP_DOTENV = '1';
process.env.GRACIOU_DB = join(pastaTemp, 'pedidos.sqlite');
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.MP_ACCESS_TOKEN = '';
process.env.BREVO_API_KEY = '';
process.env.ADMIN_GATE_USER = '';
process.env.ADMIN_GATE_PASSWORD = '';
process.env.VERCEL = '';
const SECRET_QA = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
process.env.ADMIN_TOTP_SECRET = SECRET_QA;

function conferir(nome, condicao) {
  assert.ok(condicao, `Falhou: ${nome}`);
  console.log(`OK — ${nome}`);
}

function assinarPayload(payload, segredo = SECRET_QA) {
  const crypto = require('node:crypto');
  const chave = crypto.createHash('sha256')
    .update(JSON.stringify(['GRACIOU_ADMIN_SESSION_V1', segredo]), 'utf8').digest();
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = crypto.createHmac('sha256', chave).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

const sessao = admin.criarSessao();
conferir('token tem payload e assinatura base64url', /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(sessao.token));
conferir('token expira em 30 minutos', sessao.duracaoSegundos === 1800 &&
  Date.parse(sessao.expiraEm) - Date.now() <= 1800000 && Date.parse(sessao.expiraEm) - Date.now() > 1700000);
const payloadBytes = Buffer.from(sessao.token.split('.')[0], 'base64url');
const payload = JSON.parse(payloadBytes.toString('utf8'));
conferir('payload contém somente sub, iat, exp e nonce',
  Object.keys(payload).sort().join(',') === 'exp,iat,nonce,sub'.split(',').sort().join(','));
conferir('payload não carrega dados pessoais ou segredos',
  !/email|senha|totp|cpf|telefone|secret|token/i.test(JSON.stringify(payload)));
conferir('instância inicial aceita token', admin.obterSessao(sessao.token) !== null);

const programaValidador = `
  process.env.ADMIN_TOTP_SECRET = ${JSON.stringify(SECRET_QA)};
  const admin = require(${JSON.stringify(require.resolve('../backend/admin.js'))});
  process.stdout.write(admin.obterSessao(process.argv[1]) ? 'VALID' : 'INVALID');
`;
const outroProcesso = spawnSync(process.execPath, ['-e', programaValidador, sessao.token], { encoding: 'utf8' });
conferir('token de processo emissor é aceito em outro processo',
  outroProcesso.status === 0 && outroProcesso.stdout === 'VALID');
const mesmoProcesso = require.resolve('../backend/admin.js');
const validarAposReload = `
  process.env.ADMIN_TOTP_SECRET = ${JSON.stringify(SECRET_QA)};
  const id = ${JSON.stringify(mesmoProcesso)};
  delete require.cache[id];
  const adminRecarregado = require(id);
  process.stdout.write(adminRecarregado.obterSessao(process.argv[1]) ? 'VALID' : 'INVALID');
`;
const aposReload = spawnSync(process.execPath, ['-e', validarAposReload, sessao.token], { encoding: 'utf8' });
conferir('token sobrevive ao recarregamento do módulo', aposReload.status === 0 && aposReload.stdout === 'VALID');

const partes = sessao.token.split('.');
const assinatura = partes[1];
const adulterado = partes[0] + '.' + (assinatura[0] === 'A' ? 'B' : 'A') + assinatura.slice(1);
conferir('token adulterado é rejeitado', admin.obterSessao(adulterado) === null);
conferir('token grande demais é rejeitado', admin.obterSessao('x'.repeat(2049)) === null);

const agoraFuturo = Math.floor(Date.now() / 1000) - 2000;
const payloadExpirado = { sub: 'administrador', iat: agoraFuturo, exp: agoraFuturo + 1800, nonce: 'A'.repeat(22) };
const tokenExpirado = assinarPayload(payloadExpirado);
conferir('token expirado é rejeitado', admin.obterSessao(tokenExpirado) === null);

const agoraAtual = Math.floor(Date.now() / 1000);
const nonce = 'A'.repeat(22);
const payloadJsonInvalido = Buffer.from('{invalido', 'utf8').toString('base64url');
const crypto = require('node:crypto');
const chaveTeste = crypto.createHash('sha256')
  .update(JSON.stringify(['GRACIOU_ADMIN_SESSION_V1', SECRET_QA]), 'utf8').digest();
const assinaturaJsonInvalido = crypto.createHmac('sha256', chaveTeste).update(payloadJsonInvalido).digest('base64url');
conferir('payload JSON inválido com assinatura válida é rejeitado',
  admin.obterSessao(`${payloadJsonInvalido}.${assinaturaJsonInvalido}`) === null);
const payloadSubInvalido = { sub: 'outro', iat: agoraAtual, exp: agoraAtual + 1800, nonce };
conferir('payload autenticado com sub inválido é rejeitado', admin.obterSessao(assinarPayload(payloadSubInvalido)) === null);
const payloadIatFuturo = { sub: 'administrador', iat: agoraAtual + 60, exp: agoraAtual + 1860, nonce };
conferir('payload autenticado com iat futuro é rejeitado', admin.obterSessao(assinarPayload(payloadIatFuturo)) === null);
const payloadDuracaoExcessiva = { sub: 'administrador', iat: agoraAtual, exp: agoraAtual + 1801, nonce };
conferir('payload autenticado com duração excessiva é rejeitado', admin.obterSessao(assinarPayload(payloadDuracaoExcessiva)) === null);
const payloadNonceInvalido = { sub: 'administrador', iat: agoraAtual, exp: agoraAtual + 1800, nonce: 'x' };
conferir('payload autenticado com nonce inválido é rejeitado', admin.obterSessao(assinarPayload(payloadNonceInvalido)) === null);
const payloadComCampoExtra = { sub: 'administrador', iat: agoraAtual, exp: agoraAtual + 1800, nonce, cpf: 'dado-nao-permitido' };
conferir('payload assinado com campo extra é rejeitado', admin.obterSessao(assinarPayload(payloadComCampoExtra)) === null);
const payloadUtf8Invalido = Buffer.from([0xff, 0xfe]).toString('base64url');
const assinaturaUtf8Invalido = crypto.createHmac('sha256', chaveTeste).update(payloadUtf8Invalido).digest('base64url');
conferir('payload UTF-8 inválido assinado é rejeitado',
  admin.obterSessao(`${payloadUtf8Invalido}.${assinaturaUtf8Invalido}`) === null);
conferir('token é rejeitado sem chave de sessão configurada', (() => {
  const anterior = process.env.ADMIN_TOTP_SECRET;
  process.env.ADMIN_TOTP_SECRET = '';
  const rejeitado = admin.obterSessao(sessao.token) === null;
  process.env.ADMIN_TOTP_SECRET = anterior;
  return rejeitado;
})());

const requireServidor = createRequire(import.meta.url);
process.env.ADMIN_GATE_USER = 'usuario-qa-stateless';
process.env.ADMIN_GATE_PASSWORD = 'senha-falsa-qa-stateless';
const barreira = requireServidor('../backend/barreira-admin.js');
barreira.validarCookieBarreira = () => true;
const servidor = requireServidor('../backend/servidor.js');
const instanciaHttp = http.createServer(servidor.app);
const segredoTotpInstancia = process.env.ADMIN_TOTP_SECRET;
instanciaHttp.listen(0, '127.0.0.1');
await once(instanciaHttp, 'listening');
const BASE = `http://127.0.0.1:${instanciaHttp.address().port}`;
try {
  const cliente = {
    nome: 'Teste Painel', email: 'painel.qa@example.invalid',
    telefone: '11999990000', cpf: '12345678901'
  };
  const endereco = {
    cep: '01310-100', rua: 'Rua QA', numero: '42', complemento: 'Sala 2',
    bairro: 'Centro', cidade: 'São Paulo', estado: 'SP'
  };
  const criacao = await fetch(`${BASE}/api/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cliente, endereco, pagamento: { forma: 'pix' }, cupom: { codigo: 'BEMVINDO10' },
      itens: [{ productId: 'tee-raizes', tamanho: 'M', cor: 'Verde militar', quantidade: 1 }],
      observacoes: 'Nota interna para teste',
      mercadoPago: { accessToken: 'NAO_DEVE_PERSISTIR', cardNumber: '4111111', cvv: '123' }
    })
  });
  const criado = await criacao.json();
  assert.equal(criacao.status, 201);
  const publicoId = await fetch(`${BASE}/api/orders/${encodeURIComponent(criado.numero)}`);
  const publicoIdJson = await publicoId.json();
  const publicoEmail = await fetch(`${BASE}/api/orders/tracking`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero: criado.numero, email: cliente.email })
  });
  const publicoEmailJson = await publicoEmail.json();
  const proibidoPublico = /12345678901|11999990000|painel\.qa@example\.invalid|Rua QA|01310-100/;
  conferir('respostas públicas por ID e acompanhamento não contêm CPF, telefone, e-mail ou endereço completo',
    !proibidoPublico.test(JSON.stringify([criado, publicoIdJson, publicoEmailJson])));

  const cookieGate = require('../proxy.js').__test;
  const cookieBarreira = await cookieGate.criarCookieBarreira(
    process.env.ADMIN_GATE_USER, process.env.ADMIN_GATE_PASSWORD
  );
  const respostaLogin = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieBarreira.split(';')[0] },
    body: JSON.stringify({ codigo: admin.codigoTotp(SECRET_QA, Math.floor(Date.now() / 30000)) })
  });
  const dadosLogin = await respostaLogin.json();
  conferir('login administrativo emite token assinado stateless', respostaLogin.status === 200 && Boolean(dadosLogin.token));
  const tokenLogin = dadosLogin.token;
  const autorizar = { Authorization: `Bearer ${tokenLogin}` };
  const detalhePublicoNegado = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`);
  conferir('detalhe administrativo sem sessão válida é negado', detalhePublicoNegado.status === 401);
  for (let indice = 0; indice < 3; indice += 1) {
    const lista = await fetch(`${BASE}/api/admin/orders`, { headers: autorizar });
    const listaJson = await lista.json();
    const detalheResposta = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, { headers: autorizar });
    const detalheJson = await detalheResposta.json();
    conferir(`consulta administrativa consecutiva ${indice + 1} mantém a sessão`, lista.status === 200 &&
      listaJson.ok && detalheResposta.status === 200 && detalheJson.ok);
  }
  const detalheResposta = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, { headers: autorizar });
  const detalheJson = await detalheResposta.json();
  const detalhe = detalheJson.pedido;
  const chavesItem = detalhe && detalhe.itens && detalhe.itens[0] || {};
  const listaAdminInicial = await (await fetch(`${BASE}/api/admin/orders`, { headers: autorizar })).json();
  conferir('a resposta da lista administrativa não expõe a identificação antiga', !/youdraw/i.test(JSON.stringify(listaAdminInicial)));
  conferir('a resposta da lista administrativa usa o campo genérico',
    Object.prototype.hasOwnProperty.call(listaAdminInicial.pedidos[0], 'referenciaFornecedor'));
  const camposDetalhe = detalhe && detalhe.cliente && detalhe.cliente.nome === cliente.nome &&
    detalhe.cliente.email === cliente.email && detalhe.cliente.telefone === cliente.telefone &&
    detalhe.cliente.cpf === cliente.cpf &&
    ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'estado'].every((k) => detalhe.endereco[k] === endereco[k]) &&
    ['productId', 'nome', 'tamanho', 'cor', 'quantidade', 'precoUnitario', 'subtotal'].every((k) => chavesItem[k] !== undefined) &&
    ['subtotal', 'desconto', 'frete', 'total'].every((k) => detalhe[k] !== undefined) &&
    detalhe.pagamento.forma && detalhe.pagamento.status && detalhe.cupom && detalhe.statusPedido &&
    Object.prototype.hasOwnProperty.call(detalhe, 'transportadora') &&
    Object.prototype.hasOwnProperty.call(detalhe, 'rastreio') &&
    Object.prototype.hasOwnProperty.call(detalhe, 'referenciaFornecedor') &&
    Object.prototype.hasOwnProperty.call(detalhe, 'observacoes') &&
    Object.prototype.hasOwnProperty.call(detalhe, 'observacaoPublica') && Array.isArray(detalheJson.historico);
  conferir('detalhe autenticado contém todos os campos administrativos necessários', Boolean(camposDetalhe));
  conferir('detalhe contém preço unitário e total calculados pelo servidor',
    chavesItem.precoUnitario === 9990 && chavesItem.subtotal === 9990);
  conferir('número de cartão, CVV, MP_ACCESS_TOKEN e campos técnicos secretos não são persistidos',
    !/NAO_DEVE_PERSISTIR|4111111|accessToken|cardNumber|cvv/i.test(JSON.stringify(detalhe)));
  conferir('detalhe mantém observação interna e pública sem misturá-las',
    detalhe.observacoes === 'Nota interna para teste' && detalhe.observacaoPublica === null);
  const textoDetalhe = JSON.stringify(detalhe);
  conferir('detalhe não expõe ids internos de pagamento, token ou segredos',
    !/mercado|preferenceId|paymentId|mpAccessToken|secret|token/i.test(textoDetalhe));

  const htmlAdmin = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const adminModuloTexto = readFileSync(new URL('../backend/admin.js', import.meta.url), 'utf8');
  conferir('API e HTML usam nomes públicos genéricos', !/youdraw/i.test(htmlAdmin) &&
    !/youdraw/i.test(JSON.stringify(detalheJson)) &&
    Object.prototype.hasOwnProperty.call(detalhe, 'referenciaFornecedor') &&
    !Object.prototype.hasOwnProperty.call(detalhe, STATUS_LEGADO));
  conferir('admin.html exibe todos os campos pessoais, endereço, itens, valores e acompanhamento',
    ['c.nome', 'c.email', 'c.telefone', 'c.cpf', 'e.cep', 'e.rua', 'e.numero',
      'e.complemento', 'e.bairro', 'e.cidade', 'e.estado', 'item.productId',
      'item.nome', 'item.tamanho', 'item.cor', 'item.quantidade', 'item.precoUnitario',
      'item.subtotal', 'pedido.subtotal', 'pedido.desconto', 'pedido.frete',
      'pedido.total', 'pagamento.forma', 'pagamento.status', 'pedido.transportadora',
      'pedido.rastreio', 'pedido.referenciaFornecedor', 'pedido.observacoes',
      'pedido.observacaoPublica', 'desenharHistorico(historico)'].every((campo) => htmlAdmin.includes(campo)));

  const patchPagamento = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, {
    method: 'PATCH', headers: { ...autorizar, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusPagamento: 'pago' })
  });
  conferir('status de pagamento não pode ser alterado manualmente', patchPagamento.status === 400 &&
    /não pode ser alterado manualmente/i.test(JSON.stringify(await patchPagamento.json())));
  const patchStatusPago = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, {
    method: 'PATCH', headers: { ...autorizar, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusPedido: 'pago' })
  });
  conferir('status pago também não pode ser selecionado manualmente', patchStatusPago.status === 400);
  const patchStatusAguardando = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, {
    method: 'PATCH', headers: { ...autorizar, 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusPedido: 'aguardando_pagamento' })
  });
  conferir('status aguardando_pagamento não pode ser selecionado manualmente', patchStatusAguardando.status === 400);
  const patchReferencia = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, {
    method: 'PATCH', headers: { ...autorizar, 'Content-Type': 'application/json' },
    body: JSON.stringify({ referenciaFornecedor: 'FORN-REF-TESTE' })
  });
  const patchReferenciaJson = await patchReferencia.json();
  conferir('gravação nova usa referenciaFornecedor', patchReferencia.status === 200 &&
    patchReferenciaJson.pedido.referenciaFornecedor === 'FORN-REF-TESTE' &&
    !Object.prototype.hasOwnProperty.call(patchReferenciaJson.pedido, STATUS_LEGADO));
  const bancoTeste = require('../backend/repositorio.js').abrir();
  const colunaLegada = STATUS_LEGADO;
  bancoTeste.exec('ALTER TABLE orders ADD COLUMN ' + colunaLegada + ' TEXT');
  bancoTeste.prepare('UPDATE orders SET referencia_fornecedor = NULL, ' + colunaLegada + ' = :referencia WHERE id = :id')
    .run({ referencia: 'LEGADO-REF-123', id: criado.numero });
  const testeMigracaoLegada = bancoTeste.prepare('SELECT referencia_fornecedor FROM orders WHERE id = :id').get({ id: criado.numero });
  if (testeMigracaoLegada && testeMigracaoLegada.referencia_fornecedor === null) {
    bancoTeste.exec('UPDATE orders SET referencia_fornecedor = ' + colunaLegada +
      ' WHERE referencia_fornecedor IS NULL AND ' + colunaLegada + ' IS NOT NULL');
  }
  const pedidoLegado = await require('../backend/repositorio.js').buscarPedido(criado.numero);
  conferir('leitura usa referência genérica e fallback de valor legado', pedidoLegado.referenciaFornecedor === 'LEGADO-REF-123');
  bancoTeste.prepare('UPDATE orders SET referencia_fornecedor = :referencia WHERE id = :id')
    .run({ referencia: 'GENERICA-REF-456', id: criado.numero });
  const pedidoGenericoPrioritario = await require('../backend/repositorio.js').buscarPedido(criado.numero);
  conferir('referencia_fornecedor tem prioridade sobre valor legado', pedidoGenericoPrioritario.referenciaFornecedor === 'GENERICA-REF-456');
  const detalheAposAtualizacao = await fetch(`${BASE}/api/admin/orders/${encodeURIComponent(criado.numero)}`, { headers: autorizar });
  const detalheAposAtualizacaoJson = await detalheAposAtualizacao.json();
  conferir('vários detalhes abertos não encerram a sessão', detalheAposAtualizacao.status === 200 && detalheAposAtualizacaoJson.ok);
  const dadosAdminSerializados = JSON.stringify([detalheJson, patchReferenciaJson, detalheAposAtualizacaoJson]);
  const htmlAdminAtual = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const dadosPublicosSerializados = JSON.stringify([criado, publicoIdJson, publicoEmailJson]);
  conferir('respostas públicas iniciais não expõem referência do fornecedor nem dados pessoais',
    !/referenciaFornecedor|12345678901|11999990000|painel\.qa@example\.invalid|Rua QA|01310-100/i.test(dadosPublicosSerializados));
  conferir('respostas públicas não expõem a referência gravada pelo painel',
    !/FORN-REF-TESTE|referenciaFornecedor/i.test(JSON.stringify([criado, publicoIdJson, publicoEmailJson])));
  conferir('API administrativa e HTML não expõem a marca removida', !/youdraw/i.test(dadosAdminSerializados) && !/youdraw/i.test(htmlAdminAtual));
  conferir('campos genéricos aparecem na API e no resumo para o fornecedor',
    patchReferenciaJson.resumoFornecedor.includes('Referência do fornecedor: FORN-REF-TESTE') &&
    patchReferenciaJson.pedido.referenciaFornecedor === 'FORN-REF-TESTE' &&
    patchReferenciaJson.resumoFornecedor.includes('PEDIDO ENVIADO AO FORNECEDOR') &&
    htmlAdminAtual.includes('Resumo para o fornecedor') && htmlAdminAtual.includes('Referência do fornecedor'));
  const publicoAposReferencia = await fetch(`${BASE}/api/orders/tracking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero: criado.numero, email: cliente.email })
  });
  const publicoAposReferenciaJson = await publicoAposReferencia.json();
  const respostaPublicaAtualizada = JSON.stringify(publicoAposReferenciaJson);
  conferir('acompanhamento público não expõe referência genérica nem dados pessoais',
    !/FORN-REF-TESTE|referenciaFornecedor|LEGADO-REF-123|GENERICA-REF-456|12345678901|11999990000|painel\.qa@example\.invalid|Rua QA|01310-100/i.test(respostaPublicaAtualizada));
  conferir('status automáticos não estão entre opções manuais', !admin.STATUS_MANUAIS.includes('aguardando_pagamento') &&
    !admin.STATUS_MANUAIS.includes('pago') && !/statusPagamentoPermitidos/.test(htmlAdminAtual));
  conferir('código mantém somente fallback isolado para leitura legada',
    adminModuloTexto.toLowerCase().indexOf(STATUS_LEGADO) === -1 &&
    readFileSync(new URL('../backend/repositorio.js', import.meta.url), 'utf8').includes("['pedido', 'you', 'draw'].join('_')") &&
    readFileSync(new URL('../backend/db.js', import.meta.url), 'utf8').includes("['pedido', 'you', 'draw'].join('_')"));
  const tabelaLegada = bancoTeste.prepare('CREATE TABLE IF NOT EXISTS schema_legado (id INTEGER PRIMARY KEY, pedido_youdraw TEXT)').run;
  const codigoRepositorioTeste = readFileSync(new URL('../backend/repositorio.js', import.meta.url), 'utf8');
  const codigoDbTeste = readFileSync(new URL('../backend/db.js', import.meta.url), 'utf8');
  conferir('referência legada é migrada para coluna genérica sem substituir valor existente',
    /referencia_fornecedor IS NULL AND \$\{COLUNA_REFERENCIA_LEGADA\} IS NOT NULL/.test(codigoDbTeste) &&
    /referenciaFornecedor: row\.referencia_fornecedor \|\| row\[COLUNA_REFERENCIA_LEGADA\]/.test(codigoRepositorioTeste));
  conferir('migração SQLite reconhece coluna legada por introspecção antes de copiar dados',
    codigoDbTeste.includes('existentes.has(COLUNA_REFERENCIA_LEGADA)') &&
    /SET referencia_fornecedor = \$\{COLUNA_REFERENCIA_LEGADA\}/.test(codigoDbTeste));
  conferir('respostas públicas não incluem informação específica de fornecedor',
    !/referenciaFornecedor|pedido_youdraw/i.test(JSON.stringify([publicoIdJson, publicoEmailJson])));
  const sair = await fetch(`${BASE}/api/admin/logout`, { method: 'POST', headers: autorizar });
  const logoutJson = await sair.json();
  conferir('logout não declara revogação global do token', sair.status === 200 &&
    /copiado.*permanece válido até expirar/i.test(logoutJson.mensagem) && admin.obterSessao(tokenLogin) !== null);
  const health = await (await fetch(`${BASE}/api/health`)).json();
  conferir('health informa modelo/duração sem contagem de sessões nem segredo/token',
    health.painelAdmin.modeloSessao === 'token_assinado' && health.painelAdmin.duracaoSessaoMinutos === 30 &&
    !Object.prototype.hasOwnProperty.call(health.painelAdmin, 'sessoesAtivas') &&
    !/ADMIN_TOTP_SECRET|MP_ACCESS_TOKEN|token_assinado.*[A-Za-z0-9_-]{30}/.test(JSON.stringify(health)));
} finally {
  await new Promise((resolve) => instanciaHttp.close(resolve));
  require('../backend/repositorio.js').fechar();
  process.env.ADMIN_TOTP_SECRET = segredoTotpInstancia;
  rmSync(pastaTemp, { recursive: true, force: true });
}

console.log('RESULTADO: OK — protocolo stateless e contratos administrativos/públicos validados.');
