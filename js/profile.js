import {
  requireAuth,
  signOut,
  getFirebaseAuth,
  updateProfile,
  wireNavProfile,
} from './firebase-auth.js?v=22';
import {
  getStoredFavoriteSlugs,
  removeFavorite,
} from './product-catalog.js';
import { fetchProductsForSlugs } from './products.js';
import { fetchOrdersForUser } from './firebase-db.js';

let currentUser = null;
let favFilter = 'alla';
let currentTab = 'overview';
let mergedProducts = [];
let customerOrders = [];

const HEART_FILLED =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

function initials(user) {
  const name = user.displayName || user.email || '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function firstName(user) {
  if (user.displayName) return user.displayName.split(/\s+/)[0];
  if (user.email) return user.email.split('@')[0];
  return 'du';
}

function splitName(displayName) {
  if (!displayName) return { first: '', last: '' };
  const parts = displayName.trim().split(/\s+/);
  return {
    first: parts[0] || '',
    last: parts.slice(1).join(' ') || '',
  };
}

function resolvedFavorites() {
  return mergedProducts;
}

function filteredFavorites() {
  const all = resolvedFavorites();
  if (favFilter === 'alla') return all;
  return all.filter((p) => p.cat === favFilter);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function orderTimestamp(order) {
  const value = order.paidAt || order.createdAt;
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  return value ? new Date(value) : null;
}

function formatOrderDate(order) {
  const date = orderTimestamp(order);
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
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

function orderItemCount(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + (Number(item.qty) || 1),
    0,
  );
}

function orderItemSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const count = orderItemCount(items);
  if (!count) return 'Inga produkter';
  if (count === 1) return items[0]?.name || '1 produkt';
  return `${count} produkter`;
}

function orderStatusLabel(status) {
  const labels = {
    paid: 'Betald',
    pending: 'Väntar på betalning',
    pickup_requested: 'Hämtning',
  };
  return labels[status] || 'Registrerad';
}

function orderStatusBadgeClass(status) {
  if (status === 'paid') return 'delivered';
  if (status === 'pickup_requested') return 'processing';
  return 'processing';
}

function visibleCustomerOrders(orders) {
  return (orders || []).filter((order) => {
    if (order.status === 'paid' || order.status === 'pickup_requested') return true;
    if (order.orderNumber) return true;
    return false;
  });
}

function orderRowHtml(order, options = {}) {
  const { compact = false } = options;
  const items = Array.isArray(order.items) ? order.items : [];
  const fulfillment = order.fulfillment === 'pickup'
    ? `Hämtning${order.pickupStore ? ` · ${order.pickupStore === 'marsta' ? 'Märsta' : 'Fittja'}` : ''}`
    : 'Leverans';

  const itemsList = compact
    ? ''
    : `<ul class="order-items">${items.map((item) => {
      const qty = Number(item.qty) || 1;
      const label = qty > 1 ? `${escapeHtml(item.name || 'Produkt')} × ${qty}` : escapeHtml(item.name || 'Produkt');
      return `<li>${label}</li>`;
    }).join('')}</ul>`;

  return `
    <div class="order-row">
      <div class="order-row-main">
        <div class="order-number">${escapeHtml(displayOrderNumber(order))}</div>
        <span class="order-meta">${escapeHtml(formatOrderDate(order))} · ${escapeHtml(orderItemSummary(order))} · ${escapeHtml(fulfillment)}</span>
        ${itemsList}
      </div>
      <span class="badge ${orderStatusBadgeClass(order.status)}">${escapeHtml(orderStatusLabel(order.status))}</span>
      <div class="order-total">${orderTotal(order).toLocaleString('sv-SE')} kr</div>
    </div>`;
}

