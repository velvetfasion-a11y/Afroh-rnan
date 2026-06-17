/**
 * Fallback without ES modules — runs if module storefront fails to render products.
 */
(function () {
  const CAT_LABELS = { har: 'Hår', kosmetika: 'Kosmetika', mat: 'Mat' };
  const GRIDS = [
    { id: 'har-grid', cat: 'har' },
    { id: 'kosmetika-grid', cat: 'kosmetika' },
    { id: 'mat-grid', cat: 'mat' },
  ];

  const CATALOG = [];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cardHtml(p) {
    const img = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" referrerpolicy="no-referrer">'
      : '<span class="pcard-emoji" aria-hidden="true">' + esc(p.emoji || '📦') + '</span>';
    const badge = p.badge
      ? '<span class="pcard-badge' + (p.badgeGold ? ' gold' : '') + '">' + esc(p.badge) + '</span>'
      : '';
    return (
      '<div class="pcard" data-slug="' + esc(p.slug) + '" data-name="' + esc(p.name) + '" data-brand="' + esc(p.brand || '') + '" data-price="' + p.price + '" data-image="' + esc(p.image || '') + '" data-url="' + esc(p.url) + '" data-emoji="' + esc(p.emoji || '📦') + '">' +
        '<a href="' + esc(p.url) + '" class="pcard-link">' +
          '<div class="pcard-img">' + img + badge + '</div>' +
          '<div class="pcard-body">' +
            '<div class="pcard-brand">' + esc(p.brand || CAT_LABELS[p.cat] || 'Produkt') + '</div>' +
            '<div class="pcard-name">' + esc(p.name) + '</div>' +
            '<div class="pcard-price">' + Number(p.price).toLocaleString('sv-SE') + ' kr</div>' +
          '</div>' +
        '</a>' +
        '<div class="pcard-actions"><button type="button" class="pcard-cart">Lägg i kundvagn</button></div>' +
      '</div>'
    );
  }

  function resolveCat(raw) {
    const cats = Array.isArray(raw.categories) ? raw.categories : [];
    const text = cats.join(' ').toLowerCase();
    if (/mat|krydd|food|te/.test(text)) return 'mat';
    if (/hår|har|extension|peruk|flät/.test(text)) return 'har';
    return 'kosmetika';
  }

  function fromFirestore(doc) {
    const f = doc.fields || {};
    const str = (k) => f[k]?.stringValue || '';
    const num = (k) => Number(f[k]?.integerValue || f[k]?.doubleValue || 0);
    const images = (f.images?.arrayValue?.values || []).map((v) => v.stringValue).filter(Boolean);
    const slug = str('sku') || doc.name.split('/').pop();
    return {
      slug,
      name: str('title') || 'Produkt',
      brand: str('subtitle') || '',
      cat: resolveCat({ categories: (f.categories?.arrayValue?.values || []).map((v) => v.stringValue) }),
      price: num('price'),
      image: images[0] || '',
      emoji: '📦',
      url: 'produkt.html?slug=' + encodeURIComponent(slug),
      badge: 'Ny',
      badgeGold: true,
      fromStore: true,
    };
  }

  function renderAll(products) {
    GRIDS.forEach(function (grid) {
      var el = document.getElementById(grid.id);
      if (!el || el.children.length) return;
      var inCat = products.filter(function (p) { return p.cat === grid.cat; });
      var shown = inCat;
      if (!shown.length) {
        el.innerHTML = '<p class="shop-empty">Inga produkter i denna kategori just nu.</p>';
        return;
      }
      el.innerHTML = shown.map(cardHtml).join('');
      if (window.initProductFavorites) window.initProductFavorites(el);
    });
    var err = document.getElementById('page-error');
    if (err) err.remove();
  }

  function boot() {
    var grid = document.getElementById('har-grid');
    if (!grid || grid.children.length) return;

    var products = CATALOG.slice();
    renderAll(products);

    fetch('https://firestore.googleapis.com/v1/projects/afrohornan/databases/(default)/documents/products')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var docs = (data.documents || []).map(fromFirestore);
        docs.forEach(function (p) {
          var i = products.findIndex(function (x) { return x.slug === p.slug; });
          if (i >= 0) products[i] = p;
          else products.push(p);
        });
        GRIDS.forEach(function (g) {
          var el = document.getElementById(g.id);
          if (el) el.innerHTML = '';
        });
        renderAll(products);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1500); });
  } else {
    setTimeout(boot, 1500);
  }
})();
