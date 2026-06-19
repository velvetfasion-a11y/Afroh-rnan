import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';

let allOrders = [];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function displayOrderNumber(order) {
  if (order.orderNumber) return order.orderNumber;
  if (order.id) return `AFH-${order.id.slice(0, 8).toUpperCase()}`;
  return '—';
}

function orderTotal(order) {
  if (Number.isFinite(Number(order.total))) return Number(order.total);
  const items = Array.isArray(order.items) ? order.items : [];
  const shipping = Number(order.shipping) || 0;
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
    0,
  ) + shipping;
}

function statusLabel(status) {
  const labels = {
    paid: 'Betald',
    pending: 'Väntar',
    pickup_requested: 'Hämtning',
  };
  return labels[status] || status || '—';
}

function statusClass(status) {
  if (status === 'paid') return 'ok';
  if (status === 'pickup_requested') return 'low';
  return 'unknown';
}

function fulfillmentLabel(order) {
  if (order.fulfillment === 'pickup') {
    const store = order.pickupStore === 'marsta' ? 'Märsta' : order.pickupStore === 'fittja' ? 'Fittja' : order.pickupStore || 'Butik';
    return `Hämtning · ${store}`;
  }
  return 'Leverans';
}

function itemRowsHtml(items) {
  return (items || []).map((item) => {
    const qty = Number(item.qty) || 1;
    const lineTotal = (Number(item.price) || 0) * qty;
    const variant = item.colorName ? ` <span class="admin-order-variant">(${escapeHtml(item.colorName)})</span>` : '';
    return `
      <tr>
        <td>${escapeHtml(item.name || 'Produkt')}${variant}</td>
        <td>${qty} st</td>
        <td>${lineTotal.toLocaleString('sv-SE')} kr</td>
      </tr>`;
  }).join('');
}

function detailHtml(order) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const address = order.fulfillment === 'pickup'
    ? `Hämtning i butik${order.pickupStore ? ` – ${escapeHtml(order.pickupStore === 'marsta' ? 'Märsta' : 'Fittja')}` : ''}`
    : [
      customer.address,
      [customer.postal, customer.city].filter(Boolean).join(' '),
      customer.country,
    ].filter(Boolean).map(escapeHtml).join('<br>');

  const emailStatus = order.emailSentAt
    ? `Skickat ${formatDate(order.emailSentAt)}`
    : order.emailError
      ? `Fel: ${escapeHtml(order.emailError)}`
      : 'Ej skickat';

  return `
    <div class="admin-order-detail">
      <div class="admin-order-detail-grid">
        <div>
          <h3>Kund</h3>
          <p><strong>${escapeHtml(customer.name || '—')}</strong></p>
          <p><a href="mailto:${escapeHtml(customer.email || '')}">${escapeHtml(customer.email || '—')}</a></p>
          <p><a href="tel:${escapeHtml(customer.phone || '')}">${escapeHtml(customer.phone || '—')}</a></p>
        </div>
        <div>
          <h3>Leverans</h3>
          <p>${address || '—'}</p>
          <p class="admin-order-meta">Betalning: ${escapeHtml(order.paymentMethod || '—')}</p>
          ${order.stockIssue ? `<p class="admin-order-warning">Lagerproblem: ${escapeHtml(order.stockIssueMessage || 'Ja')}</p>` : ''}
        </div>
        <div>
          <h3>Mejl</h3>
          <p>Kund: ${emailStatus}</p>
          <p>Admin: ${order.adminEmailSentAt ? `Skickat ${formatDate(order.adminEmailSentAt)}` : 'Ej skickat'}</p>
        </div>
      </div>
      <h3>Produkter</h3>
      <table class="admin-order-items">
        <thead>
          <tr>
            <th>Produkt</th>
            <th>Antal</th>
            <th>Radsumma</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml(items)}
        </tbody>
      </table>
      <p class="admin-order-total">Totalt: <strong>${orderTotal(order).toLocaleString('sv-SE')} kr</strong></p>
    </div>`;
}

