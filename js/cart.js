(function () {
  const ITEMS_KEY = 'afrohornan-cart-items';

  function readItems() {
    try {
      const raw = localStorage.getItem(ITEMS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return [];
  }

  function writeItems(items) {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    updateBadge();
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { items } }));
  }

  function updateBadge() {
    const count = getCount();
    document.querySelectorAll('#cartCount').forEach((el) => {
      el.textContent = count;
    });
  }

  function getCount() {
    return readItems().reduce((sum, item) => sum + item.qty, 0);
  }

  function getTotal() {
    return readItems().reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  function addItem(item) {
    if (!item?.slug) return;
    const items = readItems();
    const qty = item.qty || 1;
    const existing = items.find((i) => i.slug === item.slug);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        slug: item.slug,
        name: item.name,
        brand: item.brand || '',
        price: Number(item.price) || 0,
        image: item.image || '',
        url: item.url || '#',
        qty,
      });
    }
    writeItems(items);
  }

  function setQty(slug, qty) {
    const items = readItems();
    const next = qty <= 0 ? items.filter((i) => i.slug !== slug) : items.map((i) => (i.slug === slug ? { ...i, qty } : i));
    writeItems(next);
  }

  function removeItem(slug) {
    writeItems(readItems().filter((i) => i.slug !== slug));
  }

  function clear() {
    writeItems([]);
  }

  function cartUrl() {
    const path = window.location.pathname || '';
    if (path.includes('/products/')) return '../kundvagn.html';
    return 'kundvagn.html';
  }

  function wireCartButtons() {
    const url = cartUrl();
    document.querySelectorAll('.nav-cart-btn, #cartBtn').forEach((btn) => {
      if (btn.tagName === 'A') {
        btn.setAttribute('href', url);
        return;
      }
      const link = document.createElement('a');
      link.href = url;
      link.className = btn.className;
      if (btn.id) link.id = btn.id;
      link.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Varukorg');
      link.innerHTML = btn.innerHTML;
      btn.replaceWith(link);
    });
  }

  function productFromCard(card) {
    if (!card?.dataset.slug) return null;
    return {
      slug: card.dataset.slug,
      name: card.dataset.name || 'Produkt',
      brand: card.dataset.brand || '',
      price: Number(card.dataset.price) || 0,
      image: card.dataset.image || '',
      url: card.dataset.url || '#',
    };
  }

  function showCartToast() {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cart-toast';
      toast.setAttribute('role', 'status');
      toast.innerHTML =
        'Tillagd i kundvagnen! <a href="' + cartUrl() + '">Visa kundvagn →</a>';
      document.body.appendChild(toast);
    } else {
      toast.querySelector('a')?.setAttribute('href', cartUrl());
    }
    toast.classList.add('show');
    window.clearTimeout(showCartToast._timer);
    showCartToast._timer = window.setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function wireAddToCartButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.pcard-cart');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const product = productFromCard(btn.closest('.pcard'));
      if (!product) return;

      addItem({ ...product, qty: 1 });

      btn.textContent = '✓ Tillagd';
      btn.classList.add('added');
      window.setTimeout(() => {
        btn.textContent = 'Lägg i kundvagn';
        btn.classList.remove('added');
      }, 1500);

      showCartToast();
    });
  }

  window.AfroCart = {
    getItems: readItems,
    getCount,
    getTotal,
    addItem,
    setQty,
    removeItem,
    clear,
    cartUrl,
    showToast: showCartToast,
    init() {
      updateBadge();
      wireCartButtons();
      wireAddToCartButtons();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AfroCart.init());
  } else {
    AfroCart.init();
  }
})();
