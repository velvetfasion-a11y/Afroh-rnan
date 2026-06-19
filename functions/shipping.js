const FREE_SHIPPING_THRESHOLD = 1000;
const STANDARD_SHIPPING_FEE = 79;

function calculatePostnordShipping(subtotal) {
  const value = Number(subtotal) || 0;
  return value >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
}

function calculateShipping(subtotal, options = {}) {
  const { fulfillment = 'delivery', shippingMethod = 'postnord' } = options;
  if (fulfillment === 'pickup' || shippingMethod === 'pickup') {
    return 0;
  }
  return calculatePostnordShipping(subtotal);
}

function shippingMethodLabel(method) {
  if (method === 'pickup') return 'Hämta i butik';
  return 'PostNord - Spårbart Ombud';
}

module.exports = {
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
  calculatePostnordShipping,
  calculateShipping,
  shippingMethodLabel,
};
