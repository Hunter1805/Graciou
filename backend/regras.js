/**
 * ═══════════════════════════════════════
 * GRACIOU — REGRAS DO PEDIDO (recálculo no servidor)
 * Arquivo: backend/regras.js
 * ═══════════════════════════════════════
 *
 * ─── A REGRA CENTRAL DESTA CAMADA ────────────────────────────
 * NADA que venha do navegador é confiável para dinheiro.
 * Preço, desconto, frete, total e quantidade de peças são SEMPRE
 * recalculados aqui, a partir de:
 *   - dados/catalogo.js  (fonte única de produtos, preços e cupons)
 *
 * Do navegador aproveitamos apenas: QUAIS produtos, tamanho, cor e
 * QUANTIDADE — e mesmo esses são validados contra o catálogo.
 * Qualquer `total`, `subtotal`, `desconto` ou `precoUnitario` enviado
 * pelo cliente é IGNORADO.
 *
 * ─── O QUE NÃO EXISTE AQUI (de propósito) ──────────────────
 * - Nenhum campo de cartão (número, CVV, validade, bandeira).
 * - Nenhuma chamada ao Mercado Pago.
 * - Nenhuma criação de preferência de pagamento.
 */

'use strict';

const path = require('node:path');

/* ─────────────────────────────────────────────
   CATÁLOGO CENTRAL — fonte única
   O UMD de dados/catalogo.js detecta o Node e exporta via
   module.exports, então o require funciona sem wrapper nenhum.
   ───────────────────────────────────────────── */
const CAMINHO_CATALOGO = path.join(__dirname, '..', 'dados', 'catalogo.js');
const CATALOGO = require(CAMINHO_CATALOGO);

const META = CATALOGO.META;
const UFS_BRASIL = META.frete.ufs.sulSudesteSP.concat(META.frete.ufs.centroOesteNordesteNorte);

/* ─────────────────────────────────────────────
   UTF-8: o arquivo é lido do disco pelo Node como UTF-8.
   Se por algum motivo o JSON sair com acento quebrado, é aqui que
   se percebe — por isso os testes checam "São Paulo" e "Avenida
   Paulista" voltando íntegros.
   ───────────────────────────────────────────── */
const FORMA_PAGAMENTO_VALIDAS = ['pix', 'cartao'];

/* Tamanhos aceitos por produto vêm de produto.tamanhos (grade oficial). */
function tamanhosDoProduto(produto) {
  return Array.isArray(produto && produto.tamanhos) ? produto.tamanhos : [];
}

function coresDoProduto(produto) {
  return Array.isArray(produto && produto.cores) ? produto.cores : [];
}

/* ─────────────────────────────────────────────
   VALIDAÇÃO — erros viram resposta 400 com lista de campos
   ───────────────────────────────────────────── */

class ErroDeValidacao extends Error {
  constructor(campos, mensagem) {
    super(mensagem || 'Dados inválidos.');
    this.name = 'ErroDeValidacao';
    this.status = 400;
    this.campos = campos || [];
  }
}

const texto = (v) => String(v === null || v === undefined ? '' : v).trim();

/** Normaliza forma de pagamento; qualquer valor estranho vira 'pix'. */
function normalizarForma(forma) {
  const f = texto(forma).toLowerCase();
  return f === 'cartao' ? 'cartao' : 'pix';
}

/* Espelha a validação do checkout — o cliente pode ser burlado. */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const digitos = (v) => texto(v).replace(/\D/g, '');

const CAMPOS_CLIENTE = [
  { chave: 'nome', rotulo: 'Nome completo' },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'telefone', rotulo: 'Telefone' },
  { chave: 'cpf', rotulo: 'CPF' }
];

const CAMPOS_ENDERECO = [
  { chave: 'cep', rotulo: 'CEP' },
  { chave: 'estado', rotulo: 'Estado' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'bairro', rotulo: 'Bairro' },
  { chave: 'rua', rotulo: 'Rua' },
  { chave: 'numero', rotulo: 'Número' }
];

/* Campos que, se enviados pelo cliente, são descartados em silêncio.
   Servem para provar que valores de dinheiro nunca vêm do navegador. */
