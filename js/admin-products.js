import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';
import { fetchAllProducts } from './firebase-db.js';

let allProducts = [];

const CATEGORY_LABELS = {
  kosmetika: 'Kosmetika',
  mat: 'Mat & Kryddor',
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function productTitle(p) {
  return p.title || p.name || 'Namnlös produkt';
}

function productSubtitle(p) {
  return p.subtitle || p.brand || '';
}

function productImage(p) {
  if (Array.isArray(p.images) && p.images[0]) return p.images[0];
  if (typeof p.image === 'string' && p.image) return p.image;
  return '';
}

function formatPrice(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n.toLocaleString('sv-SE')} kr`;
}

function formatDate(value) {
  if (!value) return '—';
  let date;
  if (value.toDate) date = value.toDate();
  else if (value.seconds) date = new Date(value.seconds * 1000);
  else date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function categoryPills(categories) {
  if (!Array.isArray(categories) || !categories.length) {
    return '<span class="admin-pill muted">—</span>';
  }
  return categories
    .map((cat) => {
      const label = CATEGORY_LABELS[cat] || cat;
      return `<span class="admin-pill">${escapeHtml(label)}</span>`;
    })
    .join('');
}

function stockBadge(inventory) {
  const n = Number(inventory);
  if (Number.isNaN(n)) return '<span class="admin-stock unknown">—</span>';
  if (n <= 0) return '<span class="admin-stock out">Slut</span>';
  if (n <= 5) return `<span class="admin-stock low">${n} st</span>`;
  return `<span class="admin-stock ok">${n} st</span>`;
}

function featuredBadge(featured) {
  return featured
    ? '<span class="admin-pill gold">Utvald</span>'
    : '<span class="admin-pill muted">—</span>';
}

function renderTable(products) {
  const tbody = document.getElementById('productsTableBody');
  const empty = document.getElementById('productsEmpty');
  const tableWrap = document.getElementById('productsTableWrap');
  const countEl = document.getElementById('productsCount');

  countEl.textContent = String(products.length);

  if (!products.length) {
    tbody.innerHTML = '';
    tableWrap.hidden = true;
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  tableWrap.hidden = false;

  tbody.innerHTML = products
    .map((p) => {
      const img = productImage(p);
      const title = escapeHtml(productTitle(p));
      const subtitle = escapeHtml(productSubtitle(p));
      const sku = escapeHtml(p.sku || '—');
      const id = escapeHtml(p.id);

      const thumb = img
        ? `<img src="${escapeHtml(img)}" alt="" class="admin-thumb" loading="lazy">`
        : '<div class="admin-thumb placeholder">📦</div>';

      const subtitleHtml = subtitle
        ? `<div class="admin-product-sub">${subtitle}</div>`
        : '';

      return `
        <tr>
          <td class="col-thumb">${thumb}</td>
          <td class="col-product">
            <div class="admin-product-name">${title}</div>
            ${subtitleHtml}
            <div class="admin-product-id">${id}</div>
          </td>
          <td class="col-sku"><code>${sku}</code></td>
          <td class="col-price">${formatPrice(p.price)}</td>
          <td class="col-stock">${stockBadge(p.inventory)}</td>
          <td class="col-sold">${Number(p.totalSold) || 0}</td>
          <td class="col-cats">${categoryPills(p.categories)}</td>
          <td class="col-featured">${featuredBadge(p.featured)}</td>
          <td class="col-date">${formatDate(p.createdAt)}</td>
          <td class="col-actions">
            <a href="admin-product.html?id=${encodeURIComponent(p.id)}" class="admin-row-link">Redigera</a>
          </td>
        </tr>`;
    })
    .join('');
}

function filterProducts(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allProducts;

  return allProducts.filter((p) => {
    const haystack = [
      p.id,
      p.sku,
      p.barcode,
      productTitle(p),
      productSubtitle(p),
      p.description,
      ...(Array.isArray(p.categories) ? p.categories : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function applyFilters() {
  const query = document.getElementById('productSearch').value;
  renderTable(filterProducts(query));
}

async function loadProducts() {
  const loading = document.getElementById('productsLoading');
  const error = document.getElementById('productsError');
  const toolbar = document.getElementById('productsToolbar');
  const refreshBtn = document.getElementById('refreshProducts');

  loading.hidden = false;
  error.hidden = true;
  toolbar.hidden = true;
  document.getElementById('productsTableWrap').hidden = true;
  document.getElementById('productsEmpty').hidden = true;
  refreshBtn.disabled = true;

  try {
    allProducts = await fetchAllProducts();
    loading.hidden = true;
    toolbar.hidden = false;
    applyFilters();
  } catch (err) {
    loading.hidden = true;
    error.hidden = false;
    error.textContent =
      err?.code === 'permission-denied'
        ? 'Åtkomst nekad. Kontrollera att du är inloggad som admin och att Firestore-reglerna tillåter läsning.'
        : `Kunde inte hämta produkter: ${err.message || 'Okänt fel'}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

requireAdmin((user) => {
  document.getElementById('adminLoading').hidden = true;
  document.getElementById('adminContent').hidden = false;
  document.getElementById('adminEmail').textContent = user.email || '';

  const savedId = new URLSearchParams(window.location.search).get('saved');
  if (savedId) {
    const success = document.getElementById('productsSuccess');
    success.hidden = false;
    success.textContent = 'Produkten sparades.';
    window.history.replaceState({}, '', 'admin-products.html');
  }

  loadProducts();
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await signOut(getFirebaseAuth());
  window.location.href = 'index.html';
});

document.getElementById('productSearch').addEventListener('input', applyFilters);
document.getElementById('refreshProducts').addEventListener('click', loadProducts);
