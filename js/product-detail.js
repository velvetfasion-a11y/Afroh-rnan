import { fetchProductForSlug } from './products.js';
import { saveProductPreview } from './product-preview.js?v=12';
import { isFavorite, toggleFavorite } from './product-catalog.js';

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

function setById(id, text) {
  const el = document.getElementById(id);
  if (el && text != null) el.textContent = text;
}

function markPageReady() {
  document.body.classList.remove('product-page-loading');
  document.body.classList.add('product-page-ready');

  const variantSkeleton = document.getElementById('productVariantSkeleton');
  if (variantSkeleton) variantSkeleton.hidden = true;

  ['qtyMinus', 'qtyPlus', 'buyBtn'].forEach((id) => {
    document.getElementById(id)?.removeAttribute('disabled');
  });
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve();
      return;
    }
    const probe = new Image();
    probe.referrerPolicy = 'no-referrer';
    probe.onload = () => resolve();
    probe.onerror = () => resolve();
    probe.src = src;
  });
}

function buildProductDescription(product, color) {
  if (product.description?.trim()) return product.description.trim();

  const parts = [];
  if (product.brand && product.name) {
    parts.push(`${product.name} från ${product.brand}.`);
  } else if (product.name) {
    parts.push(`${product.name}.`);
  }
  if (product.catLabel) parts.push(product.catLabel + '.');
  if (color?.name) {
    parts.push(`Variant: ${color.name}.`);
  } else if (product.hasMultipleColors) {
    parts.push('Flera varianter – välj nedan.');
  }
  if (Number(product.price) > 0) {
    parts.push(`Pris ${formatKr(product.price)}.`);
  }
  return parts.join(' ') || 'Produkt från Afrohörnan.';
}

function updateProductDescription(product, color) {
  setById('productDesc', buildProductDescription(product, color));
}

function resolveVariantImage(color, product) {
  if (color?.image) return color.image;
  if (product?.images?.length) return product.images[0];
  if (product?.image) return product.image;
  return '';
}