const CAMPOS_DINHEIRO_DO_CLIENTE = [
  'subtotal', 'desconto', 'frete', 'total',
  'precoUnitario', 'subtotalLinha', 'pecas', 'valorFrete'
];

/**
 * Valida o corpo recebido e devolve a versão limpa.
 * Lança ErroDeValidacao (400) quando algo obrigatório falta ou é inválido.
 */
function validarCorpo(corpo) {
  const erros = [];

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroDeValidacao([{ campo: 'corpo', mensagem: 'Corpo JSON inválido.' }], 'Corpo JSON inválido.');
  }

  /* ── Cliente ── */
  const clienteEntrada = (corpo.cliente && typeof corpo.cliente === 'object') ? corpo.cliente : {};
  const cliente = {};

  for (const { chave, rotulo } of CAMPOS_CLIENTE) {
    const valor = texto(clienteEntrada[chave]);
    if (!valor) {
      erros.push({ campo: 'cliente.' + chave, mensagem: `Informe ${rotulo.toLowerCase()}.` });
    }
    cliente[chave] = valor;
  }

  if (cliente.email && !RE_EMAIL.test(cliente.email)) {
    erros.push({ campo: 'cliente.email', mensagem: 'E-mail inválido.' });
  }

  const digitosTelefone = digitos(cliente.telefone);
  if (cliente.telefone && (digitosTelefone.length < 10 || digitosTelefone.length > 11)) {
    erros.push({ campo: 'cliente.telefone', mensagem: 'Telefone inválido: use DDD + número.' });
  }

  const digitosCpf = digitos(cliente.cpf);
  if (cliente.cpf && digitosCpf.length !== 11) {
    erros.push({ campo: 'cliente.cpf', mensagem: 'CPF inválido: use 11 dígitos.' });
  }

  /* ── Endereço ── */
  const enderecoEntrada = (corpo.endereco && typeof corpo.endereco === 'object') ? corpo.endereco : {};
  const endereco = {};

  for (const { chave, rotulo } of CAMPOS_ENDERECO) {
    const valor = texto(enderecoEntrada[chave]);
    if (!valor) {
      erros.push({ campo: 'endereco.' + chave, mensagem: `Informe ${rotulo.toLowerCase()}.` });
    }
    endereco[chave] = valor;
  }
  /* Complemento é opcional, por decisão do formulário. */
  endereco.complemento = texto(enderecoEntrada.complemento);

  const digitosCep = digitos(endereco.cep);
  if (endereco.cep && digitosCep.length !== 8) {
    erros.push({ campo: 'endereco.cep', mensagem: 'CEP inválido: use 8 dígitos.' });
  }

  endereco.estado = endereco.estado.toUpperCase();
  if (!endereco.estado || UFS_BRASIL.indexOf(endereco.estado) === -1) {
    erros.push({ campo: 'endereco.estado', mensagem: 'Informe uma UF válida do Brasil (ex.: SP).' });
  }

  /* ── Itens ── */
  if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
    erros.push({ campo: 'itens', mensagem: 'O pedido precisa de ao menos uma peça.' });
  }

  if (erros.length) throw new ErroDeValidacao(erros);

  /* ── Forma de pagamento (Pix | Cartão, nada de dado de cartão) ── */
  const formaInformada = texto(corpo.pagamento && corpo.pagamento.forma).toLowerCase();
  const forma = normalizarForma(formaInformada);
  if (formaInformada && FORMA_PAGAMENTO_VALIDAS.indexOf(formaInformada) === -1) {
    throw new ErroDeValidacao(
      [{ campo: 'pagamento.forma', mensagem: 'Forma de pagamento inválida: use "pix" ou "cartao".' }],
      'Forma de pagamento inválida.'
    );
  }

  /* "Limpa" a lista de itens para o formato canônico. Os campos de
     dinheiro que o cliente tenha mandado são simplesmente ignorados. */
  const itens = corpo.itens.map((bruto) => {
    const item = (bruto && typeof bruto === 'object') ? bruto : {};
    return {
      productId: texto(item.productId || item.id || item.produtoId),
      tamanho: texto(item.tamanho || item.size),
      cor: texto(item.cor || item.color),
      quantidade: item.quantidade
    };
  });

  return {
    cliente: cliente,
    endereco: endereco,
    itens: itens,
    formaPagamento: forma,
    cupomCodigo: texto(corpo.cupom && corpo.cupom.codigo),
    observacoes: texto(corpo.observacoes),
    /* Registrado só para os testes provarem que foi ignorado. */
    camposDinheiroIgnorados: CAMPOS_DINHEIRO_DO_CLIENTE.filter(
      (c) => Object.prototype.hasOwnProperty.call(corpo, c)
    )
  };
}

