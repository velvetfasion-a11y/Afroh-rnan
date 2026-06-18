/**
 * Firestore REST fallback when ES modules fail to render products.
 */
(function () {
  const GRIDS = [
    { id: 'har-grid', cat: 'har' },
    { id: 'kosmetika-grid', cat: 'kosmetika' },
    { id: 'mat-grid', cat: 'mat' },
    { id: 'accessoarer-grid', cat: 'accessoarer' },
    { id: 'category-grid', cat: document.body.dataset.category || '' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveCat(raw) {
    const direct = raw.category || (Array.isArray(raw.categories) && raw.categories[0]);
    if (direct) {
      const key = String(direct).toLowerCase();
      if (key === 'har' || key === 'kosmetika' || key === 'mat' || key === 'accessoarer') return key;
    }
    const cats = Array.isArray(raw.categories) ? raw.categories : [];
    const text = cats.join(' ').toLowerCase();
    if (/mat|krydd|food|te|chips|milk/.test(text)) return 'mat';
    if (/hår|har|extension|peruk|flät|hair|oil|wig/.test(text)) return 'har';
    if (/accessoar|smyck|jewel|kläder|clothing|väsk|mode/.test(text)) return 'accessoarer';
    return 'kosmetika';
  }

  function parseColors(f) {
    const values = f.colors?.arrayValue?.values || [];
    return values
      .map((entry) => {
        const map = entry.mapValue?.fields || {};
        const name = map.name?.stringValue || map.label?.stringValue || '';
        if (!name) return null;
        return {
          name,
          inventory: Number(map.inventory?.integerValue || map.inventory?.doubleValue || 0),
          image: map.image?.stringValue || '',
        };
      })
      .filter(Boolean);
  }

  function fromFirestore(doc) {
    const f = doc.fields || {};
    const str = (k) => f[k]?.stringValue || '';
    const num = (k) => Number(f[k]?.integerValue || f[k]?.doubleValue || 0);
    const images = (f.images?.arrayValue?.values || []).map((v) => v.stringValue).filter(Boolean);
    const colors = parseColors(f);
    const id = doc.name.split('/').pop();
    const cat = resolveCat({
      category: str('category'),
      categories: (f.categories?.arrayValue?.values || []).map((v) => v.stringValue),
    });
    const displayColor = colors.find((color) => color.inventory > 0) || colors[0];
    return {
      id,
      name: str('title') || 'Produkt',
      brand: str('subtitle') || '',
      cat,
      price: num('price'),
      image: displayColor?.image || images[0] || '',
      inventory: colors.length
        ? colors.reduce((sum, color) => sum + Math.max(0, color.inventory), 0)
        : num('inventory'),
      hasMultipleColors: colors.length > 1,
    };
  }

  function inStock(p) {
    return Number.isFinite(p.inventory) && p.inventory > 0;
  }

  document.addEventListener(
    'click',
    function (event) {
      var link = event.target.closest('.pcard-link');
      if (!link) return;
      var card = link.closest('.pcard');
      if (!card) return;
      var preview = {
        slug: card.dataset.slug,
        name: card.dataset.name,
        brand: card.dataset.brand || '',
        price: Number(card.dataset.price),
        image: card.dataset.image || '',
        hasMultipleColors: card.dataset.hasColors === 'true',
      };
      if (window.AfroProductPreview && preview.slug) {
        window.AfroProductPreview.save(preview);
      }
    },
    true,
  );

  function cardHtml(p) {
    const url = 'produkt.html?slug=' + encodeURIComponent(p.id);
    const inventoryAttr = Number.isFinite(p.inventory) ? ' data-inventory="' + p.inventory + '"' : '';
    const hasColorsAttr = p.hasMultipleColors ? ' data-has-colors="true"' : '';
    const img = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="pcard-emoji" aria-hidden="true">📦</span>';
    const colorsHint = p.hasMultipleColors ? '<div class="pcard-colors-hint">Finns i fler färger</div>' : '';
    const cartLabel = p.hasMultipleColors ? 'Välj färg' : 'Lägg i kundvagn';
    return (
      '<div class="pcard" data-slug="' + esc(p.id) + '" data-name="' + esc(p.name) + '" data-brand="' + esc(p.brand) + '" data-price="' + p.price + '" data-image="' + esc(p.image) + '" data-url="' + esc(url) + '" data-emoji="📦"' + inventoryAttr + hasColorsAttr + '>' +
        '<a href="' + esc(url) + '" class="pcard-link">' +
          '<div class="pcard-img">' + img + '<span class="pcard-badge gold">Ny</span></div>' +
          '<div class="pcard-body">' +
            '<div class="pcard-brand">' + esc(p.brand || 'Produkt') + '</div>' +
            '<div class="pcard-name">' + esc(p.name) + '</div>' +
            colorsHint +
            '<div class="pcard-price">' + Number(p.price).toLocaleString('sv-SE') + ' kr</div>' +
          '</div>' +
        '</a>' +
        '<div class="pcard-actions"><button type="button" class="pcard-cart">' + cartLabel + '</button></div>' +
      '</div>'
    );
  }

  function gridHasProducts(el) {
    return el && el.querySelector('.pcard');
  }

  function syncProductGridBackground(grid) {
    if (!grid) return;
    var count = grid.querySelectorAll('.pcard').length;
    if (!count) {
      grid.classList.add('product-grid--sparse');
      return;
    }
    var cols = getComputedStyle(grid).gridTemplateColumns
      .split(' ')
      .filter(function (track) { return track && track !== '0px'; }).length || 1;
    var rows = Math.ceil(count / cols);
    grid.classList.toggle('product-grid--sparse', count < rows * cols);
  }

  function observeProductGrid(grid) {
    syncProductGridBackground(grid);
    if (!grid || grid.dataset.gridObserved) return;
    grid.dataset.gridObserved = '1';
    if (typeof ResizeObserver === 'undefined') return;
    new ResizeObserver(function () { syncProductGridBackground(grid); }).observe(grid);
  }

  window.AfroObserveProductGrid = observeProductGrid;

  function renderGrid(el, products) {
    if (!el || gridHasProducts(el)) return;
    if (!products.length) {
      el.innerHTML = '<p class="shop-empty">Inga produkter i denna kategori just nu.</p>';
      observeProductGrid(el);
      return;
    }
    el.innerHTML = products.map(cardHtml).join('');
    if (window.initProductFavorites) window.initProductFavorites(el);
    el.querySelectorAll('.pcard').forEach(function (card) {
      card.classList.add('pcard-visible');
      card.style.opacity = '1';
    });
    observeProductGrid(el);
  }

  function boot() {
    if (window.__afroStorefrontReady) return;
    var hasGrid = GRIDS.some(function (g) { return document.getElementById(g.id); });
    if (!hasGrid) return;
    if (GRIDS.every(function (g) { return gridHasProducts(document.getElementById(g.id)); })) return;

    var config = window.firebaseConfig || {};
    var projectId = config.projectId || 'afrohornan';
    var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents/products';

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('Firestore request failed');
        return r.json();
      })
      .then(function (data) {
        var products = (data.documents || []).map(fromFirestore).filter(inStock);
        GRIDS.forEach(function (grid) {
          var el = document.getElementById(grid.id);
          if (!el) return;
          var cat = grid.cat || document.body.dataset.category;
          var inCat = cat ? products.filter(function (p) { return p.cat === cat; }) : products;
          renderGrid(el, inCat);
        });
      })
      .catch(function (err) {
        console.error('Product fallback failed:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.setTimeout(function () {
    if (!window.__afroStorefrontReady) boot();
  }, 2500);
})();
