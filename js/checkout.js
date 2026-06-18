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

  if (!panel || !checkoutBtn || !form) return;

  let stripe = null;
  let elements = null;
  let paymentReady = false;
  let pickupStripe = null;
  let pickupElements = null;
  let pickupPaymentReady = false;
  let productsCache = null;

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

  function validateCustomer(customer) {
    if (!customer.email || !customer.email.includes('@')) return 'Ange en giltig e-postadress.';
    if (!customer.phone || customer.phone.length < 6) return 'Ange ett telefonnummer.';
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

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: AfroCart.getItems(),
          amount: AfroCart.getTotal(),
          customer,
          fulfillment: options.fulfillment || 'delivery',
          pickupStore: options.pickupStore || '',
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
    return data.clientSecret;
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
    const clientSecret = await createPaymentIntent(customer, options);

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

    if (expressTarget && !expressTarget.dataset.mounted) {
      const express = stripeElements.create('expressCheckout', {
        buttonHeight: 48,
        paymentMethods: {
          applePay: 'auto',
          googlePay: 'auto',
          link: 'auto',
        },
      });
      express.mount(expressTarget);
      expressTarget.dataset.mounted = '1';
    }

    if (paymentTarget && !paymentTarget.dataset.mounted) {
      const payment = stripeElements.create('payment');
      payment.mount(paymentTarget);
      paymentTarget.dataset.mounted = '1';
    }

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
    openPanel(panel);
  });

  pickupBtn?.addEventListener('click', () => {
    if (!AfroCart.getItems().length) return;
    showPickupError('');
    pickupPaymentReady = false;
    pickupStripe = null;
    pickupElements = null;
    if (pickupExpressMount) delete pickupExpressMount.dataset.mounted;
    if (pickupPaymentMount) delete pickupPaymentMount.dataset.mounted;
    if (pickupPaymentWrap) pickupPaymentWrap.hidden = true;
    if (pickupSubmitBtn) {
      pickupSubmitBtn.hidden = false;
      pickupSubmitBtn.textContent = 'Fortsätt till betalning';
    }
    if (pickupUnavailableEl) pickupUnavailableEl.hidden = true;
    openPanel(pickupPanel);
  });

  continueBtn?.addEventListener('click', async () => {
    showError('');
    const customer = readCustomer();
    const validationError = validateCustomer(customer);
    if (validationError) {
      showError(validationError);
      return;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = 'Laddar betalning…';

    try {
      const ready = await setupPayment(customer);
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');

    const customer = readCustomer();
    const validationError = validateCustomer(customer);
    if (validationError) {
      showError(validationError);
      return;
    }

    if (!paymentReady) {
      continueBtn?.click();
      return;
    }

    payBtn.disabled = true;
    payBtn.textContent = 'Betalar…';

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}?checkout=success`,
          receipt_email: customer.email,
          payment_method_data: {
            billing_details: {
              name: customer.name || undefined,
              email: customer.email,
              phone: customer.phone,
              address: {
                line1: customer.address,
                postal_code: customer.postal,
                city: customer.city,
                country: 'SE',
              },
            },
          },
        },
      });

      if (error) {
        showError(error.message || 'Betalningen misslyckades.');
      }
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
      const { error } = await pickupStripe.confirmPayment({
        elements: pickupElements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}?checkout=success`,
          receipt_email: customer.email,
          payment_method_data: {
            billing_details: {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
            },
          },
        },
      });

      if (error) {
        showPickupError(error.message || 'Betalningen misslyckades.');
      }
    } catch (err) {
      showPickupError(err.message || 'Något gick fel.');
    } finally {
      pickupSubmitBtn.disabled = false;
      pickupSubmitBtn.textContent = 'Betala';
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    AfroCart.clear();
    window.history.replaceState({}, '', 'kundvagn.html');
    const content = document.getElementById('cart-content');
    if (content) {
      content.insertAdjacentHTML(
        'afterbegin',
        '<p class="checkout-success">Tack för din beställning! Du får en bekräftelse via e-post.</p>',
      );
    }
  }

  if (params.get('pickup') === 'success') {
    AfroCart.clear();
    window.history.replaceState({}, '', 'kundvagn.html');
    const content = document.getElementById('cart-content');
    if (content) {
      content.insertAdjacentHTML(
        'afterbegin',
        '<p class="checkout-success">Tack! Vi förbereder din order för hämtning. Vi ringer dig när den är redo.</p>',
      );
    }
  }
})();
