// Static demo products removed — shop shows Firestore products from admin only.
export const PRODUCT_CATALOG = {};

export function getStoredFavoriteSlugs() {
  const slugs = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('fav-')) slugs.push(key.slice(4));
  }
  return slugs;
}

export function getFavoriteProducts() {
  return getStoredFavoriteSlugs()
    .map((slug) => PRODUCT_CATALOG[slug])
    .filter(Boolean);
}

export function getCatalogProducts() {
  return Object.values(PRODUCT_CATALOG);
}

export function getCatalogProduct(slug) {
  return PRODUCT_CATALOG[slug] || null;
}

export function removeFavorite(slug) {
  localStorage.removeItem('fav-' + slug);
  document.dispatchEvent(new CustomEvent('favorites:updated'));
}

export function isFavorite(slug) {
  if (!slug) return false;
  return Boolean(localStorage.getItem('fav-' + slug));
}

export function toggleFavorite(slug) {
  if (!slug) return false;
  if (isFavorite(slug)) {
    removeFavorite(slug);
    return false;
  }
  localStorage.setItem('fav-' + slug, '1');
  document.dispatchEvent(new CustomEvent('favorites:updated'));
  return true;
}
