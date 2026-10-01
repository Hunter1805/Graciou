/**
 * ═══════════════════════════════════════
 * GRACIOU — TESTES DO BACKEND (API de pedidos)
 * Arquivo: scripts/testar-backend.mjs
 * ═══════════════════════════════════════
 *
 * Uso:
 *   1) suba a API:   cd backend && npm run dev
 *   2) rode os testes:  node scripts/testar-backend.mjs
 *
 * Base padrão: http://localhost:3001 (passe outra como argumento).
 *
 * ─── OS TESTES OBRIGATÓRIOS DESTA ETAPA ──────────────────────
 *   1.  GET /api/health retorna status OK.
 *   2.  Criar pedido com uma camiseta.
 *   3.  Criar pedido com duas peças.
 *   4.  Validar frete grátis com duas peças.
 *   5.  Validar cupom BEMVINDO10 no servidor.
 *   6.  Rejeitar produto inexistente.
 *   7.  Rejeitar tamanho inválido.
 *   8.  Ignorar total adulterado enviado pelo navegador.
 *   9.  Consultar pedido criado por ID.
 *   10. Confirmar que nenhum dado de cartão é salvo.
 *   11. node --check nos arquivos JavaScript (feito fora deste script).
 *   12. Relatório de arquivos alterados (fora deste script).
 *
 * Os testes leem o BANCO DIRETAMENTE em alguns pontos, para provar o
 * que realmente foi gravado — e não só o que a API respondeu.
 */

import { setTimeout as esperar } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3001';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANCO = process.env.GRACIOU_DB || join(RAIZ, 'backend', 'data', 'graciou.sqlite');

/* ── Placar ── */
let falhas = 0;
const linhas = [];

function conferir(rotulo, recebido, esperado) {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  const ok = a === b;
  if (!ok) falhas++;
  linhas.push((ok ? '  \u2713 ' : '  \u2717 ') + rotulo + ' = ' + a + (ok ? '' : '   (esperado ' + b + ')'));
}
function conferirTexto(rotulo, recebido, contem) {
  const texto = String(recebido === null || recebido === undefined ? '' : recebido);
  const ok = texto.includes(contem);
  if (!ok) falhas++;
  linhas.push((ok ? '  \u2713 ' : '  \u2717 ') + rotulo + ' = "' + texto + '"' +
    (ok ? '' : '   (esperado conter "' + contem + '")'));
}
function secao(titulo) { linhas.push(''); linhas.push(titulo); }

/* ── Dados de apoio ── */
const CLIENTE = {
  nome: 'Maria de Souza',
  email: 'maria@exemplo.com',
  telefone: '(11) 98765-4321',
  cpf: '123.456.789-01'
};
const ENDERECO = {
  cep: '01310-100',
  estado: 'SP',
  cidade: 'São Paulo',
  bairro: 'Bela Vista',
  rua: 'Avenida Paulista',
  numero: '1000',
  complemento: 'Apto 42'
};

