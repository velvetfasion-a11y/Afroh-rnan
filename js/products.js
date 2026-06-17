import { fetchAllProducts, subscribeAllProducts } from './firebase-db.js';
import { getCatalogProducts, getCatalogProduct, PRODUCT_CATALOG } from './product-catalog.js';
import { isFirebaseConfigured } from './firebase-auth.js';

const MAT_KEYS = ['mat', 'mat & kryddor', 'mat och kryddor', 'food', 'kryddor', 'te'];
const HAIR_KEYS = ['hår', 'har', 'hårvård', 'extensions', 'extension', 'peruk', 'wig', 'braids', 'flätor'];
const KOSMETIKA_KEYS = ['kosmetika', 'kosmet', 'hudvård', 'hud', 'skönhet'];

const STATIC_PRODUCT_SLUGS = new Set(
  Object.values(PRODUCT_CATALOG)
    .map((p) => p.url)
    .filter((url) => url?.startsWith('products/'))
    .map((url) => url.replace('products/', '').replace('.html', '')),
);

const CAT_LABELS = {
  har: 'Hår & Extensions',
  kosmetika: 'Hudvård',
  mat: 'Mat & Kryddor',
};

let mergedCache = null;

export function slugFromSku(sku) {
  if (!sku) return '';
  const key = sku.trim().toLowerCase();
  if (PRODUCT_CATALOG[key]) return key;
  return '';
}

export function resolveCategory(raw, catalogItem) {
  if (catalogItem?.cat) return catalogItem.cat;

  const direct = raw.category || (Array.isArray(raw.categories) && raw.categories[0]);
  if (direct) {
    const key = String(direct).toLowerCase();
    if (key === 'har' || key === 'kosmetika' || key === 'mat') return key;
  }

  const cats = Array.isArray(raw.categories) ? raw.categories : raw.category ? [raw.category] : [];
  const normalized = cats.map((c) => String(c).toLowerCase());
  if (normalized.some((c) => MAT_KEYS.some((k) => c.includes(k)))) return 'mat';
  if (normalized.some((c) => HAIR_KEYS.some((k) => c.includes(k)))) return 'har';
  if (normalized.some((c) => KOSMETIKA_KEYS.some((k) => c.includes(k)))) return 'kosmetika';
  return 'kosmetika';
}

export function productPageUrl(slug, catalogItem) {
  if (catalogItem?.url) return catalogItem.url;
  if (STATIC_PRODUCT_SLUGS.has(slug)) return `products/${slug}.html`;
  return `produkt.html?slug=${encodeURIComponent(slug)}`;
}

export function extractProductImages(raw, catalogItem) {
  const fromDb = [];
  if (Array.isArray(raw?.images)) {
    raw.images.forEach((item) => {
      if (typeof item === 'string' && item.trim()) fromDb.push(item.trim());
    });
  }
  if (!fromDb.length && typeof raw?.image === 'string' && raw.image.trim()) {
    fromDb.push(raw.image.trim());
  }
  if (!fromDb.length && typeof raw?.imageUrl === 'string' && raw.imageUrl.trim()) {
    fromDb.push(raw.imageUrl.trim());
  }
  if (fromDb.length) return fromDb;
  if (catalogItem?.image) return [catalogItem.image];
  return [];
}

function productSortKey(raw) {
  const created = raw.createdAt;
  if (created?.toMillis) return created.toMillis();
  if (created?.seconds) return created.seconds * 1000;
  if (typeof created === 'number') return created;
  return 0;
}

