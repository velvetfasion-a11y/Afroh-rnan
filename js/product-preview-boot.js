(function () {
  var PREFIX = 'afroProductPreview:';

  function formatKr(n) {
    return Number(n).toLocaleString('sv-SE') + ' kr';
  }

  function paint(p) {
    if (!p) return false;

    var brand = document.getElementById('productBrand');
    var title = document.getElementById('productTitle');
    var price = document.getElementById('productPrice');
    var crumb = document.getElementById('productBreadcrumbName');
    var total = document.getElementById('total');
    var img = document.getElementById('productMainImage');
    var variantSkeleton = document.getElementById('productVariantSkeleton');

    if (brand && p.brand) brand.textContent = p.brand;
    if (title && p.name) {
      title.textContent = p.name;
      document.title = p.name + ' – Afrohörnan';
    }
    if (price && p.price != null) price.textContent = formatKr(p.price);
    if (crumb && p.name) crumb.textContent = p.name;
    if (total && p.price != null) total.textContent = formatKr(p.price) + ' totalt';

    if (p.hasMultipleColors && variantSkeleton) {
      variantSkeleton.hidden = false;
    }

    if (p.image && img) {
      var preload = document.createElement('link');
      preload.rel = 'preload';
      preload.as = 'image';
      preload.href = p.image;
      document.head.appendChild(preload);

      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.src = p.image;
      img.alt = p.name || 'Produkt';
      img.hidden = false;
      img.classList.add('is-visible');
    }

    document.body.classList.add('product-has-preview');
    return true;
  }

  window.AfroProductPreview = {
    prefix: PREFIX,
    paint: paint,
    load: function (slug) {
      try {
        var raw = sessionStorage.getItem(PREFIX + slug);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save: function (preview) {
      if (!preview?.slug) return;
      try {
        sessionStorage.setItem(PREFIX + preview.slug, JSON.stringify(preview));
      } catch {
        /* quota / private mode */
      }
    },
  };

  var slug = new URLSearchParams(location.search).get('slug');
  if (slug) {
    document.body.dataset.productSlug = slug;
    document.body.classList.add('product-page-loading');
    paint(window.AfroProductPreview.load(slug));
  }
})();
