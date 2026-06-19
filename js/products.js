import { fetchAllProducts, subscribeAllProducts, getProduct } from './firebase-db.js';
import { isFirebaseConfigured } from './firebase-auth.js';

const MAT_KEYS = ['mat', 'mat & kryddor', 'mat och kryddor', 'food', 'kryddor', 'te'];
const HAIR_KEYS = ['hår', 'har', 'hårvård', 'extensions', 'extension', 'peruk', 'wig', 'braids', 'flätor'];
const KOSMETIKA_KEYS = ['kosmetika', 'kosmet', 'hudvård', 'hud', 'skönhet'];
const ACCESSOARER_KEYS = ['accessoar', 'accessoarer', 'smycken', 'jewelry', 'jewellery', 'kläder', 'clothing', 'mode', 'väska', 'väskor'];

const CAT_LABELS = {
  har: 'Hårvård',
  kosmetika: 'Skönhet',
  mat: 'Mat',
  accessoarer: 'Accessoarer',
};

let mergedCache = null;
let sharedUnsubscribe = null;
const sharedListeners = new Set();

function notifyProductListeners() {
  const list = mergedCache || [];
  sharedListeners.forEach((listener) => {
    try {
      listener(list);
    } catch (err) {
      console.error('Product listener failed:', err);
    }
  });
}

function ensureSharedProductSubscription() {
  if (sharedUnsubscribe || !isFirebaseConfigured()) return;

  sharedUnsubscribe = subscribeAllProducts(
    (products) => {
      mergedCache = mergeProducts(products ?? []);
      notifyProductListeners();
    },
    (err) => {
      console.error('Firestore products subscription error:', err);
      if (mergedCache) return;
      fetchAllProducts()
        .then((products) => {
          mergedCache = mergeProducts(products ?? []);
          notifyProductListeners();
        })
        .catch(() => {
          mergedCache = [];
          notifyProductListeners();
        });
    },
  );
}

export async function fetchProductsForSlugs(slugs) {
  const unique = [...new Set((slugs || []).filter(Boolean))];
  if (!unique.length) return [];

  const results = await Promise.all(unique.map((slug) => fetchProductForSlug(slug)));
  return results.filter(Boolean);
}

