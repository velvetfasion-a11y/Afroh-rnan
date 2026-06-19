const ORDER_PREFIX = 'AH-';
const ORDER_SUFFIX_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomSuffix(length = 4) {
  let suffix = '';
  for (let i = 0; i < length; i += 1) {
    suffix += ORDER_SUFFIX_CHARS[Math.floor(Math.random() * ORDER_SUFFIX_CHARS.length)];
  }
  return suffix;
}

function buildOrderNumber() {
  return `${ORDER_PREFIX}${randomSuffix(4)}`;
}

function resolveOrderNumber(order, orderId) {
  if (order?.orderNumber) return order.orderNumber;
  if (!orderId) return `${ORDER_PREFIX}UNKNOWN`;
  return `AFH-${String(orderId).slice(0, 8).toUpperCase()}`;
}

async function generateUniqueOrderNumber(db) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const orderNumber = buildOrderNumber();
    const existing = await db.collection('orders')
      .where('orderNumber', '==', orderNumber)
      .limit(1)
      .get();

    if (existing.empty) return orderNumber;
  }

  throw new Error('Could not generate unique order number');
}

async function resolveOrGenerateOrderNumber(db, orderRef, order) {
  if (order?.orderNumber) return order.orderNumber;

  const freshSnap = await orderRef.get();
  const freshOrder = freshSnap.data();
  if (freshOrder?.orderNumber) return freshOrder.orderNumber;

  return generateUniqueOrderNumber(db);
}

module.exports = {
  buildOrderNumber,
  generateUniqueOrderNumber,
  resolveOrGenerateOrderNumber,
  resolveOrderNumber,
};