/* ─────────────────────────────────────────────
   RECÁLCULO DOS ITENS
   Preço, nome e cor saem do catálogo — não do navegador.
   ───────────────────────────────────────────── */

/**
 * Recalcula os itens contra o catálogo central.
 * Lança ErroDeValidacao quando o produto não existe ou o tamanho
 * não pertence à grade oficial daquele produto.
 */
function recalcularItens(itensBrutos, formaPagamento) {
  const erros = [];
  const linhas = [];
  let subtotal = 0;
  let pecas = 0;

  itensBrutos.forEach((item, indice) => {
    const ref = `itens[${indice}]`;

    if (!item.productId) {
      erros.push({ campo: ref + '.productId', mensagem: 'Item sem productId.' });
      return;
    }

    const produto = CATALOGO.busca(item.productId);
    if (!produto) {
      erros.push({ campo: ref + '.productId', mensagem: `Produto inexistente: "${item.productId}".` });
      return;
    }
    if (produto.ativo !== true) {
      erros.push({ campo: ref + '.productId', mensagem: `Produto indisponível: "${item.productId}".` });
      return;
    }

    /* ── Quantidade ── */
    const quantidade = Math.floor(Number(item.quantidade));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      erros.push({ campo: ref + '.quantidade', mensagem: 'Quantidade inválida: use um inteiro maior que zero.' });
      return;
    }
    if (quantidade > 99) {
      erros.push({ campo: ref + '.quantidade', mensagem: 'Quantidade acima do limite por item (99).' });
      return;
    }

    /* ── Tamanho: precisa pertencer à grade oficial do produto ── */
    const grade = tamanhosDoProduto(produto);
    const tamanho = item.tamanho || (grade.length === 1 ? grade[0] : '');
    if (!tamanho) {
      erros.push({ campo: ref + '.tamanho', mensagem: 'Informe o tamanho.' });
      return;
    }
    if (grade.indexOf(tamanho) === -1) {
      erros.push({
        campo: ref + '.tamanho',
        mensagem: `Tamanho inválido para "${produto.nome}": "${tamanho}". Disponíveis: ${grade.join(', ')}.`
      });
      return;
    }

    /* ── Cor: opcional; se vier, tem de existir; se não vier, usa a principal ── */
    const cores = coresDoProduto(produto).map((c) => c.nome);
    let cor = item.cor || produto.corPrincipal || '';
    if (item.cor && cores.length && cores.indexOf(item.cor) === -1) {
      erros.push({
        campo: ref + '.cor',
        mensagem: `Cor inválida para "${produto.nome}": "${item.cor}". Disponíveis: ${cores.join(', ')}.`
      });
      return;
    }

    /* ── PREÇO: sempre do catálogo, nunca do cliente ── */
    const precoUnitario = CATALOGO.precoPorForma(produto, formaPagamento);
    if (precoUnitario === null || typeof precoUnitario !== 'number') {
      erros.push({
        campo: ref + '.productId',
        mensagem: `Preço não confirmado para "${produto.nome}". Pedido recusado em vez de inventar valor.`
      });
      return;
    }

    const totalLinha = precoUnitario * quantidade;
    subtotal += totalLinha;
    pecas += quantidade;

    linhas.push({
      productId: produto.id,
      nome: produto.nome,
      categoria: produto.categoria || '',
      tamanho: tamanho,
      cor: cor,
      quantidade: quantidade,
      precoUnitario: precoUnitario,
      subtotal: totalLinha
    });
  });

  if (erros.length) throw new ErroDeValidacao(erros, 'Itens inválidos.');

  return { linhas: linhas, subtotal: subtotal, pecas: pecas };
}

