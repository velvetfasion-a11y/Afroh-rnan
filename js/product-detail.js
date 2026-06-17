import { subscribeMergedProducts, getProductBySlug } from './products.js';

function formatKr(n) {
  return n.toLocaleString('sv-SE') + ' kr';
}

function readSlug() {
  const fromBody = document.body.dataset.productSlug;
  if (fromBody) return fromBody;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('slug');
  if (fromQuery) return fromQuery;

  const dataEl = document.getElementById('product-data');
  if (dataEl) {
    try {
      const data = JSON.parse(dataEl.textContent);
      if (data?.slug) return data.slug;
    } catch {
      /* ignore */
    }
  }

  const file = window.location.pathname.split('/').pop() || '';
  if (file.endsWith('.html') && file !== 'produkt.html') {
    return file.replace('.html', '');
  }

  return '';
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el && text != null) el.textContent = text;
}

function renderProductThumbs(images, alt) {
  let wrap = document.getElementById('product-thumbs');
  if (!images || images.length <= 1) {
    if (wrap) wrap.remove();
    return;
  }

  if (!wrap) {
    const gallery = document.querySelector('.product-gallery');
    if (!gallery) return;
    wrap = document.createElement('div');
    wrap.id = 'product-thumbs';
    wrap.className = 'product-thumbs';
    gallery.appendChild(wrap);
  }

  const mainImg = document.querySelector('.product-gallery-img img');
  wrap.innerHTML = images
    .map(
      (src, index) =>
        `<button type="button" class="product-thumb${index === 0 ? ' active' : ''}" data-src="${src.replace(/"/g, '&quot;')}" aria-label="Visa bild ${index + 1}">
          <img src="${src.replace(/"/g, '&quot;')}" alt="${alt.replace(/"/g, '&quot;')} – bild ${index + 1}" loading="lazy" referrerpolicy="no-referrer">
        </button>`,
    )
    .join('');

  wrap.querySelectorAll('.product-thumb').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!mainImg) return;
      mainImg.src = btn.dataset.src;
      wrap.querySelectorAll('.product-thumb').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function applyProduct(product) {
  if (!product) return;

  document.title = `${product.name} – Afrohörnan`;

  setText('.product-brand', product.brand);
  setText('.product-details h1', product.name);
  setText('.product-price', formatKr(product.price));
  setText('.breadcrumb span:last-child', product.name);

  const img = document.querySelector('.product-gallery-img img');
  const galleryImages = Array.isArray(product.images) && product.images.length ? product.images : product.image ? [product.image] : [];

  if (img && galleryImages.length) {
    img.hidden = false;
    img.referrerPolicy = 'no-referrer';
    img.src = galleryImages[0];
    img.alt = product.name;
  }

  renderProductThumbs(galleryImages, product.name);

  const badge = document.querySelector('.product-badge');
  if (badge) {
    if (product.badge) {
      badge.textContent = product.badge;
      badge.classList.toggle('gold', Boolean(product.badgeGold));
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  const dataEl = document.getElementById('product-data');
  if (dataEl) {
    dataEl.textContent = JSON.stringify({
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      price: product.price,
      image: product.image,
      images: product.images || [],
      url: product.url,
    });
  }

  wireBuyButton(product);
}

function wireBuyButton(product) {
  const buyBtn = document.getElementById('buyBtn');
  if (!buyBtn || buyBtn.dataset.wired === '1') return;
  buyBtn.dataset.wired = '1';

  let qty = 1;
  const qtyEl = document.getElementById('qty');
  const totalEl = document.getElementById('total');
  let price = Number(product.price) || 0;
  let maxStock = Number.isFinite(Number(product.inventory)) && Number(product.inventory) > 0
    ? Number(product.inventory)
    : Infinity;

  function updateTotal() {
    if (qtyEl) qtyEl.textContent = qty;
    if (totalEl) totalEl.textContent = formatKr(qty * price) + ' totalt';
  }

  function refreshPrice(nextProduct) {
    price = Number(nextProduct?.price) || 0;
    const inv = Number(nextProduct?.inventory);
    maxStock = Number.isFinite(inv) && inv > 0 ? inv : Infinity;
    qty = Math.min(qty, maxStock);
    updateTotal();
  }

  buyBtn._refreshPrice = refreshPrice;
  updateTotal();

  document.getElementById('qtyMinus')?.addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    updateTotal();
  });

  document.getElementById('qtyPlus')?.addEventListener('click', () => {
    qty = Math.min(maxStock, qty + 1);
    updateTotal();
  });

  buyBtn.addEventListener('click', () => {
    const payload = {
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      price,
      image: product.image,
      url: product.url,
      inventory: maxStock !== Infinity ? maxStock : undefined,
      qty,
    };
    window.AfroCart?.addItem(payload);
    window.AfroCart?.showToast?.();
    buyBtn.textContent = '✓ Lagt till';
    buyBtn.classList.add('added');
    window.setTimeout(() => {
      buyBtn.textContent = 'Köp nu';
      buyBtn.classList.remove('added');
    }, 1800);
  });
}

const slug = readSlug();
if (!slug) {
  document.querySelector('.product-main')?.insertAdjacentHTML(
    'afterbegin',
    '<p class="product-sync-error">Produkten kunde inte hittas.</p>',
  );
} else {
  subscribeMergedProducts((products) => {
    const product = getProductBySlug(products, slug);
    if (!product) {
      const main = document.querySelector('.product-main');
      if (main && !main.querySelector('.product-sync-error')) {
        main.insertAdjacentHTML(
          'afterbegin',
          '<p class="product-sync-error">Produkten hittades inte i sortimentet.</p>',
        );
      }
      return;
    }

    applyProduct(product);
    document.getElementById('buyBtn')?._refreshPrice?.(product);
  });
}