function renderOrders() {
  const orders = visibleCustomerOrders(customerOrders);
  const ordersList = document.getElementById('ordersList');
  const ordersEmpty = document.getElementById('ordersEmpty');
  const ordersLoading = document.getElementById('ordersLoading');
  const overviewList = document.getElementById('overviewOrderList');
  const overviewEmpty = document.getElementById('overviewOrderEmpty');

  if (ordersLoading) ordersLoading.hidden = true;

  if (!orders.length) {
    ordersList?.setAttribute('hidden', '');
    if (ordersList) ordersList.innerHTML = '';
    ordersEmpty?.removeAttribute('hidden');
    overviewList?.setAttribute('hidden', '');
    if (overviewList) overviewList.innerHTML = '';
    overviewEmpty?.removeAttribute('hidden');
    return;
  }

  ordersEmpty?.setAttribute('hidden', '');
  if (ordersList) {
    ordersList.hidden = false;
    ordersList.innerHTML = orders.map((order) => orderRowHtml(order)).join('');
  }

  overviewEmpty?.setAttribute('hidden', '');
  if (overviewList) {
    overviewList.hidden = false;
    overviewList.innerHTML = orderRowHtml(orders[0], { compact: true });
  }
}

async function syncPendingPaidOrders(orders) {
  const syncUrl = window.AfroSite?.syncOrderApiUrl;
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!syncUrl || !user) return orders;

  const pending = (orders || []).filter((order) => {
    if (order.status === 'pending' && order.paymentIntentId) return true;
    if (order.status === 'paid' && (!order.emailSentAt || !order.adminEmailSentAt)) return true;
    return false;
  });
  if (!pending.length) return orders;

  const token = await user.getIdToken();
  await Promise.all(pending.map((order) => fetch(syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId: order.id }),
  }).catch((err) => {
    console.warn('Could not sync order', order.id, err);
  })));

  return fetchOrdersForUser(user);
}

async function refreshCustomerOrders() {
  if (!currentUser) {
    customerOrders = [];
    renderOrders();
    return;
  }

  const ordersLoading = document.getElementById('ordersLoading');
  if (ordersLoading) ordersLoading.hidden = false;

  try {
    let orders = await fetchOrdersForUser(currentUser);
    orders = await syncPendingPaidOrders(orders);
    customerOrders = orders;
    renderOrders();
  } catch (err) {
    console.error('Could not load customer orders:', err);
    customerOrders = [];
    renderOrders();
    const ordersEmpty = document.getElementById('ordersEmpty');
    if (ordersEmpty) {
      ordersEmpty.hidden = false;
      ordersEmpty.innerHTML = 'Kunde inte hämta dina beställningar just nu. Försök igen senare.';
    }
  }
}

function favImageHtml(product) {
  const emoji = product.emoji || '📦';
  if (!product.image) {
    return `<span class="fav-emoji" aria-hidden="true">${emoji}</span>`;
  }
  return `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" data-emoji="${escapeHtml(emoji)}" onerror="this.onerror=null;var s=document.createElement('span');s.className='fav-emoji';s.setAttribute('aria-hidden','true');s.textContent=this.dataset.emoji;this.replaceWith(s)">`;
}

function favCardHtml(product, options = {}) {
  const { compact = false, showRemove = true } = options;
  const imgContent = favImageHtml(product);

  const removeBtn = showRemove
    ? `<button type="button" class="fav-heart" data-remove-fav="${product.slug}" aria-label="Ta bort från sparade">${HEART_FILLED}</button>`
    : '';

  const bottom = compact
    ? `<div class="fav-bottom"><div class="fav-price">${product.price} kr</div></div>`
    : `<div class="fav-bottom">
        <div><div class="fav-price">${product.price} kr</div></div>
        <a href="${product.url}" class="fav-link">Visa produkt</a>
      </div>`;

  return `
    <div class="fav-card" id="fav-${product.slug}">
      <div class="fav-img">
        <span class="fav-cat">${product.catLabel || ({ har: 'Hårvård', kosmetika: 'Skönhet', mat: 'Mat', accessoarer: 'Accessoarer' }[product.cat] || 'Produkt')}</span>
        ${removeBtn}
        ${imgContent}
      </div>
      <div class="fav-body">
        <div class="fav-brand">${product.brand}</div>
        <div class="fav-name">${product.name}</div>
        ${bottom}
      </div>
    </div>`;
}

