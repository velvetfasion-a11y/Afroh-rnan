import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';

let allOrders = [];
let pendingRefundOrderId = null;
/** Order IDs where admin turned leveransmejl off to allow resend on next toggle on */
const deliverySwitchReset = new Set();
const deliverySending = new Set();

function isDeliverySwitchChecked(order) {
  if (!order?.deliveryEmailSentAt) return false;
  return !deliverySwitchReset.has(order.id);
}

function getOrderById(orderId) {
  return allOrders.find((order) => order.id === orderId) || null;
}

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
    refunded: 'Återbetald',
    shipped: 'Skickad',
  };
  return labels[status] || status || '—';
}

function orderDisplayStatus(order) {
  if (order.deliveryEmailSentAt) {
    return { label: 'Skickad', className: 'shipped' };
  }
  return { label: statusLabel(order.status), className: statusClass(order.status) };
}

function statusClass(status) {
  if (status === 'paid') return 'ok';
  if (status === 'refunded') return 'out';
  if (status === 'pickup_requested') return 'low';
  if (status === 'shipped') return 'shipped';
  return 'unknown';
}

function matchesStatusFilter(order, status) {
  if (status === 'all') return true;
  if (status === 'shipped') return Boolean(order.deliveryEmailSentAt);
  if (status === 'paid') {
    return order.status === 'paid' && !order.deliveryEmailSentAt;
  }
  return order.status === status;
}

function getOrdersView() {
  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'shipped' ? 'shipped' : 'paid';
}

function syncOrdersPageChrome() {
  const filter = document.getElementById('orderStatusFilter')?.value || 'paid';
  const title = document.getElementById('ordersPageTitle');
  const sub = document.getElementById('ordersPageSub');
  const emptyText = document.getElementById('ordersEmptyText');
  const paidTab = document.querySelector('[data-orders-view="paid"]');
  const shippedTab = document.querySelector('[data-orders-view="shipped"]');

  if (filter === 'shipped') {
    if (title) title.textContent = 'Skickade ordrar';
    if (sub) sub.textContent = 'Ordrar där kunden fått mejlet om att leveransen är på väg';
    if (emptyText) emptyText.textContent = 'Inga skickade ordrar ännu.';
    paidTab?.classList.remove('active');
    shippedTab?.classList.add('active');
    return;
  }

  if (filter === 'paid') {
    if (title) title.textContent = 'Betalda ordrar';
    if (sub) sub.textContent = 'Betalda ordrar som väntar på leveransmejl';
    if (emptyText) emptyText.textContent = 'Inga betalda ordrar att skicka ännu.';
    shippedTab?.classList.remove('active');
    paidTab?.classList.add('active');
    return;
  }

  if (title) title.textContent = 'Ordrar';
  if (sub) sub.textContent = 'Alla kundbeställningar och kontaktuppgifter';
  if (emptyText) emptyText.textContent = 'Inga ordrar matchar filtret.';
  paidTab?.classList.remove('active');
  shippedTab?.classList.remove('active');
}

function initOrdersView() {
  const view = getOrdersView();
  const filter = document.getElementById('orderStatusFilter');
  if (filter) filter.value = view === 'shipped' ? 'shipped' : 'paid';
  syncOrdersPageChrome();
}

function canRefundOrder(order) {
  if (!order || order.status === 'refunded') return false;
  if (!order.paymentIntentId) return false;
  return order.status === 'paid';
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
  if (order.emailSentAt) return `Orderbekräftelse skickad ${formatDate(order.emailSentAt)}`;
  if (order.emailError) return `Orderbekräftelse misslyckades: ${order.emailError}`;
  return 'Orderbekräftelse ej skickad';
}

function deliveryEmailStatusText(order) {
  if (order.deliveryEmailSentAt) return `Leveransmejl skickat ${formatDate(order.deliveryEmailSentAt)}`;
  if (order.deliveryEmailError) return `Leveransmejl misslyckades: ${order.deliveryEmailError}`;
  return 'Leveransmejl ej skickat';
}