export function resolveCategory(raw) {
  const direct = raw.category || (Array.isArray(raw.categories) && raw.categories[0]);
  if (direct) {
    const key = String(direct).toLowerCase();
    if (key === 'har' || key === 'kosmetika' || key === 'mat' || key === 'accessoarer') return key;
  }

  const cats = Array.isArray(raw.categories) ? raw.categories : raw.category ? [raw.category] : [];
  const normalized = cats.map((c) => String(c).toLowerCase());
  if (normalized.some((c) => MAT_KEYS.some((k) => c.includes(k)))) return 'mat';
  if (normalized.some((c) => HAIR_KEYS.some((k) => c.includes(k)))) return 'har';
  if (normalized.some((c) => ACCESSOARER_KEYS.some((k) => c.includes(k)))) return 'accessoarer';
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

export const STORE_IDS = ['fittja', 'marsta'];

export const STORES = {
  fittja: { id: 'fittja', label: 'Fittja' },
  marsta: { id: 'marsta', label: 'Märsta' },
};

export function normalizeStock(raw, fallbackInventory = 0) {
  if (raw?.stock && typeof raw.stock === 'object') {
    return {
      fittja: Math.max(0, Number(raw.stock.fittja) || 0),
      marsta: Math.max(0, Number(raw.stock.marsta) || 0),
    };
  }
  const inv = Math.max(0, Number(fallbackInventory) || 0);
  return { fittja: inv, marsta: inv };
}

export function totalFromStock(stock) {
  return (stock?.fittja || 0) + (stock?.marsta || 0);
}

export function getItemStoreStock(product, colorId, storeId) {
  if (!product || !storeId) return 0;

  if (colorId && Array.isArray(product.colors) && product.colors.length) {
    const color = product.colors.find((entry) => entry.id === colorId);
    if (!color) return 0;
    return Number(color.stock?.[storeId]) || 0;
  }

  return Number(product.stock?.[storeId]) || 0;
}

export function slugifyColorId(name, index = 0) {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `farg-${index + 1}`;
}

export function normalizeColors(raw) {
  const list = Array.isArray(raw?.colors) ? raw.colors : [];
  const usedIds = new Set();

  return list
    .map((entry, index) => {
      const name = String(entry?.name || entry?.label || '').trim();
      if (!name) return null;

      let id = String(entry?.id || slugifyColorId(name, index)).trim();
      while (usedIds.has(id)) id = `${id}-${index}`;
      usedIds.add(id);

      const price = entry?.price != null && entry?.price !== '' ? Number(entry.price) : null;
      const stock = normalizeStock(entry, Number(entry?.inventory ?? 0));
      const inventory = totalFromStock(stock);

      return {
        id,
        name,
        hex: String(entry?.hex || entry?.color || '').trim(),
        sku: String(entry?.sku || '').trim(),
        price: Number.isFinite(price) ? price : null,
        inventory,
        stock,
        image: String(entry?.image || '').trim(),
      };
    })
    .filter(Boolean);
}

export function isProductInStock(raw) {
  const colors = normalizeColors(raw);
  if (colors.length) return colors.some((c) => c.inventory > 0);

  const stock = normalizeStock(raw, Number(raw?.inventory));
  return totalFromStock(stock) > 0;
}

function pickDisplayColor(colors) {
  return colors.find((c) => c.inventory > 0) || colors[0] || null;
}

export function normalizeProduct(raw) {
  const firestoreId = raw.id || '';
  const slug = firestoreId;
  const baseImages = extractProductImages(raw);
  const colors = normalizeColors(raw);
  const displayColor = colors.length ? pickDisplayColor(colors) : null;
  const images = displayColor?.image
    ? [displayColor.image, ...baseImages.filter((src) => src !== displayColor.image)]
    : baseImages;
  const image = images[0] || '';
  const cat = resolveCategory(raw);
  const basePrice = Number(raw.price ?? 0);
  const inStockColors = colors.filter((c) => c.inventory > 0);
  const priceFromColors = inStockColors.length
    ? Math.min(...inStockColors.map((c) => (c.price != null ? c.price : basePrice)))
    : basePrice;
  const inventoryFromColors = colors.length
    ? colors.reduce((sum, c) => sum + Math.max(0, c.inventory), 0)
    : totalFromStock(normalizeStock(raw, Number(raw.inventory ?? 0)));
  const stock = colors.length
    ? {
        fittja: colors.reduce((sum, c) => sum + (c.stock?.fittja || 0), 0),
        marsta: colors.reduce((sum, c) => sum + (c.stock?.marsta || 0), 0),
      }
    : normalizeStock(raw, Number(raw.inventory ?? 0));

  return {
    slug,
    name: raw.title || raw.name || 'Produkt',
    brand: raw.subtitle || raw.brand || '',
    price: colors.length ? priceFromColors : basePrice,
    image,
    images,
    colors,
    stock,
    hasMultipleColors: colors.length > 1,
    emoji: '📦',
    url: productPageUrl(firestoreId),
    cat,
    catLabel: CAT_LABELS[cat] || '',
    badge: raw.featured ? 'Utvald' : 'Ny',
    badgeGold: !raw.featured,
    description: raw.description || '',
    inventory: inventoryFromColors,
    productType: raw.productType === 'course' ? 'course' : 'product',
    fromFirestore: true,
    firestoreId,
    sortKey: productSortKey(raw),
  };
}

export function mergeProducts(firestoreProducts) {
  return (firestoreProducts ?? [])
    .filter((raw) => isProductInStock(raw))
    .map((raw) => normalizeProduct(raw));
}

export function getProductBySlug(products, slug) {
  return products.find((p) => p.slug === slug || p.firestoreId === slug) || null;
}

function rawFromRestDocument(doc) {
  const f = doc.fields || {};
  const str = (key) => f[key]?.stringValue || '';
  const num = (key) => Number(f[key]?.integerValue || f[key]?.doubleValue || 0);
  const images = (f.images?.arrayValue?.values || []).map((v) => v.stringValue).filter(Boolean);
  const colors = (f.colors?.arrayValue?.values || [])
    .map((entry) => {
      const map = entry.mapValue?.fields || {};
      const name = map.name?.stringValue || '';
      if (!name) return null;
      const stockMap = map.stock?.mapValue?.fields || {};
      const inventory = Number(map.inventory?.integerValue || map.inventory?.doubleValue || 0);
      return {
        id: map.id?.stringValue || '',
        name,
        hex: map.hex?.stringValue || '',
        sku: map.sku?.stringValue || '',
        price: map.price?.integerValue != null || map.price?.doubleValue != null
          ? Number(map.price?.integerValue || map.price?.doubleValue)
          : null,
        inventory,
        stock: {
          fittja: Number(stockMap.fittja?.integerValue || stockMap.fittja?.doubleValue || 0),
          marsta: Number(stockMap.marsta?.integerValue || stockMap.marsta?.doubleValue || 0),
        },
        image: map.image?.stringValue || '',
      };
    })
    .filter(Boolean);
  const stockMap = f.stock?.mapValue?.fields || {};

  return {
    id: doc.name.split('/').pop(),
    title: str('title') || str('name'),
    subtitle: str('subtitle') || str('brand'),
    description: str('description'),
    sku: str('sku'),
    barcode: str('barcode'),
    price: num('price'),
    inventory: num('inventory'),
    images,
    category: str('category'),
    categories: (f.categories?.arrayValue?.values || []).map((v) => v.stringValue),
    featured: f.featured?.booleanValue === true,
    colors,
    stock: {
      fittja: Number(stockMap.fittja?.integerValue || stockMap.fittja?.doubleValue || 0),
      marsta: Number(stockMap.marsta?.integerValue || stockMap.marsta?.doubleValue || 0),
    },
  };
}

/** Hämtar en produkt direkt (snabbare än hela sortimentet). */
export async function fetchProductForSlug(slug) {
  if (!slug) return null;

  if (mergedCache) {
    const cached = getProductBySlug(mergedCache, slug);
    if (cached) return cached;
  }

  if (isFirebaseConfigured()) {
    try {
      const raw = await getProduct(slug);
      if (raw && isProductInStock(raw)) return normalizeProduct(raw);
    } catch (err) {
      console.warn('Direkt produkthämtning misslyckades:', err);
    }
  }

  try {
    const config = window.firebaseConfig || {};
    const projectId = config.projectId || 'afrohornan';
    const url =
      'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(projectId) +
      '/databases/(default)/documents/products/' +
      encodeURIComponent(slug);
    const response = await fetch(url);
    if (!response.ok) return null;
    const doc = await response.json();
    const raw = rawFromRestDocument(doc);
    if (raw && isProductInStock(raw)) return normalizeProduct(raw);
  } catch (err) {
    console.warn('REST-produkthämtning misslyckades:', err);
  }

  return null;
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

export function productsForCategory(products, cat) {
  return sortProductsForDisplay(products.filter((p) => p.cat === cat));
}

/**
 * Live-sync products from Firestore. One shared listener for the whole site.
 * Returns an unsubscribe function.
 */
export function subscribeMergedProducts(onUpdate) {
  if (mergedCache) onUpdate(mergedCache);

  if (!isFirebaseConfigured()) {
    onUpdate([]);
    return () => {};
  }

  sharedListeners.add(onUpdate);
  ensureSharedProductSubscription();

  return () => {
    sharedListeners.delete(onUpdate);
    if (!sharedListeners.size && sharedUnsubscribe) {
      sharedUnsubscribe();
      sharedUnsubscribe = null;
    }
  };
}