export function normalizeProduct(raw, catalogItem, options = {}) {
  const slug = catalogItem?.slug || slugFromSku(raw.sku) || raw.id;
  const images = extractProductImages(raw, catalogItem);
  const image = images[0] || '';
  const cat = resolveCategory(raw, catalogItem);
  const fromFirestore = Boolean(options.fromFirestore);

  return {
    slug,
    name: raw.title || raw.name || catalogItem?.name || 'Produkt',
    brand: raw.subtitle || raw.brand || catalogItem?.brand || '',
    price: Number(raw.price ?? catalogItem?.price ?? 0),
    image,
    images,
    emoji: catalogItem?.emoji || '📦',
    url: productPageUrl(slug, catalogItem),
    cat,
    catLabel: catalogItem?.catLabel || CAT_LABELS[cat] || '',
    badge: catalogItem?.badge || (raw.featured ? 'Utvald' : fromFirestore ? 'Ny' : ''),
    badgeGold: Boolean(catalogItem?.badgeGold || (fromFirestore && !catalogItem?.badge)),
    description: raw.description || catalogItem?.description || '',
    inventory: Number(raw.inventory ?? catalogItem?.inventory ?? NaN),
    fromFirestore,
    firestoreId: raw.id || '',
    sortKey: productSortKey(raw),
  };
}

export function mergeProducts(firestoreProducts) {
  const merged = new Map();

  getCatalogProducts().forEach((item) => {
    merged.set(item.slug, normalizeProduct({}, item));
  });

  firestoreProducts.forEach((raw) => {
    const catalogItem =
      getCatalogProduct(raw.id) ||
      getCatalogProduct(slugFromSku(raw.sku)) ||
      Object.values(PRODUCT_CATALOG).find((p) => p.name === raw.title);
    const slug = catalogItem?.slug || slugFromSku(raw.sku) || raw.id;
    const hasOwnImages = extractProductImages(raw, null).length > 0;
    merged.set(slug, normalizeProduct(raw, catalogItem, {
      fromFirestore: !catalogItem || hasOwnImages,
    }));
  });

  return [...merged.values()];
}

export function getProductBySlug(products, slug) {
  return products.find((p) => p.slug === slug || p.firestoreId === slug) || null;
}

export async function getMergedProducts() {
  if (mergedCache) return mergedCache;

  try {
    const fromDb = await fetchAllProducts();
    mergedCache = mergeProducts(fromDb);
  } catch {
    mergedCache = mergeProducts([]);
  }

  return mergedCache;
}

export function sortProductsForDisplay(products) {
  return [...products].sort((a, b) => {
    if (a.fromFirestore !== b.fromFirestore) return a.fromFirestore ? -1 : 1;
    return (b.sortKey || 0) - (a.sortKey || 0);
  });
}

export function productsForCategory(products, cat, previewOnly, previewLimit = 4) {
  const inCat = sortProductsForDisplay(products.filter((p) => p.cat === cat));
  if (!previewOnly) return inCat;

  const fromStore = inCat.filter((p) => p.fromFirestore);
  const fromCatalog = inCat.filter((p) => !p.fromFirestore).slice(0, previewLimit);
  return [...fromStore, ...fromCatalog];
}

/**
 * Live-sync products from Firestore. Updates propagate to all open pages.
 * Returns an unsubscribe function.
 */
export function subscribeMergedProducts(onUpdate) {
  const publish = (firestoreProducts) => {
    mergedCache = mergeProducts(firestoreProducts ?? []);
    onUpdate(mergedCache);
  };

  // Show catalog products immediately — do not wait for Firestore.
  publish([]);

  if (!isFirebaseConfigured()) {
    return () => {};
  }

  let active = true;
  let unsubscribe = () => {};

  fetchAllProducts()
    .then((products) => {
      if (active) publish(products);
    })
    .catch(() => {
      if (active) publish([]);
    });

  try {
    unsubscribe = subscribeAllProducts(
      (products) => publish(products),
      () => {
        fetchAllProducts()
          .then((products) => {
            if (active) publish(products);
          })
          .catch(() => {
            if (active) publish([]);
          });
      },
    );
  } catch (err) {
    console.error('Kunde inte prenumerera på produkter:', err);
  }

  return () => {
    active = false;
    unsubscribe();
  };
}
