/**
 * ============================================================
 * GRACIOU — graciou-main.js
 * JS principal do tema — lean, sem dependências externas.
 * Módulos:
 *   1. Header: sticky, scroll detection
 *   2. Mobile Menu: drawer abrir/fechar
 *   3. Search Bar: toggle
 *   4. Product Gallery: troca de imagens por thumbnail
 *   5. Variant Selector: atualização de preço e disponibilidade
 *   6. Quick Add: AJAX add-to-cart
 *   7. Accordion: produto
 *   8. Animações: IntersectionObserver (em theme.liquid)
 * ============================================================
 */

(function () {
  'use strict';

  /* ───────────────────────────────────────────
     1. HEADER — Scroll Detection
  ─────────────────────────────────────────── */
  const initHeader = () => {
    const header = document.querySelector('[data-header]');
    if (!header) return;

    const SCROLL_THRESHOLD = 60;
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          header.classList.toggle('is-scrolled', window.scrollY > SCROLL_THRESHOLD);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
  };

  /* ───────────────────────────────────────────
     2. MOBILE MENU — Drawer
  ─────────────────────────────────────────── */
  const initMobileMenu = () => {
    const toggle = document.getElementById('mobile-menu-toggle');
    const menu   = document.getElementById('mobile-menu');
    const closeButtons = document.querySelectorAll('[data-close-mobile-menu]');

    if (!toggle || !menu) return;

    const openMenu = () => {
      menu.hidden = false;
      menu.removeAttribute('aria-hidden');
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';

      // Foco no primeiro link do menu
      const firstLink = menu.querySelector('a, button');
      if (firstLink) setTimeout(() => firstLink.focus(), 200);
    };

    const closeMenu = () => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';

      // Espera a animação para esconder
      setTimeout(() => {
        menu.hidden = true;
        menu.setAttribute('aria-hidden', 'true');
      }, 400);

      toggle.focus();
    };

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      isOpen ? closeMenu() : openMenu();
    });

    closeButtons.forEach(btn => btn.addEventListener('click', closeMenu));

    // Fechar com Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        closeMenu();
      }
    });
  };

  /* ───────────────────────────────────────────
     3. SEARCH BAR — Toggle
  ─────────────────────────────────────────── */
  const initSearchBar = () => {
    const searchToggle = document.getElementById('search-toggle');
    const searchBar    = document.getElementById('search-bar');

    if (!searchToggle || !searchBar) return;

    searchToggle.addEventListener('click', () => {
      const isHidden = searchBar.hidden;
      searchBar.hidden = !isHidden;
      searchBar.setAttribute('aria-hidden', String(!isHidden));

      if (isHidden) {
        const input = searchBar.querySelector('input');
        if (input) setTimeout(() => input.focus(), 100);
      }
    });

    // Fechar ao pressionar Escape
    searchBar.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchBar.hidden = true;
        searchBar.setAttribute('aria-hidden', 'true');
        searchToggle.focus();
      }
    });
  };

  /* ───────────────────────────────────────────
     4. PRODUCT GALLERY — Thumbnail Switcher
  ─────────────────────────────────────────── */
  const initProductGallery = () => {
    const gallery = document.getElementById('product-gallery');
    if (!gallery) return;

    const mainImage = document.getElementById('main-product-image');
    const thumbs    = gallery.querySelectorAll('.product-gallery__thumb');

    if (!mainImage || thumbs.length === 0) return;

    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const newSrc = thumb.dataset.imageSrc;
        if (!newSrc) return;

        // Fade out → troca → fade in
        mainImage.style.opacity = '0';
        mainImage.style.transition = 'opacity 0.25s ease';

        setTimeout(() => {
          mainImage.src = newSrc;
          mainImage.style.opacity = '1';
        }, 200);

        // Atualizar estado ativo
        thumbs.forEach(t => {
          t.classList.remove('is-active');
          t.setAttribute('aria-pressed', 'false');
        });
        thumb.classList.add('is-active');
        thumb.setAttribute('aria-pressed', 'true');
      });

      // Acessibilidade: teclado
      thumb.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          thumb.click();
        }
      });
    });
  };

  /* ───────────────────────────────────────────
     5. VARIANT SELECTOR — Preço e disponibilidade
  ─────────────────────────────────────────── */
  const initVariantSelector = () => {
    const productForm = document.querySelector('[data-type="add-to-cart-form"]');
    if (!productForm) return;

    // Expostos pelo Shopify via JSON no produto
    const variantData = window.__GRACIOU_VARIANTS__;
    if (!variantData) return;

    const radios        = productForm.querySelectorAll('input[type="radio"]');
    const priceEl       = document.getElementById('product-price');
    const availabilityEl = document.getElementById('product-availability');
    const addBtn        = document.getElementById('product-add-to-cart');
    const hiddenVariant = productForm.querySelector('input[name="id"]');

    const getSelectedOptions = () => {
      const opts = {};
      radios.forEach(radio => {
        if (radio.checked) {
          opts[`option${radio.dataset.optionPosition}`] = radio.value;
        }
      });
      return opts;
    };

    const findMatchingVariant = (selected) => {
      return variantData.find(v => {
        return Object.entries(selected).every(([key, val]) => v[key] === val);
      });
    };

    const formatMoney = (cents) => {
      const amount = (cents / 100).toFixed(2);
      return `R$ ${amount.replace('.', ',')}`;
    };

    const updateUI = (variant) => {
      if (!variant) return;

      // Atualiza ID oculto
      if (hiddenVariant) hiddenVariant.value = variant.id;

      // Atualiza preço
      if (priceEl) {
        const html = variant.compare_at_price && variant.compare_at_price > variant.price
          ? `<span class="product-info__price-compare text-sm text-navy/40 line-through mr-2">${formatMoney(variant.compare_at_price)}</span>
             <span class="product-info__price-current text-2xl font-heading font-bold text-moss-green">${formatMoney(variant.price)}</span>`
          : `<span class="product-info__price-current text-2xl font-heading font-bold">${formatMoney(variant.price)}</span>`;
        priceEl.innerHTML = html;
      }

      // Atualiza disponibilidade
      if (availabilityEl) {
        availabilityEl.textContent = variant.available
          ? '✓ Em estoque — pronto para envio'
          : '× Indisponível no momento';
        availabilityEl.className = `product-info__availability text-xs tracking-wider mb-6 ${variant.available ? 'text-moss-green' : 'text-red-600'}`;
      }

      // Atualiza botão
      if (addBtn) {
        addBtn.disabled = !variant.available;
        addBtn.textContent = variant.available ? 'ADICIONAR AO CARRINHO' : 'ESGOTADO';
      }

      // Atualiza label de seleção
      radios.forEach(radio => {
        if (radio.checked) {
          const selectedLabel = document.getElementById(`option-selected-${radio.dataset.optionPosition}`);
          if (selectedLabel) selectedLabel.textContent = radio.value;
        }
      });
    };

    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Atualizar swatches visuais
        const swatch = radio.closest('.product-option__swatch--size, .product-option__swatch--color');
        if (swatch) {
          const allSwatches = productForm.querySelectorAll(`.product-option__swatch--size, .product-option__swatch--color`);
          allSwatches.forEach(s => s.classList.remove('is-selected'));
          swatch.classList.add('is-selected');
        }

        const selected = getSelectedOptions();
        const variant  = findMatchingVariant(selected);
        if (variant) updateUI(variant);
      });
    });
  };

  /* ───────────────────────────────────────────
     6. QUICK ADD — AJAX Cart
  ─────────────────────────────────────────── */
  window.gracioQuickAdd = async (productId, variantId) => {
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity: 1 }),
      });

      if (!response.ok) throw new Error(`Erro ${response.status}`);

      const data = await response.json();

      // Atualiza contador do carrinho na UI
      await updateCartCount();

      // Feedback visual
      showQuickAddFeedback(variantId);

    } catch (err) {
      console.error('[GRACIOU] Quick Add error:', err);
    }
  };

  const updateCartCount = async () => {
    try {
      const res = await fetch('/cart.js', { headers: { 'Accept': 'application/json' } });
      const cart = await res.json();
      const countEl = document.querySelector('.header__cart-count');

      if (cart.item_count > 0) {
        if (countEl) {
          countEl.textContent = cart.item_count;
        } else {
          // Criar elemento se não existir
          const cartBtn = document.getElementById('cart-icon-bubble');
          if (cartBtn) {
            const badge = document.createElement('span');
            badge.className = 'header__cart-count';
            badge.textContent = cart.item_count;
            cartBtn.appendChild(badge);
          }
        }
      }
    } catch (err) {
      console.warn('[GRACIOU] Cart count update failed:', err);
    }
  };

  const showQuickAddFeedback = (variantId) => {
    const btn = document.querySelector(`[data-variant-id="${variantId}"] .product-card__quick-add-btn, [data-variant-id="${variantId}"]`);
    if (!btn) return;

    const original = btn.textContent;
    btn.textContent = '✓ ADICIONADO';
    btn.style.backgroundColor = 'var(--color-moss-green)';
    btn.style.color = 'var(--color-ecru)';

    setTimeout(() => {
      btn.textContent = original;
      btn.style.backgroundColor = '';
      btn.style.color = '';
    }, 2000);
  };

  /* ───────────────────────────────────────────
     7. ACCORDION — Produto
  ─────────────────────────────────────────── */
  const initAccordions = () => {
    const accordions = document.querySelectorAll('.product-accordion');
    // Os <details> nativos do HTML já funcionam sem JS.
    // Aqui adicionamos apenas o close dos outros ao abrir um.
    accordions.forEach(accordion => {
      accordion.addEventListener('toggle', () => {
        if (accordion.open) {
          accordions.forEach(other => {
            if (other !== accordion && other.open) other.open = false;
          });
        }
      });
    });
  };

  /* ───────────────────────────────────────────
     8. SORT — Coleção
  ─────────────────────────────────────────── */
  const initCollectionSort = () => {
    const sortSelect = document.getElementById('sort-by');
    if (!sortSelect) return;
    // Já tratado inline no HTML via onchange
  };

  /* ───────────────────────────────────────────
     INICIALIZAÇÃO
  ─────────────────────────────────────────── */
  const init = () => {
    initHeader();
    initMobileMenu();
    initSearchBar();
    initProductGallery();
    initVariantSelector();
    initAccordions();
    initCollectionSort();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
