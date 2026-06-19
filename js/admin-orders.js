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

function addressText(order) {
  const customer = order.customer || {};
  if (order.fulfillment === 'pickup') {
    const store = order.pickupStore === 'marsta' ? 'Märsta' : order.pickupStore === 'fittja' ? 'Fittja' : order.pickupStore || '';
    return store ? `Hämtning i butik – ${store}` : 'Hämtning i butik';
  }
  return [
    customer.address,
    [customer.postal, customer.city].filter(Boolean).join(' '),
    customer.country,
  ].filter(Boolean).join(', ') || '—';
}

function itemsListHtml(items) {
  if (!items?.length) return '<p class="admin-order-block-text">Inga produkter</p>';
  return `<ul class="admin-order-items-list">${items.map((item) => {
    const qty = Number(item.qty) || 1;
    const lineTotal = (Number(item.price) || 0) * qty;
    const variant = item.colorName ? ` (${item.colorName})` : '';
    return `<li><span>${escapeHtml(item.name || 'Produkt')}${escapeHtml(variant)}</span><span>${qty} st · ${lineTotal.toLocaleString('sv-SE')} kr</span></li>`;
  }).join('')}</ul>`;
}

function emailStatusText(order) {
  if (order.emailSentAt) return `Kundmejl skickat ${formatDate(order.emailSentAt)}`;
  if (order.emailError) return `Kundmejl misslyckades: ${order.emailError}`;
  return 'Kundmejl ej skickat';
}

function cardHtml(order) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];

  return `
    <article class="admin-order-card" data-order-id="${escapeHtml(order.id)}">
      <div class="admin-order-card-top">
        <div class="admin-order-mini">
          <span class="admin-order-mini-label">Order</span>
          <span class="admin-order-mini-value">${escapeHtml(displayOrderNumber(order))}</span>
        </div>
        <div class="admin-order-mini">
          <span class="admin-order-mini-label">Datum</span>
          <span class="admin-order-mini-value">${escapeHtml(formatDate(order.paidAt || order.createdAt))}</span>
        </div>
        <div class="admin-order-mini">
          <span class="admin-order-mini-label">Status</span>
          <span class="admin-stock ${statusClass(order.status)}">${escapeHtml(statusLabel(order.status))}</span>
        </div>
        <div class="admin-order-mini">
          <span class="admin-order-mini-label">Summa</span>
          <span class="admin-order-mini-value admin-order-mini-total">${orderTotal(order).toLocaleString('sv-SE')} kr</span>
        </div>
      </div>

      <div class="admin-order-card-body">
        <div class="admin-order-block">
          <h3 class="admin-order-block-title">Kund</h3>
          <p class="admin-order-block-text"><strong>${escapeHtml(customer.name || '—')}</strong></p>
          <p class="admin-order-block-text">${escapeHtml(customer.email || '—')}</p>
          <p class="admin-order-block-text">${escapeHtml(customer.phone || '—')}</p>
        </div>

        <div class="admin-order-block">
          <h3 class="admin-order-block-title">${order.fulfillment === 'pickup' ? 'Hämtning' : 'Leverans'}</h3>
          <p class="admin-order-block-text">${escapeHtml(fulfillmentLabel(order))}</p>
          <p class="admin-order-block-text">${escapeHtml(addressText(order))}</p>
          <p class="admin-order-block-meta">Betalning: ${escapeHtml(order.paymentMethod || '—')}</p>
          ${order.stockIssue ? `<p class="admin-order-warning">Lagerproblem: ${escapeHtml(order.stockIssueMessage || 'Ja')}</p>` : ''}
        </div>

        <div class="admin-order-block">
          <h3 class="admin-order-block-title">Produkter</h3>
          ${itemsListHtml(items)}
        </div>

        <div class="admin-order-block">
          <h3 class="admin-order-block-title">Mejl</h3>
          <p class="admin-order-block-meta admin-order-email-status">${escapeHtml(emailStatusText(order))}</p>
          ${order.adminEmailSentAt ? `<p class="admin-order-block-meta">Adminmejl skickat ${escapeHtml(formatDate(order.adminEmailSentAt))}</p>` : ''}
        </div>
      </div>

      <div class="admin-order-card-actions">
        <button type="button" class="admin-btn admin-order-send-email" data-order-id="${escapeHtml(order.id)}">
          Skicka mejl
        </button>
        <span class="admin-order-send-feedback" hidden></span>
      </div>
    </article>`;
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
  const grid = document.getElementById('ordersGrid');
  const countEl = document.getElementById('ordersCount');
  const emptyEl = document.getElementById('ordersEmpty');
  const toolbar = document.getElementById('ordersToolbar');

  if (countEl) countEl.textContent = String(orders.length);

  if (!orders.length) {
    if (grid) {
      grid.innerHTML = '';
      grid.hidden = true;
    }
    emptyEl?.removeAttribute('hidden');
    toolbar?.removeAttribute('hidden');
    return;
  }

  emptyEl?.setAttribute('hidden', '');
  toolbar?.removeAttribute('hidden');
  if (grid) {
    grid.hidden = false;
    grid.innerHTML = orders.map(cardHtml).join('');
  }
}

function updateOrderInList(orderId, patch) {
  const index = allOrders.findIndex((order) => order.id === orderId);
  if (index < 0) return;
  allOrders[index] = { ...allOrders[index], ...patch };
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

async function sendOrderEmail(orderId, button) {
  const apiUrl = window.AfroSite?.adminSendOrderEmailApiUrl;
  if (!apiUrl) throw new Error('Mejl-API saknas');

  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Inloggning krävs');

  const card = button.closest('.admin-order-card');
  const feedback = card?.querySelector('.admin-order-send-feedback');
  const originalLabel = button.textContent;

  button.disabled = true;
  button.textContent = 'Skickar…';
  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.className = 'admin-order-send-feedback';
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId, force: true }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte skicka mejl');
    }

    const now = new Date().toISOString();
    updateOrderInList(orderId, {
      emailSentAt: data.emails?.customerSent ? now : allOrders.find((o) => o.id === orderId)?.emailSentAt,
      adminEmailSentAt: data.emails?.adminSent ? now : allOrders.find((o) => o.id === orderId)?.adminEmailSentAt,
      emailError: data.emails?.errors?.customer || null,
    });
    renderOrders();

    if (feedback) {
      feedback.hidden = false;
      feedback.classList.add('success');
      feedback.textContent = 'Mejl skickat!';
    }
  } catch (err) {
    if (feedback) {
      feedback.hidden = false;
      feedback.classList.add('error');
      feedback.textContent = err.message || 'Kunde inte skicka mejl';
    }
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function wireGrid() {
  const grid = document.getElementById('ordersGrid');
  grid?.addEventListener('click', (event) => {
    const btn = event.target.closest('.admin-order-send-email');
    if (!btn || btn.disabled) return;
    const orderId = btn.dataset.orderId;
    if (!orderId) return;
    void sendOrderEmail(orderId, btn);
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
wireGrid();
