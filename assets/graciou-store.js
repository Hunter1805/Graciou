/* ============================================================
 * CARRINHO REAL (localStorage) — ativo.
 * Persistência, chave única por variação e formatação de preço.
 * Sem backend, sem Shopify, sem gateway de pagamento nesta etapa.
 * ============================================================
 * ⚠️  LISTA DE PRODUTOS DESTE ARQUIVO — OBSOLETA (25/09/2026).
 * ============================================================
 * O catálogo de produtos DESTE arquivo foi substituído pela fonte
 * única oficial em: dados/catalogo.js
 *
 * Motivo da obsolescência:
 *   - a lista abaixo estava incompleta/divergente (nome "Short 2 em 1
 *     Graciou Move" em vez de "GRACIOU Move");
 *   - continha ID DUPLICADO: dois produtos usavam `tee-graca`
 *     (Camiseta A Graça Permanece e Camiseta Pela Graça);
 *   - não tinha SKU, tipo de peça, imagem de frente/costas, custo
 *     na YouDraw nem flag ativo/inativo.
 *
 * O array `products` abaixo é mantido apenas como REGISTRO HISTÓRICO.
 * Está marcado como vazio de propósito e não deve ser repovoado:
 * qualquer produto novo ou alterado vai em dados/catalogo.js.
 *
 * A lógica de carrinho em localStorage deste arquivo permanece como
 * REFERÊNCIA DE MODELAGEM para a fase futura de carrinho real — ela
 * ainda não está conectada a nenhuma interface.
 * ============================================================
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     FONTE DOS PRODUTOS
     Não guardamos cópia nenhuma. O array abaixo existe apenas como
     último recurso (modo offline / catálogo ausente) e NÃO deve ser
     repovoado: duplicar os 8 produtos aqui recriaria o problema de
     listas divergentes que já custou caro neste projeto
     (o catálogo antigo tinha `tee-graca` duas vezes).
     ───────────────────────────────────────────── */
  const SEM_CATALOGO = [];

  /* Lê o catálogo central no MOMENTO do acesso — não no carregamento.
     É isso que corrige o bloqueio: o script pode rodar ANTES de
     dados/catalogo.js, e mesmo assim `products` responde certo depois. */
  function lerCatalogo() {
    if (typeof window === 'undefined') return null;
    return window.GRACIOU_CATALOGO || null;
  }

  function produtosDoCatalogo() {
    const catalogo = lerCatalogo();
    if (!catalogo) return SEM_CATALOGO;
    /* Aceita tanto PRODUTOS (lista crua) quanto uma lista já filtrada. */
    if (Array.isArray(catalogo.PRODUTOS)) return catalogo.PRODUTOS;
    if (typeof catalogo.lista === 'function') return catalogo.lista();
    return SEM_CATALOGO;
  }

  /* ─────────────────────────────────────────────
     CARRINHO PERSISTENTE (localStorage)
     Cada linha do carrinho é uma VARIAÇÃO: produto + tamanho + cor.
     A `key` única é o que impede a mesma variação de virar duas linhas.
     ───────────────────────────────────────────── */
  const CART_KEY = 'graciou-cart-v1';
  const PAGAMENTO_KEY = 'graciou-pagamento-v1';
  const CUPOM_KEY = 'graciou-cupom-v1';

  const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (_) { return []; } };
  const writeCart = (cart) => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}
    window.dispatchEvent(new CustomEvent('graciou:cart-updated', { detail: cart }));
  };

  /* Forma de pagamento escolhida — também sobrevive ao recarregar. */
  const readPagamento = () => {
    try {
      const salvo = localStorage.getItem(PAGAMENTO_KEY);
      return salvo === 'cartao' ? 'cartao' : 'pix';
    } catch (_) { return 'pix'; }
  };
  const writePagamento = (forma) => {
    const normalizada = forma === 'cartao' ? 'cartao' : 'pix';
    try { localStorage.setItem(PAGAMENTO_KEY, normalizada); } catch (_) {}
    window.dispatchEvent(new CustomEvent('graciou:pagamento-updated', { detail: normalizada }));
    return normalizada;
  };

  const readCupom = () => {
    try { return localStorage.getItem(CUPOM_KEY) || ''; } catch (_) { return ''; }
  };
  const writeCupom = (codigo) => {
    const normalizado = String(codigo || '').replace(/\s+/g, '').toUpperCase();
    try {
      if (normalizado) localStorage.setItem(CUPOM_KEY, normalizado);
      else localStorage.removeItem(CUPOM_KEY);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('graciou:cupom-updated', { detail: normalizado }));
    return normalizado;
  };

  /* Chave única da variação. Sempre com os três campos, para que
     tamanhos e cores diferentes sejam linhas distintas. */
  function chaveDaLinha(produtoId, tamanho, cor) {
    return [produtoId, tamanho || 'unico', cor || 'padrao'].join('::');
  }

  /* Preços do catálogo central para um produto, por forma de pagamento.
     Nunca inventa: devolve null quando o catálogo não traz o valor. */
  function precosDoProduto(produtoId) {
    const catalogo = lerCatalogo();
    const p = catalogo && typeof catalogo.busca === 'function' ? catalogo.busca(produtoId) : null;
    if (!p) return { pix: null, cartao: null };

    const pix = (typeof p.precoVenda === 'number') ? p.precoVenda : null;
    const cartao = (typeof p.precoCartao === 'number')
      ? p.precoCartao
      : (catalogo && typeof catalogo.precoPorForma === 'function'
          ? catalogo.precoPorForma(p, 'cartao')
          : pix);

    return { pix: pix, cartao: cartao };
  }

  function formatarPreco(centavos) {
    const catalogo = lerCatalogo();
    if (catalogo && typeof catalogo.formatarPreco === 'function') return catalogo.formatarPreco(centavos);
    if (centavos === null || typeof centavos === 'undefined') return null;
    return 'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');
  }

  /* Total de peças: soma das quantidades, não o número de linhas.
     Duas camisetas = 2 peças; uma camiseta + um short = 2 peças. */
  function totalDePecas() {
    return readCart().reduce((soma, linha) => soma + (linha.quantidade || 0), 0);
  }

  /* Situação do frete, delegando à regra do catálogo central
     (META.freteGratisAtivo / freteGratisQuantidadeMinima / valorFrete). */
  function situacaoFrete(uf) {
    const catalogo = lerCatalogo();
    const pecas = totalDePecas();
    if (catalogo && typeof catalogo.frete === 'function') return catalogo.frete(pecas, uf);
    return { pecas: pecas, gratis: false, valor: null, valorFormatado: null, minimo: null, ufValida: false, erro: 'Informe uma UF válida para calcular o frete.' };
  }

  /* Totais do carrinho na forma de pagamento pedida (ou na salva).
     `total` é null quando o frete normal não tem valor definido —
     a interface mostra "frete pendente" em vez de inventar um número. */
  function totalizar(forma, codigoCupom, uf) {
    const formaUsada = forma === 'cartao' || forma === 'pix' ? forma : readPagamento();
    const linhas = readCart();
    let subtotal = 0;
    let pecas = 0;
    const semPreco = [];

    const detalhadas = linhas.map((linha) => {
      const qtd = linha.quantidade || 0;
      const unitario = formaUsada === 'cartao' ? linha.precoCartao : linha.precoPix;
      const unitarioNum = (typeof unitario === 'number') ? unitario : null;
      const totalLinha = unitarioNum === null ? null : unitarioNum * qtd;

      if (unitarioNum === null) semPreco.push(linha.productId);
      else { subtotal += totalLinha; pecas += qtd; }

      return Object.assign({}, linha, {
        unitario: unitarioNum,
        unitarioFormatado: unitarioNum === null ? null : formatarPreco(unitarioNum),
        totalLinha: totalLinha,
        totalLinhaFormatado: totalLinha === null ? null : formatarPreco(totalLinha)
      });
    });

    const frete = situacaoFrete(uf);
    const codigo = codigoCupom === undefined ? readCupom() : codigoCupom;
    const catalogo = lerCatalogo();
    const cupom = catalogo && typeof catalogo.descontoCupom === 'function'
      ? catalogo.descontoCupom(codigo, subtotal)
      : { valido: false, codigo: '', desconto: 0, descontoFormatado: formatarPreco(0), motivo: '' };
    const subtotalComDesconto = Math.max(0, subtotal - cupom.desconto);
    /* Frete não participa do desconto: ele é somado depois, sem redução. */
    const total = frete.valor === null ? null : subtotalComDesconto + frete.valor;

    return {
      formaPagamento: formaUsada,
      linhas: detalhadas,
      semPreco: semPreco,
      pecas: pecas,
      subtotal: subtotal,
      subtotalFormatado: formatarPreco(subtotal),
      cupom: cupom,
      desconto: cupom.desconto,
      descontoFormatado: formatarPreco(cupom.desconto),
      subtotalComDesconto: subtotalComDesconto,
      subtotalComDescontoFormatado: formatarPreco(subtotalComDesconto),
      frete: frete,
      freteGratis: frete.gratis,
      total: total,
      totalFormatado: total === null ? null : formatarPreco(total),
      totalPendente: total === null
    };
  }

  window.GRACIOU_STORE = {
    /* GETTER DINÂMICO — sempre lê o catálogo atual, nunca uma cópia.
       `store.products.length` passa a devolver 8 assim que
       dados/catalogo.js carregar, independentemente da ordem. */
    get products() {
      return produtosDoCatalogo();
    },

    /* Utilitários derivados do catálogo, mantidos por compatibilidade. */
    getProduct(id) {
      const catalogo = lerCatalogo();
      if (catalogo) {
        if (typeof catalogo.busca === 'function') return catalogo.busca(id);
        return produtosDoCatalogo().find((product) => product.id === id) || null;
      }
      return null;
    },

    /* Indica se o catálogo central já está disponível.
       Útil para quem precisa esperar antes de renderizar. */
    catalogoPronto() {
      return !!lerCatalogo();
    },

    /* Avisa quando o catálogo chegar, para o grid não depender
       de chutar intervalos. Usa polling curto porque o catálogo é
       carregado por <script src> e não emite evento. */
    quandoCatalogoPronto(callback, limiteMs) {
      const limite = typeof limiteMs === 'number' ? limiteMs : 15000;
      if (lerCatalogo()) { callback(window.GRACIOU_CATALOGO); return; }

      const inicio = Date.now();
      const timer = setInterval(function () {
        const catalogo = lerCatalogo();
        if (catalogo || Date.now() - inicio >= limite) {
          clearInterval(timer);
          callback(catalogo || null);
        }
      }, 100);
    },
    /* ── CARRINHO ── */
    getCart: readCart,

    /* Adiciona uma variação. Campos obrigatórios da linha:
       productId, nome, tamanho, cor, quantidade, precoPix, precoCartao, key.
       Os preços vêm SEMPRE do catálogo central — se o produto não existir
       lá, nada é inventado e a adição é recusada. */
    addToCart(item) {
      if (!item || !item.productId) return readCart();

      const catalogo = lerCatalogo();
      const produto = catalogo && typeof catalogo.busca === 'function'
        ? catalogo.busca(item.productId) : null;
      if (!produto) return readCart();

      const tamanho = item.tamanho || item.size || 'Único';
      const cor = item.cor || item.color || produto.corPrincipal || '';
      const precos = precosDoProduto(item.productId);

      const linha = {
        productId: item.productId,
        nome: item.nome || produto.nome || '',
        tamanho: tamanho,
        cor: cor,
        quantidade: item.quantidade || 1,
        precoPix: precos.pix,
        precoCartao: precos.cartao,
        key: chaveDaLinha(item.productId, tamanho, cor)
      };

      const cart = readCart();
      const existente = cart.find((l) => l.key === linha.key);
      if (existente) existente.quantidade += linha.quantidade;
      else cart.push(linha);

      writeCart(cart);
      return cart;
    },

    /* Define a quantidade exata de uma linha. Zero remove a linha. */
    setQuantity(key, quantidade) {
      const qtd = Math.floor(Number(quantidade));
      let cart = readCart();
      if (!isFinite(qtd) || qtd <= 0) {
        cart = cart.filter((l) => l.key !== key);
      } else {
        const linha = cart.find((l) => l.key === key);
        if (linha) linha.quantidade = qtd;
      }
      writeCart(cart);
      return cart;
    },

    incrementar(key, passo) {
      const linha = readCart().find((l) => l.key === key);
      if (!linha) return readCart();
      return this.setQuantity(key, linha.quantidade + (passo || 1));
    },

    /* Diminui 1; ao chegar a zero, a linha sai do carrinho. */
    decrementar(key, passo) {
      const linha = readCart().find((l) => l.key === key);
      if (!linha) return readCart();
      return this.setQuantity(key, linha.quantidade - (passo || 1));
    },

    removeFromCart(key) { const cart = readCart().filter((line) => line.key !== key); writeCart(cart); return cart; },
    clearCart() { writeCart([]); writeCupom(''); },

    /* Total de PEÇAS (soma das quantidades). */
    count() { return totalDePecas(); },

    /* ── PAGAMENTO ── */
    getPayment: readPagamento,
    setPayment: writePagamento,

    /* ── CUPOM ── */
    getCoupon: readCupom,
    setCoupon: writeCupom,
    removeCoupon() { return writeCupom(''); },

    /* ── TOTAIS ── */
    totais: totalizar,
    totalizar: totalizar,
    frete: situacaoFrete,
    totalDePecas: totalDePecas,
    formatarPreco: formatarPreco,
    precosDoProduto: precosDoProduto,
  };

  /* ─────────────────────────────────────────────
     BADGE DO CARRINHO — em todas as páginas que incluírem esta store.
     Aceita os dois marcadores usados no projeto:
       [data-graciou-cart-count]  (collection.html)
       .cart-badge__count         (header das demais páginas)
     ───────────────────────────────────────────── */
  function atualizarBadges(total) {
    const n = (typeof total === 'number') ? total : totalDePecas();
    document.querySelectorAll('[data-graciou-cart-count], .cart-badge__count').forEach((node) => {
      node.textContent = String(n);
    });
    return n;
  }

  window.addEventListener('graciou:cart-updated', (event) => {
    const linhas = Array.isArray(event.detail) ? event.detail : readCart();
    atualizarBadges(linhas.reduce((soma, linha) => soma + (linha.quantidade || 0), 0));
  });

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => atualizarBadges());
  } else {
    atualizarBadges();
  }
})();