function updateFavCounts() {
  const count = resolvedFavorites().length;
  const badge = document.getElementById('fav-count-nav');
  if (badge) badge.textContent = String(count);
  document.getElementById('pointsVal').textContent = String(count * 10);
}

function renderOverviewFavorites() {
  const items = resolvedFavorites().slice(0, 3);
  const grid = document.getElementById('overviewFavGrid');
  const empty = document.getElementById('overviewFavEmpty');

  if (!items.length) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  empty.classList.add('hidden');
  grid.innerHTML = items.map((p) => favCardHtml(p, { compact: true, showRemove: false })).join('');
}

function renderFavoritesGrid() {
  const items = filteredFavorites();
  const grid = document.getElementById('fav-grid');
  const empty = document.getElementById('fav-empty');

  if (!items.length) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  empty.classList.add('hidden');
  grid.innerHTML = items.map((p) => favCardHtml(p)).join('');

  grid.querySelectorAll('[data-remove-fav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.removeFav;
      const card = document.getElementById('fav-' + slug);
      if (card) card.classList.add('removing');
      setTimeout(() => {
        removeFavorite(slug);
        mergedProducts = mergedProducts.filter((p) => p.slug !== slug);
        updateFavCounts();
        renderFavoritesGrid();
        renderOverviewFavorites();
      }, 280);
    });
  });
}

function isDesktopNav() {
  return window.matchMedia('(min-width: 901px)').matches;
}

function placeNav(tab) {
  const nav = document.getElementById('profile-nav');
  if (!nav) return;

  let anchor;
  if (isDesktopNav()) {
    anchor = document.getElementById('nav-anchor-sidebar');
  } else if (tab === 'overview') {
    anchor = document.getElementById('nav-anchor-overview');
  } else {
    anchor = document.getElementById('nav-anchor-main');
  }

  if (anchor && nav.parentElement !== anchor) {
    anchor.appendChild(nav);
  }

  nav.classList.add('is-placed');

  const menu = document.getElementById('bn-collapse');
  const toggle = document.getElementById('bn-toggle');

  if (isDesktopNav()) {
    nav.classList.remove('is-open');
    if (menu) menu.hidden = false;
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }
}

function updateNavToggle(tab) {
  const toggle = document.getElementById('bn-toggle');
  if (!toggle) return;
  toggle.classList.toggle('on-overview', tab === 'overview' && !document.getElementById('profile-nav')?.classList.contains('is-open'));
}

function goTab(tab, options = {}) {
  const { keepNavOpen = false } = options;
  currentTab = tab;

  document.querySelectorAll('.pnav-item[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === 'tab-' + tab);
  });

  placeNav(tab);
  updateNavToggle(tab);

  const nav = document.getElementById('profile-nav');
  const menu = document.getElementById('bn-collapse');
  const toggle = document.getElementById('bn-toggle');

  if (!keepNavOpen && !isDesktopNav()) {
    nav?.classList.remove('is-open');
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    updateNavToggle(tab);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleBottomNav() {
  if (isDesktopNav()) return;

  const nav = document.getElementById('profile-nav');
  const menu = document.getElementById('bn-collapse');
  const toggle = document.getElementById('bn-toggle');
  if (!nav || !menu || !toggle) return;

  const willOpen = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', willOpen);
  menu.hidden = !willOpen;
  toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  updateNavToggle(currentTab);
}

function populateUser(user) {
  currentUser = user;
  const { first, last } = splitName(user.displayName || '');

  document.getElementById('sidebarAvatar').textContent = initials(user);
  document.getElementById('sidebarName').textContent = user.displayName || 'Mitt konto';
  document.getElementById('sidebarEmail').textContent = user.email || '';
  document.getElementById('greeting').textContent = `Hej, ${firstName(user)}! 👋`;

  document.getElementById('settingsFirst').value = first;
  document.getElementById('settingsLast').value = last;
  document.getElementById('settingsEmail').value = user.email || '';

  const memberSince = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).getFullYear()
    : new Date().getFullYear();
  document.getElementById('sidebarTier').textContent = `Medlem sedan ${memberSince}`;
  document.getElementById('membershipTier').textContent = `Medlem sedan ${memberSince}`;

  updateFavCounts();
  renderOverviewFavorites();
  renderFavoritesGrid();
  refreshCustomerOrders();
}

