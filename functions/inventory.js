const admin = require('firebase-admin');

function isCourseProduct(productData) {
  return productData?.productType === 'course';
}

function isCourseItem(item) {
  return item?.productType === 'course';
}

function getProductStoreStock(productData, colorId, storeId) {
  const colors = Array.isArray(productData.colors) ? productData.colors : [];
  if (colorId && colors.length) {
    const color = colors.find((entry) => entry.id === colorId);
    if (!color) return 0;
    if (color.stock && typeof color.stock === 'object') {
      return Number(color.stock[storeId]) || 0;
    }
    return Number(color.inventory) || 0;
  }

  if (productData.stock && typeof productData.stock === 'object') {
    return Number(productData.stock[storeId]) || 0;
  }

  return Number(productData.inventory) || 0;
}

function getTotalStock(productData, colorId) {
  const colors = Array.isArray(productData.colors) ? productData.colors : [];
  if (colorId && colors.length) {
    const color = colors.find((entry) => entry.id === colorId);
    if (!color) return 0;
    if (color.stock && typeof color.stock === 'object') {
      return (Number(color.stock.fittja) || 0) + (Number(color.stock.marsta) || 0);
    }
    return Number(color.inventory) || 0;
  }

  if (productData.stock && typeof productData.stock === 'object') {
    return (Number(productData.stock.fittja) || 0) + (Number(productData.stock.marsta) || 0);
  }

  return Number(productData.inventory) || 0;
}

function deductFromStockObject(stock, qty) {
  let fittja = Math.max(0, Number(stock?.fittja) || 0);
  let marsta = Math.max(0, Number(stock?.marsta) || 0);
  let remaining = qty;

  const fromFittja = Math.min(fittja, remaining);
  fittja -= fromFittja;
  remaining -= fromFittja;

  const fromMarsta = Math.min(marsta, remaining);
  marsta -= fromMarsta;
  remaining -= fromMarsta;

  if (remaining > 0) {
    throw new Error('Insufficient stock');
  }

  return {
    stock: { fittja, marsta },
    inventory: fittja + marsta,
  };
}

function deductFromStoreStock(stock, storeId, qty) {
  const current = Math.max(0, Number(stock?.[storeId]) || 0);
  if (current < qty) {
    throw new Error('Insufficient stock');
  }

  const nextStock = {
    fittja: Math.max(0, Number(stock?.fittja) || 0),
    marsta: Math.max(0, Number(stock?.marsta) || 0),
    [storeId]: current - qty,
  };

  return {
    stock: nextStock,
    inventory: nextStock.fittja + nextStock.marsta,
  };
}

function restoreToStoreStock(stock, storeId, qty) {
  const nextStock = {
    fittja: Math.max(0, Number(stock?.fittja) || 0),
    marsta: Math.max(0, Number(stock?.marsta) || 0),
    [storeId]: Math.max(0, Number(stock?.[storeId]) || 0) + qty,
  };

  return {
    stock: nextStock,
    inventory: nextStock.fittja + nextStock.marsta,
  };
}

function restoreToStockObject(stock, qty) {
  const fittja = Math.max(0, Number(stock?.fittja) || 0) + qty;
  const marsta = Math.max(0, Number(stock?.marsta) || 0);
  return {
    stock: { fittja, marsta },
    inventory: fittja + marsta,
  };
}

function sumColorInventory(colors) {
  return colors.reduce((sum, color) => sum + Math.max(0, Number(color.inventory) || 0), 0);
}

async function validateOrderStock(db, items, options = {}) {
  const { storeId = null } = options;
  const unavailable = [];

  for (const item of items) {
    if (isCourseItem(item)) continue;

    const productId = item.slug;
    const qty = Number(item.qty) || 1;
    if (!productId) {
      unavailable.push(item);
      continue;
    }

    const snap = await db.collection('products').doc(productId).get();
    if (!snap.exists) {
      unavailable.push(item);
      continue;
    }

    const data = snap.data();
    if (isCourseProduct(data)) continue;

    const available = storeId
      ? getProductStoreStock(data, item.colorId, storeId)
      : getTotalStock(data, item.colorId);

    if (available < qty) {
      unavailable.push({ ...item, available });
    }
  }

  return unavailable;
}

