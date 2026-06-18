(function () {
  const listEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const contentEl = document.getElementById('cart-content');
  const countEl = document.getElementById('cart-item-count');
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');

  if (!listEl) return;

  function formatKr(n) {
    return n.toLocaleString('sv-SE') + ' kr';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function render() {
    const items = AfroCart.getItems();
    const totalQty = AfroCart.getCount();
    const total = AfroCart.getTotal();

    if (countEl) {
      countEl.textContent = totalQty === 1 ? '1 produkt' : totalQty + ' produkter';
    }
    if (subtotalEl) subtotalEl.textContent = formatKr(total);
    if (totalEl) totalEl.textContent = formatKr(total);

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (contentEl) contentEl.hidden = true;
      listEl.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = false;

    listEl.replaceChildren();
    items.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'cart-row';
      row.dataset.lineId = AfroCart.lineId(item);

      const imgLink = document.createElement('a');
      imgLink.href = item.url;
      imgLink.className = 'cart-row-img';
      if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        imgLink.appendChild(img);
      } else {
        const emoji = document.createElement('span');
        emoji.className = 'cart-row-emoji';
        emoji.setAttribute('aria-hidden', 'true');
        emoji.textContent = '📦';
        imgLink.appendChild(emoji);
      }

      const info = document.createElement('div');
      info.className = 'cart-row-info';
      info.innerHTML = `
        <p class="cart-row-brand">${escapeHtml(item.brand || 'Produkt')}</p>
        <a href="${escapeHtml(item.url)}" class="cart-row-name">${escapeHtml(item.name)}</a>
        ${item.colorName ? `<p class="cart-row-color">Färg: ${escapeHtml(item.colorName)}</p>` : ''}
        <p class="cart-row-price">${formatKr(item.price)}</p>`;

      const actions = document.createElement('div');
      actions.className = 'cart-row-actions';
      actions.innerHTML = `
        <div class="cart-qty">
          <button type="button" class="cart-qty-btn" data-action="minus" aria-label="Minska antal">−</button>
          <span class="cart-qty-val">${item.qty}</span>
          <button type="button" class="cart-qty-btn" data-action="plus" aria-label="Öka antal">+</button>
        </div>
        <p class="cart-row-total">${formatKr(item.price * item.qty)}</p>
        <button type="button" class="cart-remove" data-action="remove">Ta bort</button>`;

      row.append(imgLink, info, actions);
      listEl.appendChild(row);
    });
  }

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.cart-row');
    if (!row) return;
    const id = row.dataset.lineId;
    const item = AfroCart.getItems().find((entry) => AfroCart.lineId(entry) === id);
    if (!item) return;

    if (e.target.closest('[data-action="minus"]')) {
      AfroCart.setQty(id, item.qty - 1);
    } else if (e.target.closest('[data-action="plus"]')) {
      AfroCart.setQty(id, item.qty + 1);
    } else if (e.target.closest('[data-action="remove"]')) {
      AfroCart.removeItem(id);
    }
  });

  document.getElementById('cart-clear')?.addEventListener('click', () => {
    if (AfroCart.getItems().length && confirm('Töm kundvagnen?')) {
      AfroCart.clear();
    }
  });

  document.addEventListener('cart:updated', render);
  render();
})();
