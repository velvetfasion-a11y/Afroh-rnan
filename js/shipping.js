(function () {
  const FREE_SHIPPING_THRESHOLD = 1000;
  const STANDARD_SHIPPING_FEE = 79;

  function calculatePostnordShipping(subtotal) {
    const value = Number(subtotal) || 0;
    return value >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
  }

  function calculateShipping(subtotal, method) {
    if (method === 'pickup') return 0;
    return calculatePostnordShipping(subtotal);
  }

  function amountUntilFreeShipping(subtotal) {
    const value = Number(subtotal) || 0;
    if (value >= FREE_SHIPPING_THRESHOLD) return 0;
    return FREE_SHIPPING_THRESHOLD - value;
  }

  function freeShippingMessage(subtotal) {
    const remaining = amountUntilFreeShipping(subtotal);
    if (remaining <= 0) return 'Du har fri frakt på PostNord!';
    return `Köp för ${remaining.toLocaleString('sv-SE')} kr till och få fri frakt!`;
  }

  function freeShippingProgress(subtotal) {
    const value = Math.max(0, Number(subtotal) || 0);
    return Math.min(100, (value / FREE_SHIPPING_THRESHOLD) * 100);
  }

  function postnordOptionLabel(subtotal) {
    const fee = calculatePostnordShipping(subtotal);
    return fee === 0
      ? 'PostNord - Spårbart Ombud (Gratis)'
      : 'PostNord - Spårbart Ombud (79 kr)';
  }

  function formatShippingFee(fee) {
    const value = Number(fee) || 0;
    return value === 0 ? 'Gratis' : `${value.toLocaleString('sv-SE')} kr`;
  }

  window.AfroShipping = {
    FREE_SHIPPING_THRESHOLD,
    STANDARD_SHIPPING_FEE,
    calculatePostnordShipping,
    calculateShipping,
    amountUntilFreeShipping,
    freeShippingMessage,
    freeShippingProgress,
    postnordOptionLabel,
    formatShippingFee,
    orderTotal(subtotal, shipping) {
      return (Number(subtotal) || 0) + (Number(shipping) || 0);
    },
  };
})();