function rowHtml(order) {
  const customer = order.customer || {};
  const detailId = `order-detail-${order.id}`;

  return `
    <tr class="admin-order-row" data-order-id="${escapeHtml(order.id)}">
      <td class="admin-order-number">${escapeHtml(displayOrderNumber(order))}</td>
      <td>${escapeHtml(formatDate(order.paidAt || order.createdAt))}</td>
      <td>${escapeHtml(customer.name || '—')}</td>
      <td><a href="mailto:${escapeHtml(customer.email || '')}">${escapeHtml(customer.email || '—')}</a></td>
      <td>${escapeHtml(customer.phone || '—')}</td>
      <td>${escapeHtml(fulfillmentLabel(order))}</td>
      <td><span class="admin-stock ${statusClass(order.status)}">${escapeHtml(statusLabel(order.status))}</span></td>
      <td>${orderTotal(order).toLocaleString('sv-SE')} kr</td>
      <td>
        <button type="button" class="admin-btn-text admin-order-toggle" aria-expanded="false" aria-controls="${detailId}" data-target="${detailId}">
          Visa
        </button>
      </td>
    </tr>
    <tr class="admin-order-detail-row" id="${detailId}" hidden>
      <td colspan="9">${detailHtml(order)}</td>
    </tr>`;
}

function filteredOrders() {
  const query = document.getElementById('orderSearch')?.value.trim().toLowerCase() || '';
  const status = document.getElementById('orderStatusFilter')?.value || 'all';

  return allOrders.filter((order) => {
    if (status !== 'all' && order.status !== status) return false;
    if (!query) return true;

    const customer = order.customer || {};
    const haystack = [
      displayOrderNumber(order),
      order.id,
      customer.name,
      customer.email,
      customer.phone,
      customer.address,
      customer.city,
      customer.postal,
      fulfillmentLabel(order),
      statusLabel(order.status),
      ...(order.items || []).map((item) => item.name),
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function renderOrders() {
  const orders = filteredOrders();
  const tbody = document.getElementById('ordersTableBody');
  const countEl = document.getElementById('ordersCount');
  const tableWrap = document.getElementById('ordersTableWrap');
  const emptyEl = document.getElementById('ordersEmpty');
  const toolbar = document.getElementById('ordersToolbar');

  if (countEl) countEl.textContent = String(orders.length);

  if (!orders.length) {
    if (tbody) tbody.innerHTML = '';
    tableWrap?.setAttribute('hidden', '');
    emptyEl?.removeAttribute('hidden');
    toolbar?.removeAttribute('hidden');
    return;
  }

  emptyEl?.setAttribute('hidden', '');
  tableWrap?.removeAttribute('hidden');
  toolbar?.removeAttribute('hidden');
  if (tbody) tbody.innerHTML = orders.map(rowHtml).join('');
}

async function fetchOrders() {
  const apiUrl = window.AfroSite?.adminOrdersApiUrl;
  const loadingEl = document.getElementById('ordersLoading');
  const errorEl = document.getElementById('ordersError');

  if (!apiUrl) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'Order-API saknas (kör endast i produktion).';
    }
    if (loadingEl) loadingEl.hidden = true;
    return;
  }

  if (loadingEl) loadingEl.hidden = false;
  if (errorEl) errorEl.hidden = true;

  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Inloggning krävs');

  const response = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte hämta ordrar');
  }

  allOrders = Array.isArray(data.orders) ? data.orders : [];
  if (loadingEl) loadingEl.hidden = true;
  renderOrders();
}

function wireTable() {
  const tbody = document.getElementById('ordersTableBody');
  tbody?.addEventListener('click', (event) => {
    const btn = event.target.closest('.admin-order-toggle');
    if (!btn) return;

    const targetId = btn.dataset.target;
    const row = document.getElementById(targetId);
    if (!row) return;

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    row.hidden = expanded;
    btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    btn.textContent = expanded ? 'Visa' : 'Dölj';
  });
}

requireAdmin((user) => {
  document.getElementById('adminLoading').hidden = true;
  document.getElementById('adminContent').hidden = false;
  document.getElementById('adminEmail').textContent = user.email || '';

  fetchOrders().catch((err) => {
    const loadingEl = document.getElementById('ordersLoading');
    const errorEl = document.getElementById('ordersError');
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || 'Kunde inte hämta ordrar';
    }
  });
});

document.getElementById('adminLogout')?.addEventListener('click', async () => {
  await signOut(getFirebaseAuth());
  window.location.href = 'index.html';
});

document.getElementById('refreshOrders')?.addEventListener('click', () => {
  fetchOrders().catch((err) => {
    const errorEl = document.getElementById('ordersError');
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || 'Kunde inte hämta ordrar';
    }
  });
});

document.getElementById('orderSearch')?.addEventListener('input', renderOrders);
document.getElementById('orderStatusFilter')?.addEventListener('change', renderOrders);
wireTable();
