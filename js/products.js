import { fetchAllProducts, subscribeAllProducts } from './firebase-db.js';
import { isFirebaseConfigured } from './firebase-auth.js';

const MAT_KEYS = ['mat', 'mat & kryddor', 'mat och kryddor', 'food', 'kryddor', 'te'];
const HAIR_KEYS = ['hår', 'har', 'hårvård', 'extensions', 'extension', 'peruk', 'wig', 'braids', 'flätor'];
const KOSMETIKA_KEYS = ['kosmetika', 'kosmet', 'hudvård', 'hud', 'skönhet'];

const CAT_LABELS = {
  har: 'Hår & Extensions',
  kosmetika: 'Hudvård',
  mat: 'Mat & Kryddor',
};

let mergedCache = null;

export function resolveCategory(raw) {
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

export function productPageUrl(firestoreId) {
  return `produkt.html?slug=${encodeURIComponent(firestoreId)}`;
}

export function extractProductImages(raw) {
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
  return fromDb;
}

function productSortKey(raw) {
  const created = raw.createdAt;
  if (created?.toMillis) return created.toMillis();
  if (created?.seconds) return created.seconds * 1000;
  if (typeof created === 'number') return created;
  return 0;
}

export function normalizeProduct(raw) {
  const firestoreId = raw.id || '';
  const slug = firestoreId;
  const images = extractProductImages(raw);
  const image = images[0] || '';
  const cat = resolveCategory(raw);

  return {
    slug,
    name: raw.title || raw.name || 'Produkt',
    brand: raw.subtitle || raw.brand || '',
    price: Number(raw.price ?? 0),
    image,
    images,
    emoji: '📦',
    url: productPageUrl(firestoreId),
    cat,
    catLabel: CAT_LABELS[cat] || '',
    badge: raw.featured ? 'Utvald' : 'Ny',
    badgeGold: !raw.featured,
    description: raw.description || '',
    inventory: Number(raw.inventory ?? NaN),
    fromFirestore: true,
    firestoreId,
    sortKey: productSortKey(raw),
  };
}

export function mergeProducts(firestoreProducts) {
  return (firestoreProducts ?? []).map((raw) => normalizeProduct(raw));
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
    mergedCache = [];
  }

  return mergedCache;
}

export function sortProductsForDisplay(products) {
  return [...products].sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));
}

export function productsForCategory(products, cat, previewOnly, previewLimit = 4) {
  const inCat = sortProductsForDisplay(products.filter((p) => p.cat === cat));
  if (!previewOnly) return inCat;
  return inCat.slice(0, previewLimit);
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
