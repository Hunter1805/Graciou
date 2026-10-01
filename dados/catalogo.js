/**
 * ═══════════════════════════════════════════════════════════════
 * GRACIOU — FONTE ÚNICA DE CATÁLOGO
 * Arquivo: dados/catalogo.js
 * ═══════════════════════════════════════
 *
 * Este é o ÚNICO lugar onde os produtos do GRACIOU são definidos.
 * Nenhuma lista de produtos deve ser copiada para HTML, CSS ou JS.
 * As páginas consomem este catálogo em tempo de execução.
 *
 * ETAPA ATUAL: organização de catálogo apenas.
 * NÃO há carrinho real, checkout, banco de dados nem pagamento.
 *
 * ─── SOBRE OS PREÇOS ─────────────────────────────────────────
 * TABELA OFICIAL RECEBIDA — preços em CENTAVOS (inteiro):
 *   Camisetas (normais e dryfit):  Pix 9990  · Cartão 10990
 *   Short:                         Pix 7990  · Cartão 7990 (temporário)
 *
 * `precoConfirmado: true` nos 8 produtos: os valores acima são oficiais.
 * `custoYouDraw` continua `null` — o custo de fornecedor NÃO foi informado,
 * e nenhum valor será inventado.
 *
 * ─── SOBRE O FRETE ───────────────────────────────────────────
 * Regra vigente: frete grátis a partir de 2 peças no pedido.
 * O VALOR do frete normal NÃO foi informado (`valorFrete: null`).
 * A interface deve exibir "a calcular" em vez de inventar um número.
 *
 * ─── SOBRE AS IMAGENS ────────────────────────────────────────
 * `imagemFrente` / `imagemCostas` estão como `null`.
 * O produto não tem imagem real ainda; o protótipo exibe um
 * placeholder de marca (árvore GRACIOU) no lugar. Isso preserva o
 * design atual sem inventar fotos.
 * REGRA DE MARCA: a frente traz somente GRACIOU centralizado;
 * as estampas ficam principalmente nas costas. Por isso a galeria
 * deve sempre abrir pela FRENTE e mostrar a COSTA em segundo.
 */