function escapeAttr(value) {
  return String(value).replace(/"/g, '&quot;');
}

function getProductView(product, color) {
  if (!color) return product;

  const gallery = color.image
    ? [color.image, ...(product.images || []).filter((src) => src !== color.image)]
    : product.images || [];

  return {
    ...product,
    price: color.price != null ? color.price : product.price,
    image: gallery[0] || product.image,
    images: gallery,
    inventory: color.inventory,
    selectedColor: color,
  };
}

let activeProduct = null;
let activeColor = null;

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

async function updateGallery(view) {
  const img = document.getElementById('productMainImage') || document.querySelector('.product-gallery-img img');
  const galleryImages = Array.isArray(view.images) && view.images.length ? view.images : view.image ? [view.image] : [];
  const src = galleryImages[0];

  if (img && src) {
    await preloadImage(src);
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.src = src;
    img.alt = view.name;
    img.hidden = false;
    img.classList.add('is-visible');
  }

  renderProductThumbs(galleryImages, view.name);
}

function selectColor(product, colorId) {
  const color = (product.colors || []).find((entry) => entry.id === colorId);
  if (!color || color.inventory <= 0) return;

  activeColor = color;
  const url = new URL(window.location.href);
  url.searchParams.set('color', color.id);
  window.history.replaceState(null, '', url);

  renderColorPicker(product);
  const view = getProductView(product, activeColor);
  setById('productPrice', formatKr(view.price));
  setById('productColorSelected', color.name);
  void updateGallery(view);
  updateProductDescription(product, color);
  document.getElementById('buyBtn')?._refreshPrice?.(view);
}

function renderColorPicker(product) {
  const colors = product.colors || [];
  const wrap = document.getElementById('productColors');
  const swatches = document.getElementById('productColorSwatches');
  const hint = document.getElementById('productColorsHint');
  const selectedLabel = document.getElementById('productColorSelected');

  if (!colors.length || !wrap || !swatches) {
    if (wrap) wrap.hidden = true;
    if (hint) hint.hidden = true;
    activeColor = null;
    return;
  }

  const variantSkeleton = document.getElementById('productVariantSkeleton');
  if (variantSkeleton) variantSkeleton.hidden = true;

  wrap.hidden = false;
  if (hint) hint.hidden = colors.length < 2;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('color');
  const inStock = colors.filter((color) => color.inventory > 0);
  activeColor =
    inStock.find((color) => color.id === fromUrl) ||
    inStock.find((color) => color.id === activeColor?.id) ||
    inStock[0] ||
    colors[0];

  swatches.innerHTML = colors
    .map((color) => {
      const out = color.inventory <= 0;
      const active = color.id === activeColor?.id;
      const imageUrl = resolveVariantImage(color, product);
      const thumb = imageUrl
        ? `<img class="product-color-swatch-img" src="${escapeAttr(imageUrl)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer">`
        : `<span class="product-color-swatch-fallback">${escapeAttr(color.name.charAt(0) || '?')}</span>`;
      return `<button type="button" class="product-color-swatch${active ? ' active' : ''}${out ? ' out-of-stock' : ''}"
        role="radio" aria-checked="${active}" aria-label="${escapeAttr(color.name)}${out ? ' – slut i lager' : ''}"
        data-color-id="${color.id}"${out ? ' disabled' : ''}>
        <span class="product-color-swatch-inner">${thumb}</span>
      </button>`;
    })
    .join('');

  swatches.querySelectorAll('.product-color-swatch').forEach((btn) => {
    btn.addEventListener('click', () => selectColor(product, btn.dataset.colorId));
  });

  if (selectedLabel) selectedLabel.textContent = activeColor?.name || '';
}

function applyProduct(product) {
  if (!product) return;

  activeProduct = product;
  saveProductPreview(product);
  document.title = `${product.name} – Afrohörnan`;

  setById('productBrand', product.brand);
  setById('productTitle', product.name);
  setById('productBreadcrumbName', product.name);

  renderColorPicker(product);
  const view = getProductView(product, activeColor);
  setById('productPrice', formatKr(view.price));
  void updateGallery(view);
  updateProductDescription(product, activeColor);

  const badge = document.getElementById('productBadge') || document.querySelector('.product-badge');
  if (badge) {
    if (product.badge) {
      badge.textContent = product.badge;
      badge.classList.toggle('gold', Boolean(product.badgeGold));
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  wireFavoriteButton(product);
  wireBuyButton(product);
  document.getElementById('buyBtn')?._refreshPrice?.(view);
  markPageReady();
}

function wireFavoriteButton(product) {
  const btn = document.getElementById('productFavBtn');
  if (!btn || !product?.slug) return;

  btn.hidden = false;

  function syncState() {
    const saved = isFavorite(product.slug);
    btn.classList.toggle('active', saved);
    btn.setAttribute('aria-label', saved ? 'Ta bort från sparade' : 'Spara favorit');
  }

  syncState();

  if (btn.dataset.wired === '1') return;
  btn.dataset.wired = '1';

  btn.addEventListener('click', () => {
    toggleFavorite(product.slug);
    syncState();
  });
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

  function refreshPrice(nextView) {
    price = Number(nextView?.price) || 0;
    const inv = Number(nextView?.inventory);
    maxStock = Number.isFinite(inv) && inv > 0 ? inv : Infinity;
    qty = Math.min(qty, maxStock);
    updateTotal();

    const outOfStock =
      (Number.isFinite(maxStock) && maxStock <= 0) ||
      (nextView?.selectedColor && nextView.selectedColor.inventory <= 0);

    if (outOfStock) {
      buyBtn.disabled = true;
      buyBtn.textContent = 'Slut i lager';
    } else {
      buyBtn.disabled = false;
      if (buyBtn.textContent === 'Slut i lager') buyBtn.textContent = 'Köp nu';
    }
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
    const current = activeProduct || product;
    const color = activeColor;
    const view = getProductView(current, color);
    const colorLabel = color?.name ? ` – ${color.name}` : '';

    const payload = {
      slug: current.slug,
      colorId: color?.id,
      colorName: color?.name,
      name: current.name + colorLabel,
      brand: current.brand,
      price,
      image: view.image,
      url: color?.id ? `${current.url}&color=${encodeURIComponent(color.id)}` : current.url,
      inventory: maxStock !== Infinity ? maxStock : undefined,
      productType: current.productType === 'course' ? 'course' : 'product',
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
  let productShown = false;

  function showProduct(product) {
    if (!product) return;
    productShown = true;
    applyProduct(product);
  }

  fetchProductForSlug(slug).then((product) => {
    if (product) showProduct(product);
    else showNotFound();
  }).catch(() => {
    showNotFound();
  });
}

function showNotFound() {
  markPageReady();
  const main = document.querySelector('.product-main');
  if (main && !main.querySelector('.product-sync-error')) {
    main.insertAdjacentHTML(
      'afterbegin',
      '<p class="product-sync-error">Produkten hittades inte i sortimentet.</p>',
    );
  }
}