async function post(corpo) {
  const r = await fetch(BASE + '/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  let dados = null;
  try { dados = await r.json(); } catch (_) { dados = null; }
  return { status: r.status, dados };
}

/** Corpo mínimo válido, com os itens que o teste quiser. */
function corpoCom(itens, extras) {
  return Object.assign({
    cliente: CLIENTE,
    endereco: ENDERECO,
    itens: itens,
    pagamento: { forma: 'pix' }
  }, extras || {});
}

async function principal() {
  /* ── 0. A API está no ar? ── */
  let vivo = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok || r.status === 503) { vivo = true; break; }
    } catch (_) { /* ainda subindo */ }
    await esperar(250);
  }

  if (!vivo) {
    console.error('\nA API não respondeu em ' + BASE);
    console.error('Suba o backend antes de rodar os testes:');
    console.error('  cd backend && npm run dev\n');
    process.exitCode = 1;
    return;
  }

  /* ══════════════════════════════════════════════
     1. GET /api/health
     ══════════════════════════════════════════════ */
  secao('1) GET /api/health retorna status OK');
  const health = await fetch(BASE + '/api/health');
  const h = await health.json();
  conferir('HTTP', health.status, 200);
  conferir('status', h.status, 'OK');
  conferir('ok', h.ok, true);
  conferir('banco conectado', h.banco.conectado, true);
  conferir('tipo do banco', h.banco.tipo, 'sqlite');
  conferir('arquivo do banco', h.banco.arquivo, process.env.GRACIOU_DB ? 'graciou-frete-suite.sqlite' : 'graciou.sqlite');
  conferir('catalogo integro', h.catalogo.integro, true);
  conferir('pagamento NAO integrado', h.pagamentoIntegrado, false);
  /* O painel admin existe, mas NÃO cria usuário no banco: a credencial vive
     em variável de ambiente. `usuarioAdmin` diz se o painel está configurado. */
  conferir('painel admin usa credencial de ambiente (sem usuario no banco)',
    typeof h.usuarioAdmin, 'boolean');
  conferir('rota do painel informada', h.rotaAdmin, '/admin.html');

  /* ══════════════════════════════════════════════
     2. Criar pedido com UMA camiseta
     ══════════════════════════════════════════════ */
  secao('2) Criar pedido com uma camiseta');
  const r2 = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }]));
  conferir('HTTP', r2.status, 201);
  conferir('ok', r2.dados.ok, true);
  conferirTexto('numero do pedido comeca com GR-', r2.dados.numero, 'GR-');
  conferir('recalculado no servidor', r2.dados.recalculadoNoServidor, true);

  const p2 = r2.dados.pedido;
  conferir('subtotal da camiseta em centavos', p2.subtotal, 9990);
  conferir('uma linha de item', p2.itens.length, 1);
  conferir('tamanho gravado', p2.itens[0].tamanho, 'M');
  conferir('quantidade gravada', p2.itens[0].quantidade, 1);
  conferir('nome vem do catalogo', p2.itens[0].nome, 'Camiseta Raízes');
  conferir('preco unitario vem do catalogo', p2.itens[0].precoUnitario, 9990);
  /* Uma peça em SP usa a tabela regional. */
  conferir('frete SP com 1 peca', p2.frete, 1799);
  conferir('total SP com 1 peca', p2.total, 11789);
  conferir('status_pagamento', p2.pagamento.status, 'aguardando');
  conferir('forma de pagamento', p2.pagamento.forma, 'pix');
  conferir('status do pedido', p2.statusPedido, 'aguardando_pagamento');
  conferir('desconto zero', p2.desconto, 0);
  conferir('cupom null', p2.cupom, null);
  conferir('cliente gravado', p2.cliente.nome, 'Maria de Souza');
  conferir('estado normalizado em maiusculas', p2.endereco.estado, 'SP');
  conferir('acentos preservados (cidade)', p2.endereco.cidade, 'São Paulo');
  conferir('acentos preservados (rua)', p2.endereco.rua, 'Avenida Paulista');

  /* ══════════════════════════════════════════════
     3 e 4. Duas peças → frete grátis
     ══════════════════════════════════════════════ */
  secao('3) Criar pedido com duas peças  +  4) frete grátis com duas peças');
  const r34 = await post(corpoCom([
    { productId: 'tee-raizes', tamanho: 'M', quantidade: 1 },
    { productId: 'short-move', tamanho: 'P', quantidade: 1 }
  ]));
  conferir('HTTP', r34.status, 201);
  const p34 = r34.dados.pedido;
  conferir('duas linhas', p34.itens.length, 2);
  conferir('subtotal (9990 + 7990)', p34.subtotal, 17980);
  conferir('FRETE GRATIS = 0', p34.frete, 0);
  conferir('total com frete gratis (17980 + 0)', p34.total, 17980);
  conferir('numero diferente do pedido anterior', p34.id !== p2.id, true);

  /* Duas unidades do MESMO produto também contam 2 peças */
  const rDuasIguais = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: 2 }]));
  const pDuasIguais = rDuasIguais.dados.pedido;
  conferir('2 unidades do mesmo item: frete gratis', pDuasIguais.frete, 0);
  conferir('2 unidades do mesmo item: subtotal', pDuasIguais.subtotal, 19980);

  /* Uma peça em SP continua usando a tarifa regional. */
  const rUma = await post(corpoCom([{ productId: 'short-move', tamanho: 'P', quantidade: 1 }]));
  conferir('1 peca em SP usa frete regional', rUma.dados.pedido.frete, 1799);

  /* ══════════════════════════════════════════════
     5. Cupom BEMVINDO10 validado no servidor
     ══════════════════════════════════════════════ */
  secao('5) Cupom BEMVINDO10 no servidor');
  const r5 = await post(corpoCom([
    { productId: 'tee-raizes', tamanho: 'M', quantidade: 1 },
    { productId: 'short-move', tamanho: 'P', quantidade: 1 }
  ], { cupom: { codigo: 'bemvindo10' } }));

  conferir('HTTP', r5.status, 201);
  const p5 = r5.dados.pedido;
  conferir('cupom gravado normalizado', p5.cupom && p5.cupom.codigo, 'BEMVINDO10');
  conferir('tipo do cupom', p5.cupom && p5.cupom.tipo, 'percentual');
  conferir('subtotal sem desconto', p5.subtotal, 17980);
  conferir('desconto 10% calculado no servidor', p5.desconto, 1798);
  conferir('total = subtotal - desconto + frete', p5.total, 17980 - 1798 + 0);

  /* Cupom inválido não derruba o pedido: só não é aplicado */
  const rCupomRuim = await post(corpoCom([
    { productId: 'tee-raizes', tamanho: 'M', quantidade: 1 },
    { productId: 'short-move', tamanho: 'P', quantidade: 1 }
  ], { cupom: { codigo: 'CUPOM-QUE-NAO-EXISTE' } }));
  conferir('cupom invalido: pedido ainda criado', rCupomRuim.status, 201);
  conferir('cupom invalido: desconto zero', rCupomRuim.dados.pedido.desconto, 0);
  conferir('cupom invalido: cupom null no pedido', rCupomRuim.dados.pedido.cupom, null);
  conferirTexto('cupom invalido: aviso na resposta', rCupomRuim.dados.aviso, 'não aplicado');

  /* ══════════════════════════════════════════════
     6. Rejeitar produto inexistente
     ══════════════════════════════════════════════ */
  secao('6) Rejeitar produto inexistente');
  const r6 = await post(corpoCom([{ productId: 'produto-fantasma', tamanho: 'M', quantidade: 1 }]));
  conferir('HTTP', r6.status, 400);
  conferir('ok false', r6.dados.ok, false);
  conferirTexto('mensagem cita o produto', r6.dados.campos[0].mensagem, 'Produto inexistente');
  conferir('campo apontado', r6.dados.campos[0].campo, 'itens[0].productId');

  /* ══════════════════════════════════════════════
     7. Rejeitar tamanho inválido
     ══════════════════════════════════════════════ */
  secao('7) Rejeitar tamanho inválido');
  /* Short vai só até GG; XG não existe na grade dele. */
  const r7 = await post(corpoCom([{ productId: 'short-move', tamanho: 'XG', quantidade: 1 }]));
  conferir('HTTP', r7.status, 400);
  conferir('campo apontado', r7.dados.campos[0].campo, 'itens[0].tamanho');
  conferirTexto('mensagem lista os tamanhos validos', r7.dados.campos[0].mensagem, 'Disponíveis: P, M, G, GG');

  /* Tamanho válido em outro produto continua passando (controle) */
  const r7ok = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'XG', quantidade: 1 }]));
  conferir('controle: XG existe na camiseta', r7ok.status, 201);

  /* Quantidade inválida */
  const rQtd = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: 0 }]));
  conferir('quantidade zero rejeitada', rQtd.status, 400);
  const rQtdNeg = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: -3 }]));
  conferir('quantidade negativa rejeitada', rQtdNeg.status, 400);

  /* Campos obrigatórios ausentes */
  const rVazio = await post({ itens: [] });
  conferir('pedido sem cliente/endereco/itens rejeitado', rVazio.status, 400);
  conferirTexto('erro de nome presente', JSON.stringify(rVazio.dados.campos), 'cliente.nome');
  conferirTexto('erro de e-mail presente', JSON.stringify(rVazio.dados.campos), 'cliente.email');

  /* ══════════════════════════════════════════════
     8. Ignorar total adulterado enviado pelo navegador
     ══════════════════════════════════════════════ */
  secao('8) Ignorar total adulterado enviado pelo navegador');
  const r8 = await post(corpoCom([
    /* O cliente tenta forçar preço de R$ 0,01 por peça */
    { productId: 'tee-raizes', tamanho: 'M', quantidade: 1, precoUnitario: 1, subtotal: 1 },
    { productId: 'short-move', tamanho: 'P', quantidade: 1, precoUnitario: 1, subtotal: 1 }
  ], {
    /* E ainda mente nos totais do topo do corpo */
    subtotal: 1,
    desconto: 99999,
    frete: 0,
    total: 2,
    pecas: 99
  }));

  conferir('HTTP', r8.status, 201);
  const p8 = r8.dados.pedido;
  conferir('subtotal RECALCULADO (nao o do cliente)', p8.subtotal, 17980);
  conferir('desconto RECALCULADO (nao o do cliente)', p8.desconto, 0);
  conferir('total RECALCULADO (nao o do cliente)', p8.total, 17980);
  conferir('preco unitario vem do catalogo', p8.itens[0].precoUnitario, 9990);
  conferirTexto('registro de que os campos foram ignorados',
    JSON.stringify(r8.dados.valoresRecebidosDoClienteIgnorados),
    '"total"');
  conferirTexto('subtotal do cliente tambem listado',
    JSON.stringify(r8.dados.valoresRecebidosDoClienteIgnorados),
    '"subtotal"');

  /* Com cupom: o desconto também é recalculado, ignorando o do cliente */
  const r8b = await post(corpoCom([
    { productId: 'tee-raizes', tamanho: 'M', quantidade: 1 },
    { productId: 'short-move', tamanho: 'P', quantidade: 1 }
  ], { cupom: { codigo: 'BEMVINDO10' }, desconto: 17979, total: 1 }));
  conferir('desconto do cliente ignorado (com cupom)', r8b.dados.pedido.desconto, 1798);
  conferir('total do cliente ignorado (com cupom)', r8b.dados.pedido.total, 16182);

  /* Preço de cartão é diferente do Pix: o servidor precisa respeitar a forma */
  const r8c = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }],
    { pagamento: { forma: 'cartao' } }));
  conferir('forma cartao aceita', r8c.status, 201);
  conferir('preco de cartao usado no recalculo', r8c.dados.pedido.itens[0].precoUnitario, 10990);
  conferir('subtotal no cartao', r8c.dados.pedido.subtotal, 10990);

  /* Forma inválida é recusada (mas 'pix'/'cartao' são as únicas) */
  const r8d = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }],
    { pagamento: { forma: 'boleto' } }));
  conferir('forma de pagamento invalida rejeitada', r8d.status, 400);
  conferir('campo apontado', r8d.dados.campos[0].campo, 'pagamento.forma');

  /* ══════════════════════════════════════════════
     9. Consultar pedido por ID
     ══════════════════════════════════════════════ */
  secao('9) Consultar pedido criado por ID');
  const consulta = await fetch(BASE + '/api/orders/' + encodeURIComponent(p8.id));
  const lido = await consulta.json();
  conferir('HTTP', consulta.status, 200);
  conferir('ok', lido.ok, true);
  conferir('mesmo id', lido.pedido.id, p8.id);
  conferir('mesmo subtotal', lido.pedido.subtotal, p8.subtotal);
  conferir('mesmo total', lido.pedido.total, p8.total);
  conferir('mesmos itens', lido.pedido.itens.length, p8.itens.length);
  conferir('cliente persistido', lido.pedido.cliente.email, CLIENTE.email);
  conferir('endereco persistido (acentos)', lido.pedido.endereco.cidade, 'São Paulo');
  conferir('status_pagamento persistido', lido.pedido.pagamento.status, 'aguardando');
  conferir('status do pedido persistido', lido.pedido.statusPedido, 'aguardando_pagamento');
  conferir('rastreio vazio', lido.pedido.rastreio, null);

  const inexistente = await fetch(BASE + '/api/orders/GR-00000000-0000-XXXX');
  conferir('pedido inexistente -> 404', inexistente.status, 404);

  const rotaErrada = await fetch(BASE + '/api/nao-existe');
  conferir('rota desconhecida -> 404', rotaErrada.status, 404);

  /* ══════════════════════════════════════════════
     10. Nenhum dado de cartão é salvo
     ══════════════════════════════════════════════ */
  secao('10) Nenhum dado de cartão é salvo');

  /* 10a. O schema não tem coluna de cartão */
  const db = new DatabaseSync(BANCO);
  const colunasOrders = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name.toLowerCase());
  const colunasCoupons = db.prepare('PRAGMA table_info(coupons)').all().map((c) => c.name.toLowerCase());

  /* Nomes de coluna que indicariam dado de cartão.
     ATENÇÃO: aqui NÃO entra `validade` sozinha — ela é uma coluna
     legítima de `coupons` (data de expiração do cupom), pedida no
     escopo. O que seria suspeito é `validade_cartao`.
     Colunas de data de validade de cartão têm outro nome. */
  const SUSPEITAS = ['cartao', 'cartão', 'cvv', 'cvc', 'senha', 'codigo_seguranca',
    'bandeira', 'titular', 'card', 'credencial'];

  conferir('nenhuma coluna de cartao em orders',
    colunasOrders.filter((c) => SUSPEITAS.some((s) => c.includes(s))), []);
  conferir('nenhuma coluna de cartao em coupons',
    colunasCoupons.filter((c) => SUSPEITAS.some((s) => c.includes(s))), []);

  /* `validade` existe em coupons, mas é do CUPOM — nunca de cartão.
     Provamos que é isso mesmo conferindo o conteúdo gravado. */
  conferir('coupons.validade e do cupom (nao de cartao)',
    colunasCoupons.includes('validade'), true);

  /* 10b. A tabela orders tem exatamente as colunas do schema atual.
     `pedido_youdraw` e `atualizado_em` entram com o painel de pedidos. */
  conferir('colunas de orders (schema atual)',
    colunasOrders.slice().sort(),
    ['id', 'criado_em', 'cliente_nome', 'cliente_email', 'cliente_telefone', 'cliente_cpf',
      'endereco_json', 'itens_json', 'forma_pagamento', 'status_pagamento', 'cupom_codigo',
      'subtotal', 'desconto', 'frete', 'total', 'status_pedido', 'rastreio', 'observacoes',
      'pedido_youdraw', 'atualizado_em', 'mp_preference_id', 'mp_payment_id', 'mp_status', 'pago_em'].sort());

  conferir('colunas de coupons (schema da etapa)',
    colunasCoupons.slice().sort(),
    ['codigo', 'tipo', 'valor', 'ativo', 'valor_minimo', 'validade', 'limite_usos'].sort());

  /* 10c. Cupom espelhado do catálogo */
  const cupons = db.prepare('SELECT * FROM coupons ORDER BY codigo').all();
  conferir('BEMVINDO10 espelhado no banco', cupons.length >= 1, true);
  const be = cupons.find((c) => c.codigo === 'BEMVINDO10');
  conferir('cupom ativo no banco', be.ativo, 1);
  conferir('cupom percentual', be.tipo, 'percentual');
  conferir('cupom valor 10', be.valor, 10);

  /* 10d. Nenhum pedido gravado contém chave de cartão no JSON */
  const todos = db.prepare('SELECT * FROM orders').all();
  conferir('existem pedidos gravados para auditar', todos.length > 0, true);

  const chavesProibidas = [];
  for (const linha of todos) {
    for (const campo of ['endereco_json', 'itens_json', 'observacoes']) {
      const texto = String(linha[campo] || '').toLowerCase();
      for (const termo of ['cvv', 'cvc', 'numerocartao', 'numero_cartao', 'numerodocartao',
        'validade', 'bandeira', 'titular', 'senha']) {
        if (texto.includes('"' + termo + '"') || texto.includes(termo + ':')) {
          chavesProibidas.push(linha.id + ':' + campo + ':' + termo);
        }
      }
    }
  }
  conferir('nenhuma chave de cartao nos pedidos gravados', chavesProibidas, []);

  /* 10e. A API não aceita nem devolve campo de cartão */
  const r10 = await post(corpoCom([{ productId: 'tee-raizes', tamanho: 'M', quantidade: 1 }], {
    pagamento: {
      forma: 'cartao',
      numeroCartao: '4111111111111111',
      cvv: '123',
      validade: '12/2030',
      titular: 'MARIA DE SOUZA'
    }
  }));
  const textoResposta = JSON.stringify(r10.dados).toLowerCase();
  conferir('numero de cartao nao volta na resposta', textoResposta.includes('4111111111111111'), false);
  conferir('cvv nao volta na resposta', textoResposta.includes('"cvv"'), false);
  conferir('validade nao volta na resposta', textoResposta.includes('12/2030'), false);

  /* Confere no BANCO que nada disso foi persistido */
  const linha10 = db.prepare('SELECT * FROM orders WHERE id = :id').get({ id: r10.dados.pedido.id });
  const tudoDaLinha = JSON.stringify(linha10).toLowerCase();
  conferir('numero de cartao nao esta no banco', tudoDaLinha.includes('4111111111111111'), false);
  conferir('cvv nao esta no banco', tudoDaLinha.includes('"cvv"'), false);
  conferir('a forma escolhida (cartao) foi salva', linha10.forma_pagamento, 'cartao');
  conferir('o status de pagamento e aguardando', linha10.status_pagamento, 'aguardando');

  /* 10f. Nenhum dado de cartão no CLIENTE gravado */
  const chavesSuspeitasNoPedido = [];
  for (const linha of todos) {
    const clienteJson = JSON.stringify({
      nome: linha.cliente_nome, email: linha.cliente_email,
      telefone: linha.cliente_telefone, cpf: linha.cliente_cpf
    }).toLowerCase();
    for (const termo of ['cvv', 'cvc', 'numerocartao', 'validade', 'bandeira', 'titular']) {
      if (clienteJson.includes(termo)) chavesSuspeitasNoPedido.push(linha.id + ':' + termo);
    }
  }
  conferir('nenhum termo de cartao nos dados do cliente', chavesSuspeitasNoPedido, []);

  db.close();

  /* ══════════════════════════════════════════════
     11. CORS restrito ao frontend local
     ══════════════════════════════════════════════ */
  secao('11) CORS somente para o frontend local');
  const corsBom = await fetch(BASE + '/api/health', { headers: { Origin: 'http://localhost:3000' } });
  conferir('origem local autorizada', corsBom.headers.get('access-control-allow-origin'), 'http://localhost:3000');

  const corsRuim = await fetch(BASE + '/api/health', { headers: { Origin: 'https://site-qualquer.example' } });
  conferir('origem externa NAO autorizada', corsRuim.headers.get('access-control-allow-origin'), null);

  const codigoFonte = readFileSync(join(RAIZ, 'backend', 'servidor.js'), 'utf8');
  conferir('CORS nao usa curinga "*"', /allow-origin['"]?\s*,\s*['"]\*['"]/i.test(codigoFonte), false);

  /* ══════════════════════════════════════════════
     12. Logs sem dado sensível  +  escopo da etapa
     ══════════════════════════════════════════════ */
  secao('12) Logs sem dados sensíveis e escopo da etapa');
  conferir('log nao imprime e-mail do cliente', /log\([^)]*\.email/i.test(codigoFonte), false);
  conferir('log nao imprime CPF', /log\([^)]*\.cpf/i.test(codigoFonte), false);
  conferir('log nao imprime endereco', /log\([^)]*\.rua/i.test(codigoFonte), false);

  conferir('referencia ao Mercado Pago documentada no backend',
    /mercado pago|mercadopago/i.test(codigoFonte), true);
  /* O painel admin é intencional. O que NÃO pode existir é cadastro de
     usuário no banco nem rota pública de usuários. As rotas /api/admin/*
     exigem sessão (verificadas na seção 13). */
  conferir('sem rota publica de usuarios',
    /app\.(get|post|put|delete)\(\s*['"]\/api\/usuarios/i.test(codigoFonte), false);

  /* Nenhuma dependência proibida instalada */
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'backend', 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  conferir('unica dependencia e o express', deps, ['express']);
  conferir('sem PostgreSQL', deps.some((d) => /pg|postgres|sequelize|prisma/i.test(d)), false);
  conferir('sem Shopify/Nuvemshop', deps.some((d) => /shopify|nuvemshop|tiendanube/i.test(d)), false);
  conferir('script dev existe', typeof pkg.scripts.dev, 'string');
  conferir('script start existe', typeof pkg.scripts.start, 'string');

  /* O banco realmente foi criado no caminho pedido */
  conferir('banco configurado existe', existsSync(BANCO), true);

  /* ══════════════════════════════════════════════
     13. Painel admin: exige sessão e não guarda senha
     As credenciais vêm de ADMIN_EMAIL/ADMIN_PASSWORD, então estes
     testes rodam com ou sem o painel configurado.
     ══════════════════════════════════════════════ */
  secao('13) Painel admin: sessão obrigatória e nenhuma senha no banco');

  /* Sem token, nenhuma rota de pedido administrativa responde dado. */
  const semToken = await fetch(BASE + '/api/admin/orders');
  conferir('lista sem token -> 401/503', [401, 503].includes(semToken.status), true);

  const detalheSemToken = await fetch(BASE + '/api/admin/orders/' + encodeURIComponent(p8.id));
  conferir('detalhe sem token -> 401/503', [401, 503].includes(detalheSemToken.status), true);

  const patchSemToken = await fetch(BASE + '/api/admin/orders/' + encodeURIComponent(p8.id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusPedido: 'pago' })
  });
  conferir('atualizacao sem token -> 401/503', [401, 503].includes(patchSemToken.status), true);

  /* Token inventado também não passa. */
  const tokenFalso = await fetch(BASE + '/api/admin/orders', {
    headers: { Authorization: 'Bearer token-inventado' }
  });
  conferir('token inventado -> 401/503', [401, 503].includes(tokenFalso.status), true);

  /* Sem token, o pedido continua intacto (a recusa foi real, não decorativa). */
  const pedidoAposRecusa = await (await fetch(BASE + '/api/orders/' + encodeURIComponent(p8.id))).json();
  conferir('pedido NAO foi alterado pela tentativa sem token',
    pedidoAposRecusa.pedido.statusPedido, 'aguardando_pagamento');

  /* A senha do painel nunca é persistida: não há coluna de senha
     em nenhuma tabela do banco. */
  const colunasTodas = [...colunasOrders, ...colunasCoupons];
  conferir('nenhuma coluna de senha/token no banco',
    colunasTodas.filter((c) => /senha|password|token|hash|secret/i.test(c)), []);

  /* E o código-fonte não guarda credencial literal. */
  const fonteAdmin = readFileSync(join(RAIZ, 'backend', 'admin.js'), 'utf8');
  conferir('admin.js le credencial do ambiente',
    /process\.env\.ADMIN_EMAIL/.test(fonteAdmin) && /process\.env\.ADMIN_PASSWORD/.test(fonteAdmin), true);
  conferir('nenhuma senha literal no codigo',
    /(senha|password)\s*[:=]\s*['"][^'"]{3,}['"]/i.test(fonteAdmin.replace(/process\.env\.ADMIN_PASSWORD/g, '')), false);

  /* ── Relatório ── */
  console.log('\nGRACIOU — testes do backend (API de pedidos)');
  console.log('===========================================');
  console.log('base: ' + BASE);
  linhas.forEach((l) => console.log(l));
  console.log(falhas === 0
    ? '\nRESULTADO: OK — todos os testes do backend passaram.\n'
    : '\nRESULTADO: FALHOU com ' + falhas + ' divergência(s).\n');

  if (falhas > 0) process.exitCode = 1;
}

principal().catch((e) => {
  console.error('FALHA NA VALIDACAO:', e && e.message);
  if (e && e.stack) console.error(e.stack);
  process.exitCode = 1;
});