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

  const CATALOG = [
    { slug: 'brazilian-braids', name: 'Brazilian Braids – Syntetiska flätor 60 cm', brand: 'Flätor', cat: 'har', price: 189, emoji: '💇🏾', url: '#kontakt', image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&auto=format&fit=crop&q=80', badge: 'Populär' },
    { slug: 'lace-front-wig', name: 'Lace Front Peruk – Naturlig hårlinje', brand: 'Peruk', cat: 'har', price: 1290, emoji: '✨', url: '#kontakt', image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&auto=format&fit=crop&q=80', badge: 'Nyhet', badgeGold: true },
    { slug: 'clip-in-extensions', name: 'Clip-in Extensions – 8 delar Remy 50 cm', brand: 'Extensions', cat: 'har', price: 899, emoji: '💫', url: '#kontakt', image: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400&auto=format&fit=crop&q=80' },
    { slug: 'crochet-braids', name: 'Crochet Braids – Curly Passion Twist 45 cm', brand: 'Flätor', cat: 'har', price: 249, emoji: '🌀', url: '#kontakt', image: 'https://images.unsplash.com/photo-1595476108010-b4d1f102b1a1?w=400&auto=format&fit=crop&q=80' },
    { slug: 'shea-butter', name: 'Oraffinerad Shea Butter 100% naturell 200 g', brand: 'Sheabutter', cat: 'kosmetika', price: 129, emoji: '🧴', url: 'products/shea-butter.html', image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&auto=format&fit=crop&q=80', badge: 'Populär' },
    { slug: 'svart-tval', name: 'Afrikansk Svart Tvål – Rå & Naturlig 150 g', brand: 'Tvål', cat: 'kosmetika', price: 89, emoji: '🧼', url: 'products/svart-tval.html', image: 'https://images.unsplash.com/photo-1600856209845-8b1f9a8d2f6a?w=400&auto=format&fit=crop&q=80', badge: 'Nyhet', badgeGold: true },
    { slug: 'arganolja', name: 'Marockansk Arganolja Kallpressad 100 ml', brand: 'Hårolja', cat: 'kosmetika', price: 149, emoji: '✨', url: 'products/arganolja.html', image: 'https://images.unsplash.com/photo-1608248543801-ba977fed0aeb?w=400&auto=format&fit=crop&q=80' },
    { slug: 'kokosolja', name: 'Virgin Kokosolja Hudvård & Hår 250 ml', brand: 'Ekologisk', cat: 'kosmetika', price: 99, emoji: '🥥', url: 'products/kokosolja.html', image: 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400&auto=format&fit=crop&q=80' },
    { slug: 'berbere', name: 'Berbere – Etiopisk Kryddblandning 200 g', brand: 'Kryddblandning', cat: 'mat', price: 89, emoji: '🌶️', url: 'products/berbere.html', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&auto=format&fit=crop&q=80', badge: 'Bästsäljare' },
    { slug: 'rooibos-chai', name: 'Rooibos Chai – Sydafrikanskt Te 100 g', brand: 'Te', cat: 'mat', price: 65, emoji: '🍵', url: 'products/rooibos-chai.html', image: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400&auto=format&fit=crop&q=80', badge: 'Nyhet', badgeGold: true },
    { slug: 'suya-spice', name: 'Suya Spice – Nigeriansk Grillkrydda 150 g', brand: 'Grillkrydda', cat: 'mat', price: 75, emoji: '🔥', url: 'products/suya-spice.html', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&auto=format&fit=crop&q=80' },
    { slug: 'baobab-snacks', name: 'Baobab Snacks – Superfrukt Chips 80 g', brand: 'Ekologisk', cat: 'mat', price: 55, emoji: '🌿', url: 'products/baobab-snacks.html', image: 'https://images.unsplash.com/photo-1599599810764-bcde5a160d2b?w=400&auto=format&fit=crop&q=80' },
  ];

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
      var store = inCat.filter(function (p) { return p.fromStore; });
      var catalog = inCat.filter(function (p) { return !p.fromStore; }).slice(0, 4);
      var shown = store.concat(catalog);
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