(function (root, factory) {
  'use strict';
  var api = factory();

  /* CommonJS (Node - usado por scripts/verificar-catalogo.js) */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  /* Navegador */
  if (root) {
    root.GRACIOU_CATALOGO = api;
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  /* ─────────────────────────────────────────────
     METADADOS DA MARCA E DO DROP (referência)
     ───────────────────────────────────────────── */
  var META = {
    marca: 'GRACIOU',
    slogan: 'Graça em cada fio',
    fornecedor: 'YouDraw',
    pedidoManual: true,
    /* Tabela oficial recebida: preços reais, confirmados. */
    precosConfirmados: true,
    categorias: [
      { id: 'drop-01', nome: 'Drop 01', colecao: 'Drop 01' },
      { id: 'graciou-move', nome: 'GRACIOU Move', colecao: 'GRACIOU Move' }
    ],

    /* ─── FORMAS DE PAGAMENTO (tabela oficial, em centavos) ───
       Camisetas normais e dryfit: Pix 9990 · Cartão 10990
       Short:                      Pix 7990 · Cartão 7990 (temporário) */
    pagamento: {
      pix: { id: 'pix', nome: 'Pix', desconto: true },
      cartao: { id: 'cartao', nome: 'Cartão', desconto: false }
    },

    /* ─── FRETE ───────────────────────────────────────────────
       Regra: 2 peças ou mais = frete grátis (peça = unidade, não modelo:
       2 camisetas contam 2 peças; 1 camiseta + 1 short contam 2 peças).
       1 peça usa o frete normal, cujo VALOR ainda não foi informado.
       `valorFrete: null` = valor desconhecido. NUNCA inventar um número. */
    frete: {
      gratisQuantidadeMinima: 2,
      valoresPorGrupo: { sulSudesteSP: 1799, centroOesteNordesteNorte: 2499 },
      ufs: {
        sulSudesteSP: ['PR', 'RS', 'SC', 'ES', 'MG', 'RJ', 'SP'],
        centroOesteNordesteNorte: [
          'DF', 'GO', 'MT', 'MS', 'AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE',
          'AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'
        ]
      }
    },
    freteGratisAtivo: true,
    freteGratisQuantidadeMinima: 2,

    /* ─── CUPONS OFICIAIS ─────────────────────
       `valor` percentual é uma porcentagem; em cupom `fixo`, `valor`
       será sempre em centavos. A lista é a única fonte de cupons do
       projeto — não duplicar códigos em HTML ou em outros scripts. */
    cupons: [
      {
        codigo: 'BEMVINDO10',
        tipo: 'percentual',
        valor: 10,
        ativo: true,
        valorMinimo: 0,
        limiteUsos: null,
        validade: null
      }
    ],

    /* Paleta oficial da marca — não alterar (identidade visual) */
    paleta: {
      creme: '#FDFDD0',
      verdeMusgo: '#4F5D3A',
      verdeMusgoClaro: '#6B7A50',
      verdeMusgoEscuro: '#3A4529',
      preto: '#1A1A1A',
      offWhite: '#F2F0E4',
      marrom: '#8B7355',
      verdeMilitar: '#4A5D3A'
    },
    /* Aviso exibido na interface apenas quando faltar preço para um
       produto. Com a tabela oficial recebida, nenhum dos 8 produtos
       cai neste caso — o rótulo fica como rede de segurança. */
    avisoPreco: 'PREÇO EM BREVE'
  };

  /* ─────────────────────────────────────────────
     ORDEM OFICIAL DOS TAMANHOS
     Usada para ordenar as grades de tamanho na UI.
     ───────────────────────────────────────────── */
  var ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

  /* ─────────────────────────────────────────────
     CATÁLOGO OFICIAL — DROP 01 (8 produtos)
     ───────────────────────────────────────────── */
  var PRODUTOS = [
    {
      id: 'tee-graca-permanece',
      slug: 'camiseta-a-graca-permanece',
      nome: 'Camiseta A Graça Permanece',
      categoria: 'Drop 01',
      categoriaId: 'drop-01',
      tipo: 'Camiseta Oversized Suedine 220g',
      corPrincipal: 'Verde-musgo',
      cores: [{ nome: 'Verde-musgo', hex: '#4F5D3A' }],
      tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      descricao: 'Camiseta oversized em Suedine 220g, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'tee-firmado',
      slug: 'camiseta-firmado',
      nome: 'Camiseta Firmado',
      categoria: 'Drop 01',
      categoriaId: 'drop-01',
      tipo: 'Camiseta Oversized Suedine 220g',
      corPrincipal: 'Preto',
      cores: [{ nome: 'Preto', hex: '#1A1A1A' }],
      tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      descricao: 'Camiseta oversized em Suedine 220g, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'tee-sagrado',
      slug: 'camiseta-o-sagrado-nao-precisa-gritar',
      nome: 'Camiseta O Sagrado Não Precisa Gritar',
      categoria: 'Drop 01',
      categoriaId: 'drop-01',
      tipo: 'Camiseta Oversized Suedine 220g',
      corPrincipal: 'Off-white',
      cores: [{ nome: 'Off-white', hex: '#F2F0E4' }],
      tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      descricao: 'Camiseta oversized em Suedine 220g, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'tee-pela-graca',
      slug: 'camiseta-pela-graca',
      nome: 'Camiseta Pela Graça',
      categoria: 'Drop 01',
      categoriaId: 'drop-01',
      tipo: 'Camiseta Oversized Suedine 220g',
      corPrincipal: 'Marrom',
      cores: [{ nome: 'Marrom', hex: '#8B7355' }],
      tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      descricao: 'Camiseta oversized em Suedine 220g, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'tee-raizes',
      slug: 'camiseta-raizes',
      nome: 'Camiseta Raízes',
      categoria: 'Drop 01',
      categoriaId: 'drop-01',
      tipo: 'Camiseta Oversized Suedine 220g',
      corPrincipal: 'Verde militar',
      cores: [{ nome: 'Verde militar', hex: '#4A5D3A' }],
      tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
      descricao: 'Camiseta oversized em Suedine 220g, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'dryfit-move',
      slug: 'camiseta-dryfit-move-with-faith',
      nome: 'Camiseta Dryfit Move With Faith',
      categoria: 'GRACIOU Move',
      categoriaId: 'graciou-move',
      tipo: 'Camiseta Dryfit',
      corPrincipal: 'Preto',
      cores: [{ nome: 'Preto', hex: '#1A1A1A' }],
      tamanhos: ['P', 'M', 'G', 'GG'],
      descricao: 'Camiseta dryfit da linha GRACIOU Move, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta dryfit: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'dryfit-forte-serena',
      slug: 'camiseta-dryfit-forte-e-serena',
      nome: 'Camiseta Dryfit Forte e Serena',
      categoria: 'GRACIOU Move',
      categoriaId: 'graciou-move',
      tipo: 'Camiseta Dryfit',
      corPrincipal: 'Verde militar',
      cores: [{ nome: 'Verde militar', hex: '#4A5D3A' }],
      tamanhos: ['P', 'M', 'G', 'GG'],
      descricao: 'Camiseta dryfit da linha GRACIOU Move, com frente limpa trazendo apenas GRACIOU centralizado. A estampa principal fica nas costas.',
      /* Camiseta dryfit: Pix 99,90 · Cartão 109,90 (centavos) */
      precoVenda: 9990,
      precoCartao: 10990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    },
    {
      id: 'short-move',
      slug: 'short-2-em-1-graciou-move',
      nome: 'Short 2 em 1 GRACIOU Move',
      categoria: 'GRACIOU Move',
      categoriaId: 'graciou-move',
      tipo: 'Short 2 em 1',
      corPrincipal: 'Preto',
      cores: [{ nome: 'Preto', hex: '#1A1A1A' }],
      tamanhos: ['P', 'M', 'G', 'GG'],
      descricao: 'Short 2 em 1 da linha GRACIOU Move, com sunga interna. Frente limpa e identidade GRACIOU discreta.',
      /* Short: Pix 79,90 · Cartão 79,90 (temporário) — centavos */
      precoVenda: 7990,
      precoCartao: 7990,
      custoYouDraw: null,
      precoConfirmado: true,
      sku: null,
      imagemFrente: null,
      imagemCostas: null,
      imagensDetalhe: [],
      ativo: true
    }
  ];

  /* ─────────────────────────────────────────────
     CAMPOS OBRIGATÓRIOS DE UM PRODUTO
     Usado pela verificação de integridade.
     ───────────────────────────────────────────── */
  var CAMPOS_OBRIGATORIOS = [
    'id', 'slug', 'nome', 'categoria', 'categoriaId', 'tipo', 'corPrincipal',
    'cores', 'tamanhos', 'descricao', 'precoVenda', 'precoCartao', 'custoYouDraw',
    'precoConfirmado', 'sku', 'imagemFrente', 'imagemCostas', 'imagensDetalhe', 'ativo'
  ];

  /* ─────────────────────────────────────────────
     CONSULTAS
     ───────────────────────────────────────────── */
  var porId = {};
  for (var i = 0; i < PRODUTOS.length; i++) {
    porId[PRODUTOS[i].id] = PRODUTOS[i];
  }

  function lista() {
    /* Retorna apenas produtos ativos, na ordem oficial do catálogo */
    return PRODUTOS.filter(function (p) { return p.ativo; });
  }

  function busca(id) {
    return porId[id] || null;
  }

  function porCategoria(categoriaId) {
    return lista().filter(function (p) { return p.categoriaId === categoriaId; });
  }

  function ordenarTamanhos(tamanhos) {
    return (tamanhos || []).slice().sort(function (a, b) {
      var ia = ORDEM_TAMANHOS.indexOf(a);
      var ib = ORDEM_TAMANHOS.indexOf(b);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      return ia - ib;
    });
  }

  /**
   * Preço para exibição.
   * Enquanto o preço oficial não existir, retorna null e a UI mostra
   * META.avisoPreco — nunca um valor inventado.
   */
  function precoExibicao(id) {
    var p = busca(id);
    if (!p || !p.precoConfirmado || p.precoVenda === null) return null;
    return p.precoVenda;
  }

  /**
   * Formata um preço em centavos para "R$ 000,00".
   * Aceita centavos (inteiro). Retorna o aviso de preço quando null.
   */
  function formatarPreco(centavos) {
    if (centavos === null || typeof centavos === 'undefined') return null;
    var valor = (centavos / 100).toFixed(2).replace('.', ',');
    return 'R$ ' + valor;
  }

  /* ─────────────────────────────────────────────
     PREÇO POR FORMA DE PAGAMENTO
     Tabela oficial (centavos):
       Camisetas (normais e dryfit): Pix 9990 · Cartão 10990
       Short:                       Pix 7990 · Cartão 7990
     O short está com o MESMO valor no cartão TEMPORARIAMENTE.
     Nenhum valor é calculado por desconto percentual: os dois valores
     são explícitos no produto (precoVenda = Pix, precoCartao = cartão).
     ───────────────────────────────────────────── */

  /** Normaliza a forma de pagamento. Sem argumento, assume 'pix'. */
  function normalizarForma(forma) {
    var f = String(forma || 'pix').trim().toLowerCase();
    if (f === 'card' || f === 'credito' || f === 'crédito' || f === 'cartao' || f === 'cartão') return 'cartao';
    return 'pix';
  }

  /**
   * Preço oficial de UM produto na forma de pagamento pedida.
   * Retorna null quando o preço não está confirmado — nunca inventa valor.
   */
  function precoPorForma(produtoOuId, forma) {
    var p = (typeof produtoOuId === 'string') ? busca(produtoOuId) : produtoOuId;
    if (!p || !p.precoConfirmado) return null;

    if (normalizarForma(forma) === 'cartao') {
      /* Sem preço de cartão cadastrado, o valor do Pix é a referência. */
      if (typeof p.precoCartao === 'number') return p.precoCartao;
      return p.precoVenda;
    }
    return p.precoVenda;
  }

  /** Tabela de preços de um produto nas duas formas (para exibir na UI). */
  function tabelaDePrecos(produtoOuId) {
    var p = (typeof produtoOuId === 'string') ? busca(produtoOuId) : produtoOuId;
    if (!p) return null;
    return {
      id: p.id,
      nome: p.nome,
      pix: precoPorForma(p, 'pix'),
      cartao: precoPorForma(p, 'cartao'),
      pixFormatado: formatarPreco(precoPorForma(p, 'pix')),
      cartaoFormatado: formatarPreco(precoPorForma(p, 'cartao')),
      confirmado: p.precoConfirmado === true
    };
  }

  /* ─────────────────────────────────────────────
     FRETE
     Regra vigente: 2 peças ou mais = frete grátis.
     "Peça" = UNIDADE do item, não modelo distinto:
       2 camisetas            → 2 peças → frete grátis
       1 camiseta + 1 short   → 2 peças → frete grátis
       1 peça                 → frete regional conforme UF.
       A tabela oficial fica em `META.frete` e usa valores em centavos.
     ───────────────────────────────────────────── */

  /** Quantidade total de peças de um pedido.
      Aceita: número (quantidade) ou lista de itens no formato
      { quantidade } | { quantity } | { qtd } | número. */
  function contarPecas(itens) {
    if (typeof itens === 'number') {
      return (isFinite(itens) && itens > 0) ? Math.floor(itens) : 0;
    }
    if (!Array.isArray(itens)) return 0;

    var total = 0;
    for (var i = 0; i < itens.length; i++) {
      var item = itens[i];
      var qtd = 0;
      if (typeof item === 'number') qtd = item;
      else if (item) qtd = item.quantidade || item.quantity || item.qtd || 1;
      if (isFinite(qtd) && qtd > 0) total += Math.floor(qtd);
    }
    return total;
  }

  /** Frete grátis? Só com a regra ativa e peças >= mínimo. */
  function freteGratis(itens) {
    if (META.freteGratisAtivo !== true) return false;
    var pecas = contarPecas(itens);
    var minimo = META.freteGratisQuantidadeMinima;
    if (typeof minimo !== 'number' || minimo <= 0) return false;
    return pecas >= minimo;
  }

  /* ─────────────────────────────
     CUPONS
     Fonte única: META.cupons. O valor de cupom percentual é porcentagem;
     o valor de cupom fixo é sempre centavos. O desconto nunca inclui frete.
     ───────────────────────────── */
  function normalizarCupom(codigo) {
    return String(codigo || '').replace(/\s+/g, '').toUpperCase();
  }

  function buscarCupom(codigo) {
    var normalizado = normalizarCupom(codigo);
    if (!normalizado || !Array.isArray(META.cupons)) return null;
    for (var i = 0; i < META.cupons.length; i++) {
      if (normalizarCupom(META.cupons[i].codigo) === normalizado) return META.cupons[i];
    }
    return null;
  }

  function validarCupom(codigo, subtotal, agora) {
    var normalizado = normalizarCupom(codigo);
    var compra = typeof subtotal === 'number' && isFinite(subtotal) ? subtotal : 0;
    var cupom = buscarCupom(normalizado);
    if (!normalizado) return { valido: false, codigo: '', motivo: 'Informe um cupom.' };
    if (!cupom) return { valido: false, codigo: normalizado, motivo: 'Cupom inválido.' };
    if (cupom.ativo !== true) return { valido: false, codigo: normalizado, motivo: 'Cupom inativo.' };
    if (typeof cupom.valorMinimo === 'number' && compra < cupom.valorMinimo) {
      return { valido: false, codigo: normalizado, motivo: 'Valor mínimo para este cupom: ' + formatarPreco(cupom.valorMinimo) + '.' };
    }
    if (cupom.validade) {
      var dataValidade = new Date(cupom.validade);
      var dataAgora = agora ? new Date(agora) : new Date();
      if (!isNaN(dataValidade.getTime()) && dataAgora > dataValidade) {
        return { valido: false, codigo: normalizado, motivo: 'Cupom expirado.' };
      }
    }
    if (cupom.limiteUsos !== null && cupom.limiteUsos !== undefined && cupom.limiteUsos <= 0) {
      return { valido: false, codigo: normalizado, motivo: 'Cupom esgotado.' };
    }
    return { valido: true, codigo: normalizado, cupom: cupom, motivo: 'Cupom aplicado.' };
  }

  function descontoCupom(codigo, subtotal, agora) {
    var validacao = validarCupom(codigo, subtotal, agora);
    if (!validacao.valido) {
      return { valido: false, codigo: validacao.codigo, desconto: 0, descontoFormatado: formatarPreco(0), motivo: validacao.motivo };
    }
    var cupom = validacao.cupom;
    var desconto = cupom.tipo === 'percentual'
      ? Math.round(subtotal * cupom.valor / 100)
      : Math.min(cupom.valor, subtotal);
    return {
      valido: true,
      codigo: validacao.codigo,
      tipo: cupom.tipo,
      valor: cupom.valor,
      desconto: desconto,
      descontoFormatado: formatarPreco(desconto),
      motivo: validacao.motivo
    };
  }

  function normalizarUF(uf) {
    return String(uf || '').trim().toUpperCase();
  }

  function grupoDaUF(uf) {
    var normalizada = normalizarUF(uf);
    var tabela = META.frete.ufs;
    if (tabela.sulSudesteSP.indexOf(normalizada) !== -1) return 'sulSudesteSP';
    if (tabela.centroOesteNordesteNorte.indexOf(normalizada) !== -1) return 'centroOesteNordesteNorte';
    return null;
  }

  function ufValida(uf) { return !!grupoDaUF(uf); }

  function frete(itens, uf) {
    var pecas = contarPecas(itens);
    var gratis = pecas >= META.frete.gratisQuantidadeMinima;
    var normalizada = normalizarUF(uf);
    var grupo = grupoDaUF(normalizada);
    var valor = gratis ? 0 : (grupo ? META.frete.valoresPorGrupo[grupo] : null);
    var ufObrigatoria = pecas > 0 && !gratis;
    return {
      pecas: pecas, gratis: gratis, valor: valor,
      valorFormatado: valor === null ? null : formatarPreco(valor),
      minimo: META.frete.gratisQuantidadeMinima, uf: normalizada,
      grupo: grupo, ufValida: !!grupo, ufObrigatoria: ufObrigatoria,
      erro: ufObrigatoria && !grupo ? 'Informe uma UF válida para calcular o frete.' : null,
      motivo: gratis ? 'frete gratis: ' + pecas + ' pecas' : (grupo ? 'frete regional' : 'UF ausente ou invalida')
    };
  }

  /**
   * Total do pedido com a forma de pagamento e o frete aplicados.
   * itens: [{ id|produtoId, quantidade }] — o preço vem SEMPRE do catálogo.
   * Nunca inventa valor: item sem preço confirmado entra em `semPreco`.
   */
  function calcularPedido(itens, forma, uf, codigoCupom) {
    var lista_ = Array.isArray(itens) ? itens : [];
    var formaNorm = normalizarForma(forma);
    var subtotal = 0;
    var pecas = 0;
    var linhas = [];
    var semPreco = [];

    for (var i = 0; i < lista_.length; i++) {
      var item = lista_[i] || {};
      var qtd = item.quantidade || item.quantity || item.qtd || 1;
      if (!isFinite(qtd) || qtd <= 0) continue;
      qtd = Math.floor(qtd);

      var id = item.id || item.produtoId;
      var p = id ? busca(id) : null;
      var unitario = p ? precoPorForma(p, formaNorm) : null;

      if (unitario === null) {
        semPreco.push(id || '(item sem id)');
        linhas.push({ id: id, nome: p ? p.nome : null, quantidade: qtd, unitario: null, total: null });
        continue;
      }

      subtotal += unitario * qtd;
      pecas += qtd;
      linhas.push({
        id: id,
        nome: p.nome,
        quantidade: qtd,
        unitario: unitario,
        total: unitario * qtd
      });
    }

    var situacaoFrete = frete(pecas, uf);
    var cupom = codigoCupom ? descontoCupom(codigoCupom, subtotal) : {
      valido: false, codigo: '', desconto: 0, descontoFormatado: formatarPreco(0)
    };
    var desconto = cupom.valido ? cupom.desconto : 0;
    var subtotalComDesconto = Math.max(0, subtotal - desconto);
    var total = (situacaoFrete.valor === null) ? null : subtotalComDesconto + situacaoFrete.valor;

    return {
      formaPagamento: formaNorm,
      pecas: pecas,
      linhas: linhas,
      semPreco: semPreco,
      subtotal: subtotal,
      subtotalFormatado: formatarPreco(subtotal),
      cupom: cupom,
      desconto: desconto,
      descontoFormatado: formatarPreco(desconto),
      subtotalComDesconto: subtotalComDesconto,
      subtotalComDescontoFormatado: formatarPreco(subtotalComDesconto),
      frete: situacaoFrete,
      freteGratis: situacaoFrete.gratis,
      total: total,
      totalFormatado: total === null ? null : formatarPreco(total),
      totalPendente: total === null,
      observacao: total === null
        ? 'UF ausente ou invalida — total nao calculado'
        : null
    };
  }

  /* ─────────────────────────────────────────────
     VERIFICAÇÃO DE INTEGRIDADE
     Retorna a lista de problemas encontrados.
     IDs duplicados são erro crítico.
     ───────────────────────────────────────────── */
  function verificarIntegridade() {
    var problemas = [];
    var vistos = {};
    var skusVistos = {};

    for (var i = 0; i < PRODUTOS.length; i++) {
      var p = PRODUTOS[i];
      var ref = p.id || ('índice ' + i);

      /* Campos obrigatórios presentes */
      for (var c = 0; c < CAMPOS_OBRIGATORIOS.length; c++) {
        if (!(CAMPOS_OBRIGATORIOS[c] in p)) {
          problemas.push('ERRO [' + ref + ']: campo obrigatório ausente → ' + CAMPOS_OBRIGATORIOS[c]);
        }
      }

      /* ID duplicado — erro crítico */
      if (!p.id) {
        problemas.push('ERRO [índice ' + i + ']: produto sem id');
      } else if (vistos[p.id]) {
        problemas.push('ERRO CRÍTICO: id duplicado → "' + p.id + '"');
      } else {
        vistos[p.id] = true;
      }

      /* Slug duplicado */
      if (p.slug && skusVistos[p.slug]) {
        problemas.push('ERRO: slug duplicado → "' + p.slug + '"');
      } else if (p.slug) {
        skusVistos[p.slug] = true;
      }

      /* Tamanhos válidos e não vazios */
      if (!Array.isArray(p.tamanhos) || p.tamanhos.length === 0) {
        problemas.push('ERRO [' + ref + ']: lista de tamanhos vazia');
      } else {
        for (var t = 0; t < p.tamanhos.length; t++) {
          if (ORDEM_TAMANHOS.indexOf(p.tamanhos[t]) === -1) {
            problemas.push('AVISO [' + ref + ']: tamanho fora da grade oficial → "' + p.tamanhos[t] + '"');
          }
        }
      }

      /* Cores */
      if (!Array.isArray(p.cores) || p.cores.length === 0) {
        problemas.push('ERRO [' + ref + ']: nenhuma cor cadastrada');
      }

      /* Preço: null é permitido, mas precisa estar marcado como não confirmado */
      if (p.precoVenda !== null && p.precoConfirmado !== true) {
        problemas.push('ERRO [' + ref + ']: possui precoVenda mas precoConfirmado !== true');
      }
      if (p.precoVenda !== null && (typeof p.precoVenda !== 'number' || p.precoVenda <= 0)) {
        problemas.push('ERRO [' + ref + ']: precoVenda inválido (deve ser inteiro em centavos ou null)');
      }
      /* Preço de cartão: opcional, mas se existir precisa ser válido
         e também estar coberto pela confirmação. */
      if (p.precoCartao !== null && p.precoCartao !== undefined &&
          (typeof p.precoCartao !== 'number' || p.precoCartao <= 0)) {
        problemas.push('ERRO [' + ref + ']: precoCartao inválido (deve ser inteiro em centavos ou null)');
      }
      if (p.precoCartao !== null && p.precoCartao !== undefined && p.precoConfirmado !== true) {
        problemas.push('ERRO [' + ref + ']: possui precoCartao mas precoConfirmado !== true');
      }
      if (p.custoYouDraw !== null && (typeof p.custoYouDraw !== 'number' || p.custoYouDraw < 0)) {
        problemas.push('ERRO [' + ref + ']: custoYouDraw inválido (deve ser inteiro em centavos ou null)');
      }
    }

    return problemas;
  }

  function resumo() {
    var todos = PRODUTOS.length;
    var ativos = lista().length;
    var idle = {};
    for (var i = 0; i < PRODUTOS.length; i++) {
      idle[PRODUTOS[i].id] = true;
    }
    return {
      total: todos,
      ativos: ativos,
      inativos: todos - ativos,
      idsUnicos: Object.keys(idle).length,
      todosIdsUnicos: Object.keys(idle).length === todos,
      precoConfirmado: META.precosConfirmados,
      precosConfirmados: META.precosConfirmados,
      freteGratisAtivo: META.freteGratisAtivo,
      freteGratisQuantidadeMinima: META.freteGratisQuantidadeMinima,
      frete: META.frete,
      aviso: 'Catálogo central GRACIOU — fonte única. Não duplicar produtos em HTML.'
    };
  }

  /* ─────────────────────────────────────────────
     API PÚBLICA
     ───────────────────────────────────────────── */
  var CATALOGO = {
    META: META,
    ORDEM_TAMANHOS: ORDEM_TAMANHOS,
    CAMPOS_OBRIGATORIOS: CAMPOS_OBRIGATORIOS,
    PRODUTOS: PRODUTOS,
    lista: lista,
    busca: busca,
    porCategoria: porCategoria,
    ordenarTamanhos: ordenarTamanhos,
    precoExibicao: precoExibicao,
    formatarPreco: formatarPreco,
    /* Preços por forma de pagamento */
    normalizarForma: normalizarForma,
    precoPorForma: precoPorForma,
    tabelaDePrecos: tabelaDePrecos,
    /* Frete e pedido */
    contarPecas: contarPecas,
    freteGratis: freteGratis,
    frete: frete,
    normalizarUF: normalizarUF,
    grupoDaUF: grupoDaUF,
    ufValida: ufValida,
    normalizarCupom: normalizarCupom,
    buscarCupom: buscarCupom,
    validarCupom: validarCupom,
    descontoCupom: descontoCupom,
    calcularPedido: calcularPedido,
    verificarIntegridade: verificarIntegridade,
    resumo: resumo
  };

  return CATALOGO;
});