(function () {
  const panel = document.getElementById('checkout-panel');
  const pickupPanel = document.getElementById('pickup-panel');
  const checkoutBtn = document.getElementById('checkout-btn');
  const pickupBtn = document.getElementById('pickup-btn');
  const form = document.getElementById('checkout-form');
  const pickupForm = document.getElementById('pickup-form');
  const continueBtn = document.getElementById('checkout-continue');
  const payBtn = document.getElementById('checkout-pay');
  const errorEl = document.getElementById('checkout-error');
  const pickupErrorEl = document.getElementById('pickup-error');
  const pickupUnavailableEl = document.getElementById('pickup-unavailable');
  const pickupSubmitBtn = document.getElementById('pickup-submit');
  const pickupPaymentWrap = document.getElementById('pickup-payment');
  const pickupExpressMount = document.getElementById('pickup-express-checkout-element');
  const pickupPaymentMount = document.getElementById('pickup-payment-element');
  const paymentWrap = document.getElementById('checkout-payment');
  const expressMount = document.getElementById('express-checkout-element');
  const paymentMount = document.getElementById('payment-element');
  const cartActions = document.querySelector('.cart-actions');
  const checkoutPickupStores = document.getElementById('checkout-pickup-stores');
  const postnordLabelEl = document.getElementById('checkout-postnord-label');

  if (!panel || !checkoutBtn || !form) return;

  const shippingApi = () => window.AfroShipping;

  let stripe = null;
  let elements = null;
  let paymentReady = false;
  let pickupStripe = null;
  let pickupElements = null;
  let pickupPaymentReady = false;
  let productsCache = null;
  let currentOrderId = null;

  function formatKr(n) {
    return n.toLocaleString('sv-SE') + ' kr';
  }

  function showError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function showPickupError(message) {
    if (!pickupErrorEl) return;
    if (!message) {
      pickupErrorEl.hidden = true;
      pickupErrorEl.textContent = '';
      return;
    }
    pickupErrorEl.hidden = false;
    pickupErrorEl.textContent = message;
  }

  function hidePanels() {
    panel.hidden = true;
    if (pickupPanel) pickupPanel.hidden = true;
    if (cartActions) cartActions.hidden = false;
    if (checkoutBtn) checkoutBtn.hidden = false;
    if (pickupBtn) pickupBtn.hidden = false;
  }

  function openPanel(targetPanel) {
    hidePanels();
    targetPanel.hidden = false;
    if (cartActions) cartActions.hidden = true;
    if (checkoutBtn) checkoutBtn.hidden = true;
    if (pickupBtn) pickupBtn.hidden = true;
    targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function ensureProducts() {
    if (productsCache) return productsCache;
    if (!window.AfroStores?.fetchProducts) return [];
    productsCache = await window.AfroStores.fetchProducts();
    return productsCache;
  }

  function getSubtotal() {
    return AfroCart.getTotal();
  }

  function readDeliveryShipping() {
    const method = form?.querySelector('input[name="checkout-shipping"]:checked')?.value || 'postnord';
    const store = form?.querySelector('input[name="checkout-pickup-store"]:checked')?.value || '';
    return { method, store };
  }

  function getCheckoutTotals() {
    const subtotal = getSubtotal();
    const { method } = readDeliveryShipping();
    const shippingFee = shippingApi()?.calculateShipping(subtotal, method) ?? 0;
    return { subtotal, shipping: shippingFee, total: subtotal + shippingFee, method };
  }

  function updateCheckoutTotals() {
    const { subtotal, shipping, total, method } = getCheckoutTotals();
    const postnordFee = shippingApi()?.calculatePostnordShipping(subtotal) ?? 0;

    if (postnordLabelEl && shippingApi()) {
      postnordLabelEl.textContent = shippingApi().postnordOptionLabel(subtotal);
    }

    if (checkoutPickupStores) {
      checkoutPickupStores.hidden = method !== 'pickup';
    }

    const itemsTotalEl = document.getElementById('checkout-items-total');
    const shippingTotalEl = document.getElementById('checkout-shipping-total');
    const grandTotalEl = document.getElementById('checkout-grand-total');

    if (itemsTotalEl) itemsTotalEl.textContent = formatKr(subtotal);
    if (shippingTotalEl) {
      shippingTotalEl.textContent = shipping === 0 ? 'Gratis' : formatKr(shipping);
    }
    if (grandTotalEl) grandTotalEl.textContent = formatKr(total);
  }

  function buildDeliveryPaymentOptions(customer) {
    const { method, store } = readDeliveryShipping();
    const totals = getCheckoutTotals();

    if (method === 'pickup') {
      if (!store) throw new Error('Välj butik för hämtning.');
      const storeLabel = window.AfroStores?.STORES?.[store]?.label || store;
      return {
        fulfillment: 'pickup',
        pickupStore: store,
        shippingMethod: 'pickup',
        amount: totals.total,
        subtotal: totals.subtotal,
        shipping: 0,
        customer: {
          ...customer,
          name: customer.name || `Hämtning ${storeLabel}`,
          address: `Hämtning i butik – ${storeLabel}`,
          city: storeLabel,
        },
      };
    }

    return {
      fulfillment: 'delivery',
      pickupStore: '',
      shippingMethod: 'postnord',
      amount: totals.total,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      customer,
    };
  }

  function readCustomer() {
    return {
      name: document.getElementById('checkout-name')?.value.trim() || '',
      email: document.getElementById('checkout-email')?.value.trim() || '',
      phone: document.getElementById('checkout-phone')?.value.trim() || '',
      address: document.getElementById('checkout-address')?.value.trim() || '',
      postal: document.getElementById('checkout-postal')?.value.trim() || '',
      city: document.getElementById('checkout-city')?.value.trim() || '',
    };
  }

  function readPickup() {
    const phone = document.getElementById('pickup-phone')?.value.trim() || '';
    const email = document.getElementById('pickup-email')?.value.trim() || '';
    const store = pickupForm?.querySelector('input[name="pickup-store"]:checked')?.value || '';
    return { phone, email, store };
  }

  function validateCustomer(customer, options = {}) {
    if (!customer.email || !customer.email.includes('@')) return 'Ange en giltig e-postadress.';
    if (!customer.phone || customer.phone.length < 6) return 'Ange ett telefonnummer.';
    if (options.fulfillment === 'pickup') return '';
    if (!customer.address) return 'Ange din adress.';
    if (!customer.postal) return 'Ange postnummer.';
    if (!customer.city) return 'Ange ort.';
    return '';
  }

  function validatePickup(pickup) {
    if (!pickup.email || !pickup.email.includes('@')) return 'Ange en giltig e-postadress.';
    if (!pickup.phone || pickup.phone.length < 6) return 'Ange ett telefonnummer.';
    if (!pickup.store || !window.AfroStores?.STORES?.[pickup.store]) return 'Välj en butik.';
    return '';
  }

  function pickupCustomer(pickup) {
    const storeLabel = window.AfroStores?.STORES?.[pickup.store]?.label || pickup.store;
    return {
      name: `Hämtning ${storeLabel}`,
      email: pickup.email,
      phone: pickup.phone,
      address: `Hämtning i butik – ${storeLabel}`,
      postal: '',
      city: storeLabel,
    };
  }

  function loadStripeScript() {
    return new Promise((resolve, reject) => {
      if (window.Stripe) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Kunde inte ladda Stripe.'));
      document.head.appendChild(script);
    });
  }

  async function createPaymentIntent(customer, options = {}) {
    const config = window.stripeConfig || {};
    const url = config.checkoutApiUrl || window.AfroSite?.checkoutApiUrl;
    if (!url) throw new Error('Betalnings-API saknas.');

    const headers = { 'Content-Type': 'application/json' };
    const token = await window.AfroCheckoutAuth?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: AfroCart.getItems(),
          amount: options.amount ?? getCheckoutTotals().total,
          subtotal: options.subtotal ?? getSubtotal(),
          shipping: options.shipping ?? getCheckoutTotals().shipping,
          shippingMethod: options.shippingMethod || 'postnord',
          customer: options.customer || customer,
          fulfillment: options.fulfillment || 'delivery',
          pickupStore: options.pickupStore || '',
          customerUid: window.AfroCheckoutAuth?.getUid?.() || null,
        }),
      });
    } catch (err) {
      console.error('Payment API request failed:', err);
      throw new Error('Kunde inte nå betalningsservern. Kontrollera internet och försök igen.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.code === 'unavailable_in_store') {
        if (pickupUnavailableEl) pickupUnavailableEl.hidden = false;
      }
      const message = data.error || (response.status === 403
        ? 'Betalningsservern är inte tillgänglig ännu. Kontakta oss om felet kvarstår.'
        : 'Kunde inte starta betalningen.');
      throw new Error(message);
    }
    if (!data.clientSecret) {
      throw new Error('Ogiltigt svar från betalningsservern.');
    }
    currentOrderId = data.orderId || null;
    if (currentOrderId) {
      try {
        sessionStorage.setItem('afroPendingOrderId', currentOrderId);
        if (customer?.email) {
          sessionStorage.setItem('afroPendingOrderEmail', customer.email);
        }
      } catch {
        /* ignore */
      }
    }
    return data;
  }

  async function syncOrderAfterPayment(customerEmail) {
    let orderId = currentOrderId;
    if (!orderId) {
      try {
        orderId = sessionStorage.getItem('afroPendingOrderId');
      } catch {
        orderId = null;
      }
    }
    if (!orderId) return;

    const syncUrl = window.AfroSite?.syncOrderApiUrl;
    if (!syncUrl) return;

    let email = customerEmail || '';
    if (!email) {
      try {
        email = sessionStorage.getItem('afroPendingOrderEmail') || '';
      } catch {
        email = '';
      }
    }

    const headers = { 'Content-Type': 'application/json' };
    const token = await window.AfroCheckoutAuth?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const body = { orderId };
    if (email) body.customerEmail = email;

    try {
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.warn('Order sync after payment failed:', data.error || response.status);
      }
      try {
        sessionStorage.removeItem('afroPendingOrderId');
        sessionStorage.removeItem('afroPendingOrderEmail');
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.warn('Order sync after payment failed:', err);
    }
  }

  function openMailtoOrder(customer) {
    const subject = encodeURIComponent('Beställning från Afrohörnan');
    const body = encodeURIComponent(
      `Hej!\n\nJag vill beställa:\n${AfroCart.getItems()
        .map((i) => `- ${i.name} (${i.qty} st) – ${formatKr(i.price * i.qty)}`)
        .join('\n')}\n\nTotalt: ${formatKr(AfroCart.getTotal())}\n\nNamn: ${customer.name}\nE-post: ${customer.email}\nTelefon: ${customer.phone}\nAdress: ${customer.address}\n${customer.postal} ${customer.city}`,
    );
    window.location.href = `mailto:info@afrohornan.com?subject=${subject}&body=${body}`;
  }

  function buildReturnUrl(options = {}) {
    const param = options.fulfillment === 'pickup' ? 'pickup=success' : 'checkout=success';
    return `${window.location.origin}${window.location.pathname}?${param}`;
  }

  function buildConfirmParams(customer, options = {}) {
    const isPickup = options.fulfillment === 'pickup';
    const paymentCustomer = options.customer || customer;
    const params = {
      return_url: buildReturnUrl(options),
      receipt_email: paymentCustomer.email,
    };

    if (isPickup) {
      params.payment_method_data = {
        billing_details: {
          name: paymentCustomer.name,
          email: paymentCustomer.email,
          phone: paymentCustomer.phone,
        },
      };
    } else {
      params.payment_method_data = {
        billing_details: {
          name: paymentCustomer.name || undefined,
          email: paymentCustomer.email,
          phone: paymentCustomer.phone,
          address: {
            line1: paymentCustomer.address,
            postal_code: paymentCustomer.postal,
            city: paymentCustomer.city,
            country: 'SE',
          },
        },
      };
    }

    return params;
  }

  function showOrderSuccessBanner(type) {
    const header = document.querySelector('.cart-header');
    const emptyEl = document.getElementById('cart-empty');
    const contentEl = document.getElementById('cart-content');

    hidePanels();
    if (contentEl) contentEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    let banner = document.getElementById('order-success-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'order-success-banner';
      banner.className = 'checkout-success checkout-success-panel';
      header?.insertAdjacentElement('afterend', banner);
    }

    banner.hidden = false;
    banner.textContent = type === 'pickup'
      ? 'Tack! Vi förbereder din order för hämtning. Du får bekräftelse via e-post.'
      : 'Tack för din beställning! Du får en bekräftelse via e-post.';
    banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetDeliveryPayment() {
    paymentReady = false;
    stripe = null;
    elements = null;
    clearPaymentMount(expressMount);
    clearPaymentMount(paymentMount);
    if (paymentWrap) paymentWrap.hidden = true;
    if (continueBtn) {
      continueBtn.hidden = false;
      continueBtn.textContent = 'Fortsätt till betalning';
    }
    if (payBtn) payBtn.hidden = true;
  }

  function resetPickupPayment() {
    pickupPaymentReady = false;
    pickupStripe = null;
    pickupElements = null;
    clearPaymentMount(pickupExpressMount);
    clearPaymentMount(pickupPaymentMount);
    if (pickupPaymentWrap) pickupPaymentWrap.hidden = true;
    if (pickupSubmitBtn) {
      pickupSubmitBtn.hidden = false;
      pickupSubmitBtn.textContent = 'Fortsätt till betalning';
    }
  }

  function showReturnError(fulfillment, message) {
    if (fulfillment === 'pickup') {
      resetPickupPayment();
      openPanel(pickupPanel);
      showPickupError(message);
    } else {
      resetDeliveryPayment();
      openPanel(panel);
      showError(message);
    }
  }

  async function processPayment(stripeClient, stripeElements, customer, options, onError) {
    const { error, paymentIntent } = await stripeClient.confirmPayment({
      elements: stripeElements,
      confirmParams: buildConfirmParams(customer, options),
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message || 'Betalningen misslyckades.');
      return false;
    }

    if (paymentIntent?.status === 'succeeded') {
      await syncOrderAfterPayment(customer?.email);
      AfroCart.clear();
      showOrderSuccessBanner(options.fulfillment === 'pickup' ? 'pickup' : 'delivery');
      return true;
    }

    return false;
  }

  function clearPaymentMount(target) {
    if (!target) return;
    target.innerHTML = '';
    delete target.dataset.mounted;
  }

  function mountExpressCheckout(stripeClient, stripeElements, expressTarget, customer, options, onError) {
    if (!expressTarget) return;

    clearPaymentMount(expressTarget);

    const express = stripeElements.create('expressCheckout', {
      buttonHeight: 48,
      buttonType: {
        applePay: 'buy',
        googlePay: 'buy',
      },
      paymentMethods: {
        applePay: 'always',
        googlePay: 'auto',
        link: 'auto',
      },
      layout: {
        maxColumns: 1,
        maxRows: 2,
      },
    });

    express.on('confirm', async () => {
      await processPayment(stripeClient, stripeElements, customer, options, onError);
    });

    express.on('ready', ({ availablePaymentMethods }) => {
      const hasExpress =
        availablePaymentMethods?.applePay ||
        availablePaymentMethods?.googlePay ||
        availablePaymentMethods?.link;
      const section = expressTarget.closest('.checkout-payment');
      const label = section?.querySelector('.checkout-payment-label');
      const divider = section?.querySelector('.checkout-payment-divider');
      if (!hasExpress) {
        expressTarget.hidden = true;
        if (label) label.hidden = true;
        if (divider) divider.hidden = true;
      } else {
        expressTarget.hidden = false;
        if (label) label.hidden = false;
        if (divider) divider.hidden = false;
      }
    });

    express.mount(expressTarget);
    expressTarget.dataset.mounted = '1';
  }

  function mountPaymentElement(stripeElements, paymentTarget) {
    if (!paymentTarget) return;

    clearPaymentMount(paymentTarget);

    const payment = stripeElements.create('payment', {
      wallets: {
        applePay: 'auto',
        googlePay: 'auto',
      },
      layout: {
        type: 'tabs',
      },
    });
    payment.mount(paymentTarget);
    paymentTarget.dataset.mounted = '1';
  }

  async function setupPayment(customer, options = {}) {
    const config = window.stripeConfig || {};
    if (!config.configured || !config.publishableKey) {
      openMailtoOrder(customer);
      return false;
    }

    const isPickup = options.fulfillment === 'pickup';
    const expressTarget = isPickup ? pickupExpressMount : expressMount;
    const paymentTarget = isPickup ? pickupPaymentMount : paymentMount;

    await loadStripeScript();
    const stripeClient = window.Stripe(config.publishableKey);
    const paymentData = await createPaymentIntent(
      options.customer || customer,
      options,
    );
    const clientSecret = paymentData.clientSecret;

    const stripeElements = stripeClient.elements({
      clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#C8541C',
          fontFamily: 'Outfit, sans-serif',
          borderRadius: '4px',
        },
      },
    });

    const onPaymentError = (message) => {
      if (isPickup) showPickupError(message);
      else showError(message);
    };

    const paymentCustomer = options.customer || customer;
    mountExpressCheckout(stripeClient, stripeElements, expressTarget, paymentCustomer, options, onPaymentError);
    mountPaymentElement(stripeElements, paymentTarget);

    if (isPickup) {
      pickupStripe = stripeClient;
      pickupElements = stripeElements;
    } else {
      stripe = stripeClient;
      elements = stripeElements;
    }

    return true;
  }

  checkoutBtn.addEventListener('click', () => {
    if (!AfroCart.getItems().length) return;
    showError('');
    paymentReady = false;
    stripe = null;
    elements = null;
    clearPaymentMount(expressMount);
    clearPaymentMount(paymentMount);
    if (paymentWrap) paymentWrap.hidden = true;
    if (continueBtn) {
      continueBtn.hidden = false;
      continueBtn.textContent = 'Fortsätt till betalning';
    }
    if (payBtn) payBtn.hidden = true;
    updateCheckoutTotals();
    openPanel(panel);
  });

  pickupBtn?.addEventListener('click', () => {
    if (!AfroCart.getItems().length) return;
    showPickupError('');
    pickupPaymentReady = false;
    pickupStripe = null;
    pickupElements = null;
    clearPaymentMount(pickupExpressMount);
    clearPaymentMount(pickupPaymentMount);
    if (pickupPaymentWrap) pickupPaymentWrap.hidden = true;
    if (pickupSubmitBtn) {
      pickupSubmitBtn.hidden = false;
      pickupSubmitBtn.textContent = 'Fortsätt till betalning';
    }
    if (pickupUnavailableEl) pickupUnavailableEl.hidden = true;
    openPanel(pickupPanel);
  });

  form?.addEventListener('change', (event) => {
    if (
      event.target.matches('input[name="checkout-shipping"]')
      || event.target.matches('input[name="checkout-pickup-store"]')
    ) {
      resetDeliveryPayment();
      updateCheckoutTotals();
    }
  });

  document.addEventListener('cart:updated', () => {
    updateCheckoutTotals();
  });

  continueBtn?.addEventListener('click', async () => {
    showError('');
    const customer = readCustomer();
    const paymentOptions = buildDeliveryPaymentOptions(customer);
    const validationError = validateCustomer(
      paymentOptions.customer,
      { fulfillment: paymentOptions.fulfillment },
    );
    if (validationError) {
      showError(validationError);
      return;
    }

    if (paymentOptions.fulfillment === 'pickup') {
      try {
        const products = await ensureProducts();
        const unavailable = window.AfroStores.checkCartAvailability(
          AfroCart.getItems(),
          products,
          paymentOptions.pickupStore,
        );
        if (unavailable.length) {
          showError('En eller flera produkter finns inte i vald butik.');
          return;
        }
      } catch {
        /* continue */
      }
    }

    continueBtn.disabled = true;
    continueBtn.textContent = 'Laddar betalning…';

    try {
      const ready = await setupPayment(paymentOptions.customer, paymentOptions);
      if (!ready) return;

      paymentWrap.hidden = false;
      continueBtn.hidden = true;
      payBtn.hidden = false;
      paymentReady = true;
      paymentWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      showError(err.message || 'Något gick fel.');
    } finally {
      continueBtn.disabled = false;
      continueBtn.textContent = 'Fortsätt till betalning';
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!paymentReady) {
      continueBtn?.click();
      return;
    }
    payBtn?.click();
  });

  payBtn?.addEventListener('click', async () => {
    showError('');

    const customer = readCustomer();
    const paymentOptions = buildDeliveryPaymentOptions(customer);
    const validationError = validateCustomer(
      paymentOptions.customer,
      { fulfillment: paymentOptions.fulfillment },
    );
    if (validationError) {
      showError(validationError);
      return;
    }

    if (!paymentReady || !stripe || !elements) {
      continueBtn?.click();
      return;
    }

    payBtn.disabled = true;
    payBtn.textContent = 'Betalar…';

    try {
      await processPayment(
        stripe,
        elements,
        paymentOptions.customer,
        paymentOptions,
        showError,
      );
    } catch (err) {
      showError(err.message || 'Något gick fel.');
    } finally {
      payBtn.disabled = false;
      payBtn.textContent = 'Betala';
    }
  });

  pickupForm?.addEventListener('change', async () => {
    showPickupError('');
    const pickup = readPickup();
    if (!pickup.store) return;

    try {
      const products = await ensureProducts();
      const unavailable = window.AfroStores.checkCartAvailability(AfroCart.getItems(), products, pickup.store);
      if (pickupUnavailableEl) pickupUnavailableEl.hidden = unavailable.length === 0;
    } catch {
      if (pickupUnavailableEl) pickupUnavailableEl.hidden = true;
    }
  });

  pickupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showPickupError('');
    if (pickupUnavailableEl) pickupUnavailableEl.hidden = true;

    const pickup = readPickup();
    const validationError = validatePickup(pickup);
    if (validationError) {
      showPickupError(validationError);
      return;
    }

    if (!pickupPaymentReady) {
      pickupSubmitBtn.disabled = true;
      pickupSubmitBtn.textContent = 'Kontrollerar lager…';

      try {
        const products = await ensureProducts();
        const unavailable = window.AfroStores.checkCartAvailability(AfroCart.getItems(), products, pickup.store);
        if (unavailable.length) {
          if (pickupUnavailableEl) pickupUnavailableEl.hidden = false;
          showPickupError('En eller flera produkter finns inte i vald butik.');
          return;
        }

        pickupSubmitBtn.textContent = 'Laddar betalning…';
        const customer = pickupCustomer(pickup);
        const ready = await setupPayment(customer, {
          fulfillment: 'pickup',
          pickupStore: pickup.store,
          shippingMethod: 'pickup',
          amount: getSubtotal(),
          subtotal: getSubtotal(),
          shipping: 0,
        });
        if (!ready) return;

        if (pickupPaymentWrap) pickupPaymentWrap.hidden = false;
        pickupPaymentReady = true;
        pickupSubmitBtn.textContent = 'Betala';
        pickupPaymentWrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) {
        showPickupError(err.message || 'Något gick fel.');
      } finally {
        pickupSubmitBtn.disabled = false;
      }
      return;
    }

    pickupSubmitBtn.disabled = true;
    pickupSubmitBtn.textContent = 'Betalar…';

    try {
      const customer = pickupCustomer(pickup);
      await processPayment(
        pickupStripe,
        pickupElements,
        customer,
        { fulfillment: 'pickup', pickupStore: pickup.store },
        showPickupError,
      );
    } catch (err) {
      showPickupError(err.message || 'Något gick fel.');
    } finally {
      pickupSubmitBtn.disabled = false;
      pickupSubmitBtn.textContent = 'Betala';
    }
  });

  function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const redirectStatus = params.get('redirect_status');
    const fulfillment = params.get('pickup') === 'success'
      ? 'pickup'
      : params.get('checkout') === 'success'
        ? 'delivery'
        : null;

    if (!fulfillment || !params.has('payment_intent')) return;

    window.history.replaceState({}, '', window.location.pathname);

    if (redirectStatus !== 'succeeded') {
      showReturnError(
        fulfillment,
        redirectStatus === 'failed'
          ? 'Betalningen misslyckades. Försök igen.'
          : 'Betalningen kunde inte slutföras.',
      );
      return;
    }

    AfroCart.clear();
    void syncOrderAfterPayment();
    showOrderSuccessBanner(fulfillment);
  }

  handlePaymentReturn();
  updateCheckoutTotals();
})();
