/**
 * Firestore REST fallback when ES modules fail to render products.
 */
(function () {
  const GRIDS = [
    { id: 'har-grid', cat: 'har' },
    { id: 'kosmetika-grid', cat: 'kosmetika' },
    { id: 'mat-grid', cat: 'mat' },
    { id: 'category-grid', cat: document.body.dataset.category || '' },
  ];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveCat(raw) {
    const direct = raw.category || (Array.isArray(raw.categories) && raw.categories[0]);
    if (direct) {
      const key = String(direct).toLowerCase();
      if (key === 'har' || key === 'kosmetika' || key === 'mat') return key;
    }
    const cats = Array.isArray(raw.categories) ? raw.categories : [];
    const text = cats.join(' ').toLowerCase();
    if (/mat|krydd|food|te|chips|milk/.test(text)) return 'mat';
    if (/hår|har|extension|peruk|flät|hair|oil|wig/.test(text)) return 'har';
    return 'kosmetika';
  }

  function fromFirestore(doc) {
    const f = doc.fields || {};
    const str = (k) => f[k]?.stringValue || '';
    const num = (k) => Number(f[k]?.integerValue || f[k]?.doubleValue || 0);
    const images = (f.images?.arrayValue?.values || []).map((v) => v.stringValue).filter(Boolean);
    const id = doc.name.split('/').pop();
    const cat = resolveCat({
      category: str('category'),
      categories: (f.categories?.arrayValue?.values || []).map((v) => v.stringValue),
    });
    return {
      id,
      name: str('title') || 'Produkt',
      brand: str('subtitle') || '',
      cat,
      price: num('price'),
      image: images[0] || '',
      inventory: num('inventory'),
    };
  }

  function inStock(p) {
    return Number.isFinite(p.inventory) && p.inventory > 0;
  }

  function cardHtml(p) {
    const url = 'produkt.html?slug=' + encodeURIComponent(p.id);
    const inventoryAttr = Number.isFinite(p.inventory) ? ' data-inventory="' + p.inventory + '"' : '';
    const img = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="pcard-emoji" aria-hidden="true">📦</span>';
    return (
      '<div class="pcard" data-slug="' + esc(p.id) + '" data-name="' + esc(p.name) + '" data-brand="' + esc(p.brand) + '" data-price="' + p.price + '" data-image="' + esc(p.image) + '" data-url="' + esc(url) + '" data-emoji="📦"' + inventoryAttr + '>' +
        '<a href="' + esc(url) + '" class="pcard-link">' +
          '<div class="pcard-img">' + img + '<span class="pcard-badge gold">Ny</span></div>' +
          '<div class="pcard-body">' +
            '<div class="pcard-brand">' + esc(p.brand || 'Produkt') + '</div>' +
            '<div class="pcard-name">' + esc(p.name) + '</div>' +
            '<div class="pcard-price">' + Number(p.price).toLocaleString('sv-SE') + ' kr</div>' +
          '</div>' +
        '</a>' +
        '<div class="pcard-actions"><button type="button" class="pcard-cart">Lägg i kundvagn</button></div>' +
      '</div>'
    );
  }

  function gridHasProducts(el) {
    return el && el.querySelector('.pcard');
  }

  function renderGrid(el, products) {
    if (!el || gridHasProducts(el)) return;
    if (!products.length) {
      el.innerHTML = '<p class="shop-empty">Inga produkter i denna kategori just nu.</p>';
      return;
    }
    el.innerHTML = products.map(cardHtml).join('');
    if (window.initProductFavorites) window.initProductFavorites(el);
    el.querySelectorAll('.pcard').forEach(function (card) {
      card.classList.add('pcard-visible');
      card.style.opacity = '1';
    });
  }

  function boot() {
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
  window.setTimeout(boot, 1200);
})();
