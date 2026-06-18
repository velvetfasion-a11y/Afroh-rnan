(function () {
  const STORES = {
    fittja: { id: 'fittja', label: 'Fittja' },
    marsta: { id: 'marsta', label: 'Märsta' },
  };

  function normalizeStock(raw, fallbackInventory) {
    if (raw?.stock && typeof raw.stock === 'object') {
      return {
        fittja: Math.max(0, Number(raw.stock.fittja) || 0),
        marsta: Math.max(0, Number(raw.stock.marsta) || 0),
      };
    }
    const inv = Math.max(0, Number(fallbackInventory) || 0);
    return { fittja: inv, marsta: inv };
  }

  function totalStock(stock) {
    return (stock?.fittja || 0) + (stock?.marsta || 0);
  }

  function parseColorsFromFirestore(fields) {
    const values = fields.colors?.arrayValue?.values || [];
    return values
      .map((entry) => {
        const map = entry.mapValue?.fields || {};
        const name = map.name?.stringValue || '';
        if (!name) return null;
        const stockMap = map.stock?.mapValue?.fields || {};
        const inventory = Number(map.inventory?.integerValue || map.inventory?.doubleValue || 0);
        return {
          id: map.id?.stringValue || '',
          name,
          inventory,
          stock: normalizeStock(
            stockMap.fittja || stockMap.marsta
              ? {
                  stock: {
                    fittja: Number(stockMap.fittja?.integerValue || stockMap.fittja?.doubleValue || 0),
                    marsta: Number(stockMap.marsta?.integerValue || stockMap.marsta?.doubleValue || 0),
                  },
                }
              : null,
            inventory,
          ),
        };
      })
      .filter(Boolean);
  }

  function parseProductDoc(doc) {
    const f = doc.fields || {};
    const id = doc.name.split('/').pop();
    const inventory = Number(f.inventory?.integerValue || f.inventory?.doubleValue || 0);
    const stockMap = f.stock?.mapValue?.fields || {};
    const colors = parseColorsFromFirestore(f);
    const stock = normalizeStock(
      stockMap.fittja || stockMap.marsta
        ? {
            stock: {
              fittja: Number(stockMap.fittja?.integerValue || stockMap.fittja?.doubleValue || 0),
              marsta: Number(stockMap.marsta?.integerValue || stockMap.marsta?.doubleValue || 0),
            },
          }
        : null,
      inventory,
    );

    return { id, slug: id, colors, stock, inventory };
  }

  function getItemStoreStock(product, colorId, storeId) {
    if (!product || !storeId) return 0;

    if (colorId && Array.isArray(product.colors) && product.colors.length) {
      const color = product.colors.find((entry) => entry.id === colorId);
      if (!color) return 0;
      return Number(color.stock?.[storeId]) || 0;
    }

    return Number(product.stock?.[storeId]) || 0;
  }

  function checkCartAvailability(cartItems, products, storeId) {
    const unavailable = [];

    (cartItems || []).forEach((item) => {
      const product = (products || []).find((entry) => entry.slug === item.slug || entry.id === item.slug);
      if (!product) {
        unavailable.push({ ...item, available: 0, reason: 'missing' });
        return;
      }

      const available = getItemStoreStock(product, item.colorId, storeId);
      if (available < (Number(item.qty) || 1)) {
        unavailable.push({
          ...item,
          available,
          storeLabel: STORES[storeId]?.label || storeId,
        });
      }
    });

    return unavailable;
  }

  function fetchProducts() {
    const config = window.firebaseConfig || {};
    const projectId = config.projectId || 'afrohornan';
    const url =
      'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(projectId) +
      '/databases/(default)/documents/products';

    return fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Kunde inte hämta lager.');
        return response.json();
      })
      .then((data) => (data.documents || []).map(parseProductDoc));
  }

  window.AfroStores = {
    STORES,
    normalizeStock,
    totalStock,
    getItemStoreStock,
    checkCartAvailability,
    fetchProducts,
  };
})();
