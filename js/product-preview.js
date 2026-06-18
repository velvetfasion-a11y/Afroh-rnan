const PREFIX = 'afroProductPreview:';

export function saveProductPreview(product) {
  if (!product?.slug) return;
  const preview = {
    slug: product.slug,
    name: product.name,
    brand: product.brand || '',
    price: product.price,
    image: product.image || product.images?.[0] || '',
    hasMultipleColors: Boolean(product.hasMultipleColors),
  };
  try {
    sessionStorage.setItem(PREFIX + preview.slug, JSON.stringify(preview));
  } catch {
    /* ignore */
  }
  window.AfroProductPreview?.save?.(preview);
}

export function loadProductPreview(slug) {
  try {
    const raw = sessionStorage.getItem(PREFIX + slug);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
