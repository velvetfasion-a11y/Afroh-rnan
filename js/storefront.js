import { subscribeMergedProducts, productsForCategory, mergeProducts } from './products.js';
import { saveProductPreview } from './product-preview.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendProductImage(container, product) {
  const emoji = product.emoji || '📦';
  if (product.image) {
    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.name;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'pcard-emoji';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = emoji;
      img.replaceWith(fallback);
    }, { once: true });
    container.appendChild(img);
    return;
  }

  const fallback = document.createElement('span');
  fallback.className = 'pcard-emoji';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.textContent = emoji;
  container.appendChild(fallback);
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'pcard';
  card.dataset.slug = product.slug;
  card.dataset.name = product.name;
  card.dataset.brand = product.brand || '';
  card.dataset.price = String(product.price);
  card.dataset.image = product.image || '';
  card.dataset.url = product.url;
  card.dataset.emoji = product.emoji || '📦';
  if (Number.isFinite(product.inventory)) {
    card.dataset.inventory = String(product.inventory);
  }
  if (product.hasMultipleColors) {
    card.dataset.hasColors = 'true';
  }

  const link = document.createElement('a');
  link.href = product.url;
  link.className = 'pcard-link';
  link.addEventListener('click', () => saveProductPreview(product));

  const imgWrap = document.createElement('div');
  imgWrap.className = 'pcard-img';
  appendProductImage(imgWrap, product);

  if (product.badge) {
    const badge = document.createElement('span');
    badge.className = `pcard-badge${product.badgeGold ? ' gold' : ''}`;
    badge.textContent = product.badge;
    imgWrap.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = 'pcard-body';
  body.innerHTML = `
    <div class="pcard-brand">${escapeHtml(product.brand || 'Produkt')}</div>
    <div class="pcard-name">${escapeHtml(product.name)}</div>
    ${product.hasMultipleColors ? '<div class="pcard-colors-hint">Finns i fler färger</div>' : ''}
    <div class="pcard-price">${product.price.toLocaleString('sv-SE')} kr</div>`;

  link.append(imgWrap, body);

  const actions = document.createElement('div');
  actions.className = 'pcard-actions';
  actions.innerHTML = `<button type="button" class="pcard-cart">${product.hasMultipleColors ? 'Välj färg' : 'Lägg i kundvagn'}</button>`;

  card.append(link, actions);
  return card;
}

function syncProductGridBackground(grid) {
  if (!grid) return;
  const count = grid.querySelectorAll('.pcard').length;
  if (!count) {
    grid.classList.add('product-grid--sparse');
    return;
  }
  const cols = getComputedStyle(grid).gridTemplateColumns
    .split(' ')
    .filter((track) => track && track !== '0px').length || 1;
  const rows = Math.ceil(count / cols);
  grid.classList.toggle('product-grid--sparse', count < rows * cols);
}

const gridObservers = new WeakMap();

function observeProductGrid(grid) {
  syncProductGridBackground(grid);
  if (gridObservers.has(grid)) return;
  const observer = new ResizeObserver(() => syncProductGridBackground(grid));
  observer.observe(grid);
  gridObservers.set(grid, observer);
}

function renderProductGrid(grid, products) {
  grid.replaceChildren();
  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty';
    empty.textContent = 'Inga produkter i denna kategori just nu.';
    grid.appendChild(empty);
    observeProductGrid(grid);
    return;
  }
  products.forEach((product) => grid.appendChild(createProductCard(product)));
  observeProductGrid(grid);
}

function afterGridRender(grid) {
  if (window.initProductFavorites) window.initProductFavorites(grid);
}

const CATEGORY_GRIDS = [
  { gridId: 'har-grid', cat: 'har' },
  { gridId: 'kosmetika-grid', cat: 'kosmetika' },
  { gridId: 'mat-grid', cat: 'mat' },
];

function renderGrids(products) {
  window.__afroStorefrontReady = true;
  const pageCategory = document.body.dataset.category;
  if (pageCategory) {
    renderCategoryPage(products, pageCategory);
    return;
  }

  const activeGrids = CATEGORY_GRIDS.filter(({ gridId }) => document.getElementById(gridId));
  if (!activeGrids.length) return;

  activeGrids.forEach(({ gridId, cat }) => {
    const grid = document.getElementById(gridId);
    const shown = productsForCategory(products, cat);
    renderProductGrid(grid, shown);
    if (window.initProductFavorites) window.initProductFavorites(grid);
    afterGridRender(grid);
  });

  initScrollReveal();
  initCategoryNav();
}

function renderCategoryPage(products, cat) {
  const grid = document.getElementById('category-grid');
  if (!grid) return;

  const list = productsForCategory(products, cat);
  renderProductGrid(grid, list);

  if (window.initProductFavorites) window.initProductFavorites(grid);
  afterGridRender(grid);
  initScrollReveal();
  initCategoryNav();
}

function initCategoryNav() {
  const links = document.querySelectorAll('.cat-nav-link');
  const pageCategory = document.body.dataset.category;

  if (pageCategory && links.length) {
    links.forEach((link) => {
      link.classList.toggle('active', link.dataset.cat === pageCategory);
    });
    return;
  }

  const sectionCats = [
    { id: 'har-products', cat: 'har' },
    { id: 'kosmetika-products', cat: 'kosmetika' },
    { id: 'mat-products', cat: 'mat' },
  ];
  const sections = sectionCats
    .map(({ id, cat }) => {
      const el = document.getElementById(id);
      return el ? { el, cat } : null;
    })
    .filter(Boolean);
  if (!links.length || !sections.length) return;

  function setActive(cat) {
    links.forEach((link) => {
      link.classList.toggle('active', link.dataset.cat === cat);
    });
  }

  const hash = location.hash.replace('#', '');
  const validCats = ['har', 'kosmetika', 'mat'];
  if (validCats.includes(hash)) setActive(hash);
  else setActive('har');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const match = sections.find((section) => section.el === entry.target);
        if (match) setActive(match.cat);
      });
    },
    { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
  );

  sections.forEach(({ el }) => observer.observe(el));
}

function initScrollReveal() {
  document.querySelectorAll('.pcard:not(.pcard-visible), .loc-card:not(.pcard-visible)').forEach((el) => {
    el.classList.add('pcard-visible');
    el.style.opacity = '1';
    el.style.animation = 'fadeUp .5s ease both';
  });
}

function loadStorefront() {
  const hasGrid =
    CATEGORY_GRIDS.some(({ gridId }) => document.getElementById(gridId)) ||
    document.getElementById('category-grid');
  if (!hasGrid) return;

  let renderTimer = null;
  const scheduleRender = (products) => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => renderGrids(products), 60);
  };

  try {
    subscribeMergedProducts((products) => {
      scheduleRender(products);
    });
  } catch (err) {
    console.error('Kunde inte ladda produkter:', err);
    renderGrids(mergeProducts([]));
  }
}

loadStorefront();

window.AfroObserveProductGrid = observeProductGrid;