async function deductOrderStock(db, orderId) {
  const orderRef = db.collection('orders').doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error(`Order ${orderId} not found`);
    }

    const order = orderSnap.data();
    if (order.stockDeductedAt) {
      return { skipped: true, reason: 'already_deducted' };
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const storeId = order.fulfillment === 'pickup' ? order.pickupStore : null;

    for (const item of items) {
      if (isCourseItem(item)) continue;

      const productId = item.slug;
      const qty = Number(item.qty) || 1;
      if (!productId || qty < 1) continue;

      const productRef = db.collection('products').doc(productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) {
        throw new Error(`Product ${productId} not found`);
      }

      const data = productSnap.data();
      if (isCourseProduct(data)) continue;

      const colors = Array.isArray(data.colors) ? data.colors.map((color) => ({ ...color })) : [];
      const updates = {
        totalSold: admin.firestore.FieldValue.increment(qty),
      };

      if (item.colorId && colors.length) {
        const colorIndex = colors.findIndex((entry) => entry.id === item.colorId);
        if (colorIndex < 0) {
          throw new Error(`Variant not found for ${productId}`);
        }

        const color = { ...colors[colorIndex] };
        const stock = color.stock || { fittja: 0, marsta: 0 };
        const result = storeId
          ? deductFromStoreStock(stock, storeId, qty)
          : deductFromStockObject(stock, qty);

        color.stock = result.stock;
        color.inventory = result.inventory;
        colors[colorIndex] = color;
        updates.colors = colors;
        updates.inventory = sumColorInventory(colors);
      } else if (colors.length) {
        throw new Error(`Variant required for ${productId}`);
      } else {
        const stock = data.stock || { fittja: 0, marsta: 0 };
        const result = storeId
          ? deductFromStoreStock(stock, storeId, qty)
          : deductFromStockObject(stock, qty);

        updates.stock = result.stock;
        updates.inventory = result.inventory;
      }

      tx.update(productRef, updates);
    }

    tx.update(orderRef, {
      stockDeductedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { skipped: false };
  });
}

async function releaseOrderStock(db, orderId) {
  const orderRef = db.collection('orders').doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      return { skipped: true, reason: 'order_not_found' };
    }

    const order = orderSnap.data();
    if (!order.stockDeductedAt || order.stockReleasedAt) {
      return { skipped: true, reason: 'nothing_to_release' };
    }
    if (order.status === 'paid') {
      return { skipped: true, reason: 'already_paid' };
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const storeId = order.fulfillment === 'pickup' ? order.pickupStore : null;

    for (const item of items) {
      if (isCourseItem(item)) continue;

      const productId = item.slug;
      const qty = Number(item.qty) || 1;
      if (!productId || qty < 1) continue;

      const productRef = db.collection('products').doc(productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) continue;

      const data = productSnap.data();
      if (isCourseProduct(data)) continue;

      const colors = Array.isArray(data.colors) ? data.colors.map((color) => ({ ...color })) : [];
      const updates = {
        totalSold: admin.firestore.FieldValue.increment(-qty),
      };

      if (item.colorId && colors.length) {
        const colorIndex = colors.findIndex((entry) => entry.id === item.colorId);
        if (colorIndex < 0) continue;

        const color = { ...colors[colorIndex] };
        const stock = color.stock || { fittja: 0, marsta: 0 };
        const result = storeId
          ? restoreToStoreStock(stock, storeId, qty)
          : restoreToStockObject(stock, qty);

        color.stock = result.stock;
        color.inventory = result.inventory;
        colors[colorIndex] = color;
        updates.colors = colors;
        updates.inventory = sumColorInventory(colors);
      } else if (!colors.length) {
        const stock = data.stock || { fittja: 0, marsta: 0 };
        const result = storeId
          ? restoreToStoreStock(stock, storeId, qty)
          : restoreToStockObject(stock, qty);

        updates.stock = result.stock;
        updates.inventory = result.inventory;
      }

      tx.update(productRef, updates);
    }

    tx.update(orderRef, {
      stockReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { skipped: false };
  });
}

async function restoreOrderStock(db, orderId) {
  const orderRef = db.collection('orders').doc(orderId);

  return db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      return { skipped: true, reason: 'order_not_found' };
    }

    const order = orderSnap.data();
    if (!order.stockDeductedAt || order.stockReleasedAt) {
      return { skipped: true, reason: 'nothing_to_restore' };
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const storeId = order.fulfillment === 'pickup' ? order.pickupStore : null;

    for (const item of items) {
      if (isCourseItem(item)) continue;

      const productId = item.slug;
      const qty = Number(item.qty) || 1;
      if (!productId || qty < 1) continue;

      const productRef = db.collection('products').doc(productId);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) continue;

      const data = productSnap.data();
      if (isCourseProduct(data)) continue;

      const colors = Array.isArray(data.colors) ? data.colors.map((color) => ({ ...color })) : [];
      const updates = {
        totalSold: admin.firestore.FieldValue.increment(-qty),
      };

      if (item.colorId && colors.length) {
        const colorIndex = colors.findIndex((entry) => entry.id === item.colorId);
        if (colorIndex < 0) continue;

        const color = { ...colors[colorIndex] };
        const stock = color.stock || { fittja: 0, marsta: 0 };
        const result = storeId
          ? restoreToStoreStock(stock, storeId, qty)
          : restoreToStockObject(stock, qty);

        color.stock = result.stock;
        color.inventory = result.inventory;
        colors[colorIndex] = color;
        updates.colors = colors;
        updates.inventory = sumColorInventory(colors);
      } else if (!colors.length) {
        const stock = data.stock || { fittja: 0, marsta: 0 };
        const result = storeId
          ? restoreToStoreStock(stock, storeId, qty)
          : restoreToStockObject(stock, qty);

        updates.stock = result.stock;
        updates.inventory = result.inventory;
      }

      tx.update(productRef, updates);
    }

    tx.update(orderRef, {
      stockReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { skipped: false };
  });
}

module.exports = {
  deductOrderStock,
  releaseOrderStock,
  restoreOrderStock,
  getProductStoreStock,
  getTotalStock,
  validateOrderStock,
};