/* ─────────────────────────────────────────────
   MONTAGEM DO PEDIDO
   ───────────────────────────────────────────── */

/**
 * Recalcula tudo e devolve o pedido pronto para gravar.
 *
 * `frete` segue fielmente META.valorFrete:
 *   2 peças ou mais → 0 (frete grátis)
 *   1 peça          → null (valor ainda NÃO informado pelo fornecedor)
 * Nenhum número de frete é inventado — a mesma regra do checkout.
 *
 * `total` fica null enquanto o frete for null, exatamente como a
 * estrutura combinada na etapa anterior.
 */
function montarPedido(entrada, agora) {
  const { linhas, subtotal, pecas } = recalcularItens(entrada.itens, entrada.formaPagamento);

  /* ── Cupom: validado e recalculado pela fonte central ── */
  const cupomResultado = entrada.cupomCodigo
    ? CATALOGO.descontoCupom(entrada.cupomCodigo, subtotal)
    : { valido: false, codigo: '', desconto: 0, motivo: '' };

  /* Cupom inválido não derruba o pedido: ele só não é aplicado.
     Registramos o motivo para o operador poder conferir depois. */
  const desconto = cupomResultado.valido ? cupomResultado.desconto : 0;

  if (entrada.cupomCodigo && !cupomResultado.valido) {
    entrada = Object.assign({}, entrada, {
      cupomRecusado: {
        codigo: CATALOGO.normalizarCupom(entrada.cupomCodigo),
        motivo: cupomResultado.motivo || 'Cupom inválido.'
      }
    });
  }

  /* ── Frete: regra do catálogo, baseada em PEÇAS ── */
  const situacaoFrete = CATALOGO.frete(pecas, entrada.endereco.estado);
  const frete = situacaoFrete.valor;
  if (situacaoFrete.erro) {
    throw new ErroDeValidacao([{ campo: 'endereco.estado', mensagem: situacaoFrete.erro }], situacaoFrete.erro);
  }

  const subtotalComDesconto = Math.max(0, subtotal - desconto);
  const total = frete === null ? null : subtotalComDesconto + frete;

  const momento = agora || new Date();

  /* Data local (não UTC) para casar com o fuso do operador. */
  const pad = (n) => String(n).padStart(2, '0');
  const criadoEmLocal = `${momento.getFullYear()}-${pad(momento.getMonth() + 1)}-${pad(momento.getDate())}T` +
    `${pad(momento.getHours())}:${pad(momento.getMinutes())}:${pad(momento.getSeconds())}`;

  return {
    criadoEm: criadoEmLocal,
    criadoEmISO: momento.toISOString(),
    pedido: {
      criadoEm: momento.toISOString(),
      cliente: entrada.cliente,
      endereco: entrada.endereco,
      itens: linhas,
      pagamento: {
        /* Forma escolhida apenas. NENHUM dado de cartão entra aqui. */
        forma: entrada.formaPagamento,
        status: 'aguardando'
      },
      cupom: cupomResultado.valido
        ? { codigo: cupomResultado.codigo, tipo: cupomResultado.tipo, valor: cupomResultado.valor }
        : null,
      cupomRecusado: entrada.cupomRecusado || null,
      subtotal: subtotal,
      desconto: desconto,
      frete: frete,
      total: total,
      pecas: pecas,
      statusPedido: 'aguardando_pagamento',
      observacoes: entrada.observacoes || '',
      camposDinheiroIgnorados: entrada.camposDinheiroIgnorados || []
    }
  };
}

module.exports = {
  CATALOGO: CATALOGO,
  CAMINHO_CATALOGO: CAMINHO_CATALOGO,
  ErroDeValidacao: ErroDeValidacao,
  validarCorpo: validarCorpo,
  recalcularItens: recalcularItens,
  montarPedido: montarPedido,
  normalizarForma: normalizarForma
};