function cardHtml(order) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const displayStatus = orderDisplayStatus(order);

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
          <span class="admin-stock ${displayStatus.className}">${escapeHtml(displayStatus.label)}</span>
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
          ${order.shippingMethod === 'postnord' ? '<p class="admin-order-block-meta">Frakt: PostNord - Spårbart Ombud</p>' : ''}
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
          <p class="admin-order-block-meta">${escapeHtml(deliveryEmailStatusText(order))}</p>
          ${order.refundedAt ? `<p class="admin-order-block-meta">Återbetald ${escapeHtml(formatDate(order.refundedAt))}</p>` : ''}
          ${order.refundEmailSentAt ? `<p class="admin-order-block-meta">Återbetalningsmejl skickat ${escapeHtml(formatDate(order.refundEmailSentAt))}</p>` : ''}
          ${order.refundEmailError ? `<p class="admin-order-warning">Återbetalningsmejl: ${escapeHtml(order.refundEmailError)}</p>` : ''}
        </div>
      </div>

      <div class="admin-order-card-actions">
        ${canRefundOrder(order) ? `<button type="button" class="admin-btn-outline admin-order-refund" data-order-id="${escapeHtml(order.id)}">Återbetala</button>` : ''}
        ${order.status !== 'refunded' ? `
        <label class="admin-delivery-switch">
          <span class="admin-delivery-switch-label">Leveransmejl</span>
          <input
            type="checkbox"
            class="admin-delivery-switch-input"
            data-order-id="${escapeHtml(order.id)}"
            ${isDeliverySwitchChecked(order) ? 'checked' : ''}
            ${deliverySending.has(order.id) ? 'disabled' : ''}
            aria-label="Skicka leveransmejl till kunden"
          />
          <span class="admin-delivery-switch-track" aria-hidden="true"></span>
        </label>` : ''}
        <span class="admin-order-send-feedback" hidden></span>
      </div>
    </article>`;
}

function filteredOrders() {
  const query = document.getElementById('orderSearch')?.value.trim().toLowerCase() || '';
  const status = document.getElementById('orderStatusFilter')?.value || 'paid';

  return allOrders.filter((order) => {
    if (!matchesStatusFilter(order, status)) return false;
    if (!query) return true;

    const customer = order.customer || {};
    const displayStatus = orderDisplayStatus(order);
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
      displayStatus.label,
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

async function sendDeliveryEmail(orderId, input, { force = false } = {}) {
  const apiUrl = window.AfroSite?.adminSendOrderEmailApiUrl;
  if (!apiUrl) throw new Error('Mejl-API saknas');

  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Inloggning krävs');

  const card = input.closest('.admin-order-card');
  const feedback = card?.querySelector('.admin-order-send-feedback');

  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.className = 'admin-order-send-feedback';
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, force }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Kunde inte skicka leveransmejl');
  }

  const now = new Date().toISOString();
  updateOrderInList(orderId, {
    deliveryEmailSentAt: data.deliverySent ? now : getOrderById(orderId)?.deliveryEmailSentAt,
    deliveryEmailError: null,
  });
  deliverySwitchReset.delete(orderId);
  renderOrders();

  if (feedback) {
    feedback.hidden = false;
    feedback.classList.add('success');
    feedback.textContent = data.alreadySent ? 'Leveransmejl var redan skickat' : 'Leveransmejl skickat!';
  }
}

async function handleDeliverySwitchChange(input) {
  const orderId = input.dataset.orderId;
  const order = getOrderById(orderId);
  if (!orderId || !order) return;

  if (deliverySending.has(orderId)) {
    input.checked = isDeliverySwitchChecked(order);
    return;
  }

  if (input.checked) {
    if (order.deliveryEmailSentAt && !deliverySwitchReset.has(orderId)) {
      input.checked = true;
      return;
    }

    const force = Boolean(order.deliveryEmailSentAt && deliverySwitchReset.has(orderId));
    deliverySending.add(orderId);
    input.disabled = true;

    const card = input.closest('.admin-order-card');
    const feedback = card?.querySelector('.admin-order-send-feedback');

    try {
      await sendDeliveryEmail(orderId, input, { force });
    } catch (err) {
      input.checked = false;
      if (feedback) {
        feedback.hidden = false;
        feedback.classList.add('error');
        feedback.textContent = err.message || 'Kunde inte skicka leveransmejl';
      }
    } finally {
      deliverySending.delete(orderId);
      input.disabled = false;
    }
    return;
  }

  if (order.deliveryEmailSentAt) {
    deliverySwitchReset.add(orderId);
  }
}

function wireGrid() {
  const grid = document.getElementById('ordersGrid');
  grid?.addEventListener('change', (event) => {
    const deliverySwitch = event.target.closest('.admin-delivery-switch-input');
    if (deliverySwitch) {
      void handleDeliverySwitchChange(deliverySwitch);
      return;
    }
  });

  grid?.addEventListener('click', (event) => {
    const refundBtn = event.target.closest('.admin-order-refund');
    if (refundBtn && !refundBtn.disabled) {
      const orderId = refundBtn.dataset.orderId;
      if (orderId) openRefundModal(orderId);
    }
  });
}

function openRefundModal(orderId) {
  const order = getOrderById(orderId);
  const modal = document.getElementById('refund-modal');
  const details = document.getElementById('refund-modal-details');
  const errorEl = document.getElementById('refund-modal-error');
  const confirmBtn = document.getElementById('refund-confirm-btn');

  if (!order || !modal || !details) return;

  pendingRefundOrderId = orderId;
  const customer = order.customer || {};
  const total = orderTotal(order);

  details.innerHTML = `
    <p><strong>Order:</strong> ${escapeHtml(displayOrderNumber(order))}</p>
    <p><strong>Kund:</strong> ${escapeHtml(customer.name || 'Kund')}</p>
    <p><strong>E-post:</strong> ${escapeHtml(customer.email || '—')}</p>
    <p><strong>Belopp:</strong> ${total.toLocaleString('sv-SE')} kr</p>
  `;

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Återbetala';
  }

  modal.hidden = false;
}

function closeRefundModal() {
  const modal = document.getElementById('refund-modal');
  if (modal) modal.hidden = true;
  pendingRefundOrderId = null;
}

async function confirmRefund() {
  const orderId = pendingRefundOrderId;
  const apiUrl = window.AfroSite?.adminRefundOrderApiUrl;
  const confirmBtn = document.getElementById('refund-confirm-btn');
  const errorEl = document.getElementById('refund-modal-error');

  if (!orderId || !apiUrl) return;

  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Inloggning krävs');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Återbetalar…';
  }
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Kunde inte återbetala ordern');
    }

    const now = new Date().toISOString();
    updateOrderInList(orderId, {
      status: 'refunded',
      refundedAt: now,
      refundId: data.refundId || null,
      refundEmailSentAt: data.emailSent ? now : null,
      refundEmailError: data.emailError || null,
    });
    closeRefundModal();
    renderOrders();
  } catch (err) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = err.message || 'Kunde inte återbetala ordern';
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Återbetala';
    }
  }
}

function wireRefundModal() {
  document.querySelectorAll('[data-close-refund-modal]').forEach((el) => {
    el.addEventListener('click', closeRefundModal);
  });

  document.getElementById('refund-confirm-btn')?.addEventListener('click', () => {
    void confirmRefund();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeRefundModal();
  });
}

requireAdmin((user) => {
  document.getElementById('adminLoading').hidden = true;
  document.getElementById('adminContent').hidden = false;
  document.getElementById('adminEmail').textContent = user.email || '';
  initOrdersView();

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
document.getElementById('orderStatusFilter')?.addEventListener('change', (event) => {
  const value = event.target.value;
  const url = new URL(window.location.href);
  if (value === 'shipped') {
    url.searchParams.set('view', 'shipped');
  } else {
    url.searchParams.delete('view');
  }
  window.history.replaceState({}, '', url);
  syncOrdersPageChrome();
  renderOrders();
});
wireGrid();
wireRefundModal();
