import {
  requireAuth,
  signOut,
  getFirebaseAuth,
  updateProfile,
  wireNavProfile,
} from './firebase-auth.js';
import { isAdminUser } from './admin-check.js';
import {
  getFavoriteProducts,
  removeFavorite,
} from './product-catalog.js';

let currentUser = null;
let favFilter = 'alla';

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

function filteredFavorites() {
  const all = getFavoriteProducts();
  if (favFilter === 'alla') return all;
  return all.filter((p) => p.cat === favFilter);
}

function favCardHtml(product, options = {}) {
  const { compact = false, showRemove = true } = options;
  const imgContent = product.image
    ? `<img src="${product.image}" alt="">`
    : product.emoji;

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
        <span class="fav-cat">${product.catLabel}</span>
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
  const count = getFavoriteProducts().length;
  const badge = document.getElementById('fav-count-nav');
  if (badge) badge.textContent = String(count);
  document.getElementById('pointsVal').textContent = String(count * 10);
}

function renderOverviewFavorites() {
  const items = getFavoriteProducts().slice(0, 3);
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
        updateFavCounts();
        renderFavoritesGrid();
        renderOverviewFavorites();
      }, 280);
    });
  });
}

function goTab(tab, options = {}) {
  const { keepNavOpen = false } = options;

  document.querySelectorAll('.pnav-item[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === 'tab-' + tab);
  });

  const toggle = document.getElementById('bn-toggle');
  if (toggle) toggle.classList.toggle('is-current', tab === 'overview');

  const nav = document.getElementById('profile-nav');
  if (!keepNavOpen && nav) nav.classList.remove('is-open');
  if (!keepNavOpen && toggle) toggle.setAttribute('aria-expanded', 'false');

  if (tab !== 'overview' || !keepNavOpen) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function toggleBottomNav() {
  const nav = document.getElementById('profile-nav');
  const toggle = document.getElementById('bn-toggle');
  if (!nav || !toggle) return;

  if (nav.classList.contains('is-open')) {
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    return;
  }

  goTab('overview', { keepNavOpen: true });
  nav.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
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
}

wireNavProfile();

requireAuth(async (user) => {
  if (await isAdminUser(user)) {
    window.location.replace('admin.html');
    return;
  }

  document.getElementById('profileLoading').hidden = true;
  document.getElementById('profileContent').hidden = false;
  populateUser(user);

  const hash = window.location.hash.replace('#', '');
  if (hash && document.getElementById('tab-' + hash)) {
    goTab(hash);
  }
});

document.getElementById('bn-toggle').addEventListener('click', toggleBottomNav);

document.querySelectorAll('.pnav-item[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => goTab(btn.dataset.tab));
});

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

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
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

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await signOut(getFirebaseAuth());
  window.location.href = 'index.html';
});
