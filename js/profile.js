import {
  requireAuth,
  signOut,
  getFirebaseAuth,
  updateProfile,
  wireNavProfile,
} from './firebase-auth.js?v=5';
import { isAdminUser } from './admin-check.js';
import {
  getStoredFavoriteSlugs,
  removeFavorite,
} from './product-catalog.js';
import { subscribeMergedProducts, getProductBySlug } from './products.js';

let currentUser = null;
let favFilter = 'alla';
let currentTab = 'overview';
let mergedProducts = [];

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
  return getStoredFavoriteSlugs()
    .map((slug) => getProductBySlug(mergedProducts, slug))
    .filter(Boolean);
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
        <span class="fav-cat">${product.catLabel || ({ har: 'Hår & Extensions', kosmetika: 'Hudvård', mat: 'Mat & Kryddor' }[product.cat] || 'Produkt')}</span>
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

  try {
    if (await isAdminUser(user)) {
      window.location.replace('admin.html');
      return;
    }
  } catch (err) {
    console.warn('Admin check failed on profile:', err);
  }

  revealProfile(user);

  try {
    subscribeMergedProducts((products) => {
      mergedProducts = products;
      if (currentUser) {
        updateFavCounts();
        renderOverviewFavorites();
        renderFavoritesGrid();
      }
    });
  } catch (err) {
    console.error('Could not subscribe to products on profile:', err);
  }
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