function showProfileError(message) {
  const loading = document.getElementById('profileLoading');
  if (!loading) return;
  loading.textContent = message;
  loading.classList.add('profile-loading-error');
}

function revealProfile(user) {
  document.getElementById('profileLoading').hidden = true;
  document.getElementById('profileContent').hidden = false;
  populateUser(user);

  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) {
    goTab(hash);
  } else {
    placeNav('overview');
    updateNavToggle('overview');
  }
}

function profileLoadErrorMessage() {
  if (window.AfroSite?.isLocalDev) {
    return 'Kunde inte ladda kontot lokalt. Kontrollera att servern körs på port 8000 och ladda om sidan.';
  }
  return 'Kunde inte ladda kontot. Kontrollera internet och ladda om sidan. Om problemet kvarstår, logga ut och in igen.';
}

wireNavProfile();

const profileBootTimer = window.setTimeout(() => {
  const loading = document.getElementById('profileLoading');
  const content = document.getElementById('profileContent');
  if (loading && !loading.hidden && content?.hidden) {
    window.location.assign('login.html?next=profile.html');
  }
}, 10000);

requireAuth(async (user) => {
  window.clearTimeout(profileBootTimer);
  revealProfile(user);

  async function refreshFavoriteProducts() {
    try {
      mergedProducts = await fetchProductsForSlugs(getStoredFavoriteSlugs());
      if (currentUser) {
        updateFavCounts();
        renderOverviewFavorites();
        renderFavoritesGrid();
      }
    } catch (err) {
      console.error('Could not load favorite products:', err);
    }
  }

  refreshFavoriteProducts();
  document.addEventListener('favorites:updated', refreshFavoriteProducts);
}, {
  onStateKnown: (user) => {
    window.clearTimeout(profileBootTimer);
    if (!user) return;
  },
  onError: () => {
    window.clearTimeout(profileBootTimer);
    showProfileError(profileLoadErrorMessage());
    window.setTimeout(() => {
      window.location.assign('login.html?next=profile.html');
    }, 2500);
  },
});

window.addEventListener('resize', () => {
  placeNav(currentTab);
  if (isDesktopNav()) {
    const menu = document.getElementById('bn-collapse');
    if (menu) menu.hidden = false;
  }
});

function bindNavEvents() {
  document.getElementById('bn-toggle')?.addEventListener('click', toggleBottomNav);

  document.querySelectorAll('.pnav-item[data-tab]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      goTab(btn.dataset.tab);
    });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut(getFirebaseAuth());
    window.location.href = 'index.html';
  });
}

bindNavEvents();

document.querySelectorAll('[data-go-tab]').forEach((btn) => {
  btn.addEventListener('click', () => goTab(btn.dataset.goTab));
});

document.querySelectorAll('[data-fav-filter]').forEach((chip) => {
  chip.addEventListener('click', () => {
    favFilter = chip.dataset.favFilter;
    document.querySelectorAll('[data-fav-filter]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    renderFavoritesGrid();
  });
});

document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const first = document.getElementById('settingsFirst').value.trim();
  const last = document.getElementById('settingsLast').value.trim();
  const displayName = [first, last].filter(Boolean).join(' ');
  const btn = document.getElementById('saveProfileBtn');

  try {
    await updateProfile(currentUser, { displayName: displayName || null });
    currentUser.displayName = displayName;
    populateUser(currentUser);
    btn.textContent = 'Sparat ✓';
    btn.classList.add('saved');
    setTimeout(() => {
      btn.textContent = 'Spara ändringar';
      btn.classList.remove('saved');
    }, 2000);
  } catch {
    btn.textContent = 'Kunde inte spara';
    setTimeout(() => { btn.textContent = 'Spara ändringar'; }, 2000);
  }
});
