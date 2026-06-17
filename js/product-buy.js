(function () {
  const dataEl = document.getElementById('product-data');
  const buyBtn = document.getElementById('buyBtn');
  if (!dataEl || !buyBtn) return;

  let product;
  try {
    product = JSON.parse(dataEl.textContent);
  } catch {
    return;
  }

  let qty = 1;
  const qtyEl = document.getElementById('qty');
  const totalEl = document.getElementById('total');
  const price = Number(product.price) || 0;

  function formatKr(n) {
    return n.toLocaleString('sv-SE') + ' kr';
  }

  function updateTotal() {
    if (qtyEl) qtyEl.textContent = qty;
    if (totalEl) totalEl.textContent = formatKr(qty * price) + ' totalt';
  }

  document.getElementById('qtyMinus')?.addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    updateTotal();
  });

  document.getElementById('qtyPlus')?.addEventListener('click', () => {
    qty += 1;
    updateTotal();
  });

  buyBtn.addEventListener('click', () => {
    AfroCart.addItem({ ...product, qty });
    AfroCart.showToast?.();
    buyBtn.textContent = '✓ Lagt till';
    buyBtn.classList.add('added');
    setTimeout(() => {
      buyBtn.textContent = 'Köp nu';
      buyBtn.classList.remove('added');
    }, 1800);
  });
})();
