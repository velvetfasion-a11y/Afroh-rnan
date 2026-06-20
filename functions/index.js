const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { sendPaidOrderEmails, sendAdminOrderNotificationEmail, sendOrderConfirmationEmail, sendCourseCustomerEmail, sendCourseAdminEmail, isCourseOrder, sendOrderEmailsIfNeeded, sendRefundEmail, sendDeliveryCustomerEmail } = require('./order-email');
const { resolveOrGenerateOrderNumber } = require('./order-number');
const { deductOrderStock, releaseOrderStock, restoreOrderStock, validateOrderStock } = require('./inventory');
const { calculateShipping } = require('./shipping');

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const stripeSecret = defineSecret('STRIPE_LIVE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const mailerSendApiKey = defineSecret('MAILERSEND_API_KEY');
const mailFrom = defineString('SMTP_FROM', { default: 'Afrohörnan <info@afrohornan.com>' });
const adminOrderEmail = defineString('ADMIN_ORDER_EMAIL', { default: 'info@afrohornan.com' });
const adminEmails = defineString('ADMIN_EMAILS', { default: 'info@afrohornan.com' });
const courseCustomerTemplateId = defineString('MAILERSEND_COURSE_CUSTOMER_TEMPLATE_ID', { default: '' });
const courseAdminTemplateId = defineString('MAILERSEND_COURSE_ADMIN_TEMPLATE_ID', { default: '' });
const deliveryTemplateId = defineString('MAILERSEND_DELIVERY_TEMPLATE_ID', { default: 'jy7zpl9r0o3l5vx6' });
const refundTemplateId = defineString('MAILERSEND_REFUND_TEMPLATE_ID', { default: '3vz9dley0o74kj50' });
const coursePortalUrl = defineString('MAILERSEND_COURSE_PORTAL_URL', { default: 'https://afrohornan.com/profile.html' });

function orderSubtotal(items) {
  return items.reduce(
    (sum, item) => sum + Math.round(Number(item.price) || 0) * (Number(item.qty) || 1),
    0,
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getAdminEmailSet() {
  const raw = adminEmails.value() || '';
  return new Set(
    raw.split(/[,;]/).map((entry) => normalizeEmail(entry)).filter(Boolean),
  );
}

async function verifyAdminAccess(decoded) {
  const admins = getAdminEmailSet();
  if (!admins.size || !decoded?.uid) return false;

  const emails = new Set();
  if (decoded.email) emails.add(normalizeEmail(decoded.email));

  const firebaseUser = await admin.auth().getUser(decoded.uid).catch(() => null);
  if (firebaseUser?.email) emails.add(normalizeEmail(firebaseUser.email));
  for (const provider of firebaseUser?.providerData || []) {
    if (provider.email) emails.add(normalizeEmail(provider.email));
  }

  for (const email of emails) {
    if (admins.has(email)) return true;
  }
  return false;
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function serializeOrderDoc(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    orderNumber: data.orderNumber || null,
    status: data.status || 'pending',
    fulfillment: data.fulfillment || 'delivery',
    pickupStore: data.pickupStore || null,
    customer: data.customer || {},
    items: Array.isArray(data.items) ? data.items : [],
    shippingMethod: data.shippingMethod || null,
    subtotal: data.subtotal ?? null,
    shipping: data.shipping ?? null,
    total: data.total ?? null,
    paymentMethod: data.paymentMethod || null,
    paymentIntentId: data.paymentIntentId || null,
    stockIssue: Boolean(data.stockIssue),
    stockIssueMessage: data.stockIssueMessage || null,
    emailError: data.emailError || null,
    createdAt: serializeTimestamp(data.createdAt),
    paidAt: serializeTimestamp(data.paidAt),
    emailSentAt: serializeTimestamp(data.emailSentAt),
    adminEmailSentAt: serializeTimestamp(data.adminEmailSentAt),
    deliveryEmailSentAt: serializeTimestamp(data.deliveryEmailSentAt),
    deliveryEmailError: data.deliveryEmailError || null,
    trackingNumber: data.trackingNumber || null,
    refundedAt: serializeTimestamp(data.refundedAt),
    refundId: data.refundId || null,
    refundEmailSentAt: serializeTimestamp(data.refundEmailSentAt),
    refundEmailError: data.refundEmailError || null,
  };
}

function mailerSendConfig() {
  return {
    apiKey: mailerSendApiKey.value() || '',
    courseCustomerTemplateId: courseCustomerTemplateId.value() || '',
    courseAdminTemplateId: courseAdminTemplateId.value() || '',
    deliveryTemplateId: deliveryTemplateId.value() || '',
    refundTemplateId: refundTemplateId.value() || '',
    coursePortalUrl: coursePortalUrl.value() || 'https://afrohornan.com/profile.html',
    from: mailFrom.value() || 'Afrohörnan <info@afrohornan.com>',
    adminTo: adminOrderEmail.value() || 'info@afrohornan.com',
  };
}

function mapOrderItem(item) {
  return {
    slug: item.slug || '',
    colorId: item.colorId || '',
    colorName: item.colorName || '',
    name: item.name || 'Produkt',
    brand: item.brand || '',
    price: Number(item.price) || 0,
    qty: Number(item.qty) || 1,
    image: item.image || '',
    url: item.url || '',
    productType: item.productType === 'course' ? 'course' : 'product',
  };
}

async function enrichOrderItems(items) {
  const enriched = [];

  for (const item of items) {
    let productType = item.productType === 'course' ? 'course' : 'product';
    const productId = item.slug;

    if (productType !== 'course' && productId) {
      try {
        const snap = await db.collection('products').doc(productId).get();
        if (snap.exists && snap.data().productType === 'course') {
          productType = 'course';
        }
      } catch (err) {
        console.warn('Could not resolve product type for', productId, err.message);
      }
    }

    enriched.push({ ...item, productType });
  }

  return enriched;
}

async function resolvePaymentMethodLabel(stripe, paymentIntent) {
  if (!paymentIntent?.payment_method) return 'Kort';

  try {
    const method = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);
    const wallet = method.card?.wallet?.type;

    if (wallet === 'apple_pay') return 'Apple Pay';
    if (wallet === 'google_pay') return 'Google Pay';

    if (method.type === 'card' && method.card) {
      const brand = method.card.brand
        ? method.card.brand.charAt(0).toUpperCase() + method.card.brand.slice(1)
        : 'Kort';
      return method.card.last4 ? `${brand} ****${method.card.last4}` : brand;
    }

    if (method.type === 'klarna') return 'Klarna';
    if (method.type === 'swish') return 'Swish';

    return method.type || 'Kort';
  } catch (err) {
    console.warn('Could not resolve payment method:', err.message);
    return 'Kort';
  }
}

exports.createPaymentIntent = onRequest(
  { secrets: [stripeSecret], invoker: 'public' },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const stripe = new Stripe(stripeSecret.value().trim());
        const { items, customer, amount, fulfillment, pickupStore, customerUid: bodyUid, shippingMethod } = req.body || {};
        const isPickup = fulfillment === 'pickup';
        const resolvedShippingMethod = isPickup ? 'pickup' : (shippingMethod === 'pickup' ? 'pickup' : 'postnord');
        let customerUid = typeof bodyUid === 'string' && bodyUid.trim() ? bodyUid.trim() : null;

        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
          try {
            const decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim());
            customerUid = decoded.uid;
          } catch (tokenErr) {
            console.warn('createPaymentIntent: invalid auth token', tokenErr.message);
          }
        }

        if (!Array.isArray(items) || !items.length) {
          res.status(400).json({ error: 'Cart is empty' });
          return;
        }

        if (isPickup) {
          if (!pickupStore || !STORE_LABELS[pickupStore]) {
            res.status(400).json({ error: 'Invalid store' });
            return;
          }
          if (!customer?.phone || String(customer.phone).trim().length < 6) {
            res.status(400).json({ error: 'Missing phone number' });
            return;
          }
          if (!customer?.email || !String(customer.email).includes('@')) {
            res.status(400).json({ error: 'Missing email' });
            return;
          }
          const unavailable = await validateOrderStock(db, items, { storeId: pickupStore });
          if (unavailable.length) {
            res.status(409).json({
              error: 'En eller flera produkter finns inte i vald butik.',
              code: 'unavailable_in_store',
              items: unavailable.map((item) => item.name || item.slug),
            });
            return;
          }
        } else if (resolvedShippingMethod === 'pickup') {
          if (!pickupStore || !STORE_LABELS[pickupStore]) {
            res.status(400).json({ error: 'Välj butik för hämtning' });
            return;
          }
          if (
            !customer?.email ||
            !customer?.phone ||
            !customer?.address ||
            !customer?.postal ||
            !customer?.city
          ) {
            res.status(400).json({ error: 'Missing customer details' });
            return;
          }
          const unavailable = await validateOrderStock(db, items, { storeId: pickupStore });
          if (unavailable.length) {
            res.status(409).json({
              error: 'En eller flera produkter finns inte i vald butik.',
              code: 'unavailable_in_store',
              items: unavailable.map((item) => item.name || item.slug),
            });
            return;
          }
        } else if (
          !customer?.email ||
          !customer?.phone ||
          !customer?.address ||
          !customer?.postal ||
          !customer?.city
        ) {
          res.status(400).json({ error: 'Missing customer details' });
          return;
        }

        const enrichedItems = await enrichOrderItems(items);

        if (!isPickup) {
          const unavailable = await validateOrderStock(db, enrichedItems);
          if (unavailable.length) {
            res.status(409).json({
              error: 'En eller flera produkter är slut i lager.',
              code: 'out_of_stock',
              items: unavailable.map((item) => item.name || item.slug),
            });
            return;
          }
        }

        const subtotal = orderSubtotal(items);
        const effectiveFulfillment = isPickup || resolvedShippingMethod === 'pickup' ? 'pickup' : 'delivery';
        const shipping = calculateShipping(subtotal, {
          fulfillment: effectiveFulfillment,
          shippingMethod: resolvedShippingMethod,
        });
        const total = subtotal + shipping;

        if (Number.isFinite(Number(amount)) && Number(amount) !== total) {
          console.warn('createPaymentIntent amount mismatch', { client: amount, server: total });
        }

        if (!total || total < 1) {
          res.status(400).json({ error: 'Invalid order amount' });
          return;
        }

        const storeLabel = effectiveFulfillment === 'pickup' ? STORE_LABELS[pickupStore] : '';

        const orderRef = await db.collection('orders').add({
          fulfillment: effectiveFulfillment,
          pickupStore: effectiveFulfillment === 'pickup' ? pickupStore : null,
          shippingMethod: resolvedShippingMethod,
          ...(customerUid ? { customerUid } : {}),
          customer: {
            name: customer.name || (effectiveFulfillment === 'pickup' ? `Hämtning ${storeLabel}` : ''),
            email: normalizeEmail(customer.email),
            phone: customer.phone,
            address: effectiveFulfillment === 'pickup' ? `Hämtning i butik – ${storeLabel}` : customer.address,
            postal: customer.postal || '',
            city: customer.city || (effectiveFulfillment === 'pickup' ? storeLabel : ''),
            country: customer.country || 'Sverige',
          },
          items: enrichedItems.map(mapOrderItem),
          subtotal,
          shipping,
          total,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        try {
          await deductOrderStock(db, orderRef.id);
        } catch (stockErr) {
          console.error('Stock reservation failed for order', orderRef.id, stockErr.message);
          await orderRef.delete().catch(() => {});
          res.status(409).json({
            error: 'En eller flera produkter är slut i lager.',
            code: 'out_of_stock',
          });
          return;
        }

        const intentMetadata = {
          order_id: orderRef.id,
          fulfillment: effectiveFulfillment,
          customer_name: customer.name || '',
          customer_email: customer.email || '',
          customer_phone: customer.phone,
          shipping_method: resolvedShippingMethod,
        };

        if (effectiveFulfillment === 'pickup') {
          intentMetadata.pickup_store = pickupStore;
        } else {
          intentMetadata.customer_address = customer.address;
          intentMetadata.customer_postal = customer.postal;
          intentMetadata.customer_city = customer.city;
        }

        const intentPayload = {
          amount: total * 100,
          currency: 'sek',
          automatic_payment_methods: { enabled: true },
          metadata: intentMetadata,
        };

        if (customer.email) {
          intentPayload.receipt_email = customer.email;
        }

        if (!isPickup) {
          intentPayload.shipping = {
            name: customer.name || 'Kund',
            phone: customer.phone,
            address: {
              line1: customer.address,
              postal_code: customer.postal,
              city: customer.city,
              country: 'SE',
            },
          };
        }

        const intent = await stripe.paymentIntents.create(intentPayload);

        await orderRef.update({ paymentIntentId: intent.id });

        res.json({ clientSecret: intent.client_secret, orderId: orderRef.id });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Payment setup failed' });
      }
    });
  },
);

const STORE_LABELS = {
  fittja: 'Fittja',
  marsta: 'Märsta',
};

exports.createPickupOrder = onRequest(
  { secrets: [mailerSendApiKey], invoker: 'public' },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const { items, phone, store, amount } = req.body || {};

        if (!Array.isArray(items) || !items.length) {
          res.status(400).json({ error: 'Cart is empty' });
          return;
        }

        if (!phone || String(phone).trim().length < 6) {
          res.status(400).json({ error: 'Missing phone number' });
          return;
        }

        if (!store || !STORE_LABELS[store]) {
          res.status(400).json({ error: 'Invalid store' });
          return;
        }

        const unavailable = await validateOrderStock(db, items, { storeId: store });
        if (unavailable.length) {
          res.status(409).json({
            error: 'En eller flera produkter finns inte i vald butik.',
            code: 'unavailable_in_store',
            items: unavailable.map((item) => item.name || item.slug),
          });
          return;
        }

        const subtotal = orderSubtotal(items);
        const total = Number.isFinite(Number(amount)) ? Number(amount) : subtotal;
        const storeLabel = STORE_LABELS[store];

        const orderRef = await db.collection('orders').add({
          fulfillment: 'pickup',
          pickupStore: store,
          customer: {
            name: '',
            email: '',
            phone: String(phone).trim(),
            address: '',
            postal: '',
            city: '',
            country: 'Sverige',
          },
          items: items.map((item) => ({
            slug: item.slug || '',
            colorId: item.colorId || '',
            colorName: item.colorName || '',
            name: item.name || 'Produkt',
            brand: item.brand || '',
            price: Number(item.price) || 0,
            qty: Number(item.qty) || 1,
            image: item.image || '',
            url: item.url || '',
            productType: item.productType === 'course' ? 'course' : 'product',
          })),
          subtotal,
          shipping: 0,
          total,
          status: 'pickup_requested',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        try {
          await deductOrderStock(db, orderRef.id);
        } catch (stockErr) {
          console.error('Pickup stock deduction failed:', stockErr.message);
          await orderRef.update({
            stockIssue: true,
            stockIssueMessage: stockErr.message,
          });
        }

        const orderSnap = await orderRef.get();
        const order = orderSnap.data();
        const mailersend = mailerSendConfig();

        await sendAdminOrderNotificationEmail(order, orderRef.id, {
          paymentMethod: `Hämtning i butik – ${storeLabel}`,
          pickupStore: storeLabel,
        }, mailersend).catch((emailErr) => {
          console.error('Pickup admin email failed:', emailErr.message);
        });

        await orderRef.update({
          adminEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.json({ ok: true, orderId: orderRef.id });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Pickup order failed' });
      }
    });
  },
);

async function handlePaidOrder(orderId, paymentIntent, stripe) {
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new Error(`Order ${orderId} not found`);
  }

  const order = orderSnap.data();
  const paymentMethod = await resolvePaymentMethodLabel(stripe, paymentIntent);
  const mailersend = mailerSendConfig();

  const orderNumber = await resolveOrGenerateOrderNumber(db, orderRef, order);
  const orderWithNumber = { ...order, orderNumber };

  if (!order.stockDeductedAt) {
    try {
      await deductOrderStock(db, orderId);
    } catch (stockErr) {
      console.error('Stock deduction failed for paid order', orderId, stockErr.message);
      await orderRef.update({
        stockIssue: true,
        stockIssueMessage: stockErr.message,
      });
    }
  }

  if (order.status !== 'paid') {
    await orderRef.update({
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentMethod,
      orderNumber,
    });
  } else if (!order.orderNumber) {
    await orderRef.update({ orderNumber, paymentMethod });
  }

  const pickupStore = order.pickupStore === 'fittja'
    ? 'Fittja'
    : order.pickupStore === 'marsta'
      ? 'Märsta'
      : order.pickupStore || '';
  const adminOptions = { paymentMethod, pickupStore };

  const freshSnap = await orderRef.get();
  const freshOrder = { ...freshSnap.data(), orderNumber };
  const emailResult = await sendOrderEmailsIfNeeded(freshOrder, orderId, mailersend, adminOptions);

  const emailUpdates = {};
  if (emailResult.customerSent && !freshOrder.emailSentAt) {
    emailUpdates.emailSentAt = admin.firestore.FieldValue.serverTimestamp();
    emailUpdates.emailError = admin.firestore.FieldValue.delete();
  } else if (emailResult.errors.customer) {
    emailUpdates.emailError = emailResult.errors.customer;
    emailUpdates.emailLastAttemptAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (emailResult.adminSent && !freshOrder.adminEmailSentAt) {
    emailUpdates.adminEmailSentAt = admin.firestore.FieldValue.serverTimestamp();
    emailUpdates.adminEmailError = admin.firestore.FieldValue.delete();
  } else if (emailResult.errors.admin) {
    emailUpdates.adminEmailError = emailResult.errors.admin;
    emailUpdates.adminEmailLastAttemptAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (emailResult.errors.config) {
    emailUpdates.emailError = emailResult.errors.config;
    emailUpdates.adminEmailError = emailResult.errors.config;
  }

  if (Object.keys(emailUpdates).length) {
    await orderRef.update(emailUpdates);
  }

  if (emailResult.errors.customer || emailResult.errors.admin || emailResult.errors.config) {
    console.error('Order emails incomplete for', orderId, emailResult.errors);
  }

  return {
    skipped: false,
    orderNumber,
    emails: emailResult,
  };
}

async function resolveOrderIdFromPaymentIntent(paymentIntent) {
  const fromMetadata = paymentIntent.metadata?.order_id;
  if (fromMetadata) return fromMetadata;

  const snap = await db.collection('orders')
    .where('paymentIntentId', '==', paymentIntent.id)
    .limit(1)
    .get();

  if (!snap.empty) return snap.docs[0].id;
  return null;
}

async function verifyOrderAccess(decoded, order) {
  if (!decoded?.uid) return false;
  if (order.customerUid && order.customerUid === decoded.uid) return true;

  const orderEmail = normalizeEmail(order.customer?.email);
  if (!orderEmail) return false;

  const tokenEmail = normalizeEmail(decoded.email);
  if (tokenEmail && orderEmail === tokenEmail) return true;

  const firebaseUser = await admin.auth().getUser(decoded.uid).catch(() => null);
  if (!firebaseUser) return false;

  const emails = new Set();
  if (firebaseUser.email) emails.add(normalizeEmail(firebaseUser.email));
  for (const provider of firebaseUser.providerData || []) {
    if (provider.email) emails.add(normalizeEmail(provider.email));
  }
  return emails.has(orderEmail);
}

function verifyGuestOrderAccess(order, customerEmail) {
  const provided = normalizeEmail(customerEmail);
  const stored = normalizeEmail(order.customer?.email);
  return Boolean(provided && stored && provided === stored);
}

async function runOrderPaymentSync(orderId, options = {}) {
  const { decoded = null, customerEmail = '' } = options;
  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  const order = orderSnap.data();

  if (decoded) {
    if (!(await verifyOrderAccess(decoded, order))) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
  } else if (!verifyGuestOrderAccess(order, customerEmail)) {
    const err = new Error('Ogiltig e-post för denna order');
    err.status = 403;
    throw err;
  }

  const stripe = new Stripe(stripeSecret.value().trim());

  if (order.status === 'paid') {
    let paymentIntent = null;
    if (order.paymentIntentId) {
      paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
    }
    const result = await handlePaidOrder(
      orderId,
      paymentIntent || { id: order.paymentIntentId, metadata: { order_id: orderId } },
      stripe,
    );
    const updated = await orderRef.get();
    return {
      ok: true,
      status: 'paid',
      orderNumber: updated.data()?.orderNumber || null,
      emails: result.emails,
    };
  }

  if (!order.paymentIntentId) {
    const err = new Error('Order has no payment intent');
    err.status = 400;
    throw err;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
  if (paymentIntent.status !== 'succeeded') {
    return { ok: true, status: paymentIntent.status };
  }

  const result = await handlePaidOrder(orderId, paymentIntent, stripe);
  const updated = await orderRef.get();
  return {
    ok: true,
    status: 'paid',
    orderNumber: updated.data()?.orderNumber || null,
    emails: result.emails,
  };
}

exports.syncOrderPayment = onRequest(
  { secrets: [stripeSecret, stripeWebhookSecret, mailerSendApiKey], invoker: 'public' },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const { orderId, customerEmail } = req.body || {};
        if (!orderId || typeof orderId !== 'string') {
          res.status(400).json({ error: 'Missing orderId' });
          return;
        }

        let decoded = null;
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
          try {
            decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim());
          } catch (tokenErr) {
            console.warn('syncOrderPayment: invalid auth token', tokenErr.message);
          }
        }

        if (!decoded && !customerEmail) {
          res.status(400).json({ error: 'customerEmail krävs för gästköp' });
          return;
        }

        const result = await runOrderPaymentSync(orderId, { decoded, customerEmail });
        res.json(result);
      } catch (err) {
        console.error('syncOrderPayment failed:', err);
        const status = err.status || 500;
        res.status(status).json({ error: err.message || 'Sync failed' });
      }
    });
  },
);

exports.listAdminOrders = onRequest(
  { invoker: 'public' },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Inloggning krävs' });
          return;
        }

        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim());
        if (!(await verifyAdminAccess(decoded))) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }

        const snap = await db.collection('orders').get();
        const orders = snap.docs
          .map(serializeOrderDoc)
          .sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
          });

        res.json({ ok: true, orders });
      } catch (err) {
        console.error('listAdminOrders failed:', err);
        res.status(500).json({ error: err.message || 'Could not load orders' });
      }
    });
  },
);

exports.adminSendOrderEmail = onRequest(
  { secrets: [mailerSendApiKey], invoker: 'public' },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Inloggning krävs' });
          return;
        }

        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim());
        if (!(await verifyAdminAccess(decoded))) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }

        const { orderId, force, trackingNumber } = req.body || {};
        if (!orderId || typeof orderId !== 'string') {
          res.status(400).json({ error: 'Missing orderId' });
          return;
        }

        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        let order = orderSnap.data();

        if (order.status === 'refunded') {
          res.status(400).json({ error: 'Återbetalda order kan inte få leveransmejl' });
          return;
        }

        if (!force && order.deliveryEmailSentAt) {
          res.json({
            ok: true,
            deliverySent: true,
            alreadySent: true,
            deliveryEmailSentAt: serializeTimestamp(order.deliveryEmailSentAt),
          });
          return;
        }

        const customerEmail = normalizeEmail(order.customer?.email);
        if (!customerEmail) {
          res.status(400).json({ error: 'Ordern saknar kundens e-postadress' });
          return;
        }

        const mailersend = mailerSendConfig();
        const pickupStore = order.pickupStore === 'fittja'
          ? 'Fittja'
          : order.pickupStore === 'marsta'
            ? 'Märsta'
            : order.pickupStore || '';

        const tracking = typeof trackingNumber === 'string' && trackingNumber.trim()
          ? trackingNumber.trim()
          : (order.trackingNumber || '');

        if (tracking && tracking !== order.trackingNumber) {
          await orderRef.update({ trackingNumber: tracking });
          order = { ...order, trackingNumber: tracking };
        }

        try {
          await sendDeliveryCustomerEmail(order, orderId, mailersend, {
            pickupStore,
            trackingNumber: tracking,
          });
        } catch (emailErr) {
          await orderRef.update({
            deliveryEmailError: emailErr.message,
            deliveryEmailLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          res.status(422).json({ ok: false, error: emailErr.message });
          return;
        }

        await orderRef.update({
          deliveryEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          deliveryEmailError: admin.firestore.FieldValue.delete(),
        });

        res.json({ ok: true, deliverySent: true, deliveryEmailSentAt: new Date().toISOString() });
      } catch (err) {
        console.error('adminSendOrderEmail failed:', err);
        res.status(500).json({ error: err.message || 'Could not send email' });
      }
    });
  },
);

exports.adminRefundOrder = onRequest(
  { secrets: [mailerSendApiKey, stripeSecret], invoker: 'public' },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Inloggning krävs' });
          return;
        }

        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim());
        if (!(await verifyAdminAccess(decoded))) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }

        const { orderId } = req.body || {};
        if (!orderId || typeof orderId !== 'string') {
          res.status(400).json({ error: 'Missing orderId' });
          return;
        }

        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        const order = orderSnap.data();
        if (order.status === 'refunded') {
          res.status(409).json({ error: 'Ordern är redan återbetald' });
          return;
        }

        if (!order.paymentIntentId) {
          res.status(400).json({ error: 'Ordern har ingen Stripe-betalning att återbetala' });
          return;
        }

        const customerEmail = normalizeEmail(order.customer?.email);
        if (!customerEmail) {
          res.status(400).json({ error: 'Ordern saknar kundens e-postadress för återbetalningsmejl' });
          return;
        }

        const stripe = new Stripe(stripeSecret.value().trim());
        const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
          res.status(400).json({ error: 'Betalningen är inte genomförd och kan inte återbetalas' });
          return;
        }

        const refundAmountKr = Number.isFinite(Number(order.total))
          ? Number(order.total)
          : orderSubtotal(order.items || []) + (Number(order.shipping) || 0);

        const refund = await stripe.refunds.create({
          payment_intent: order.paymentIntentId,
          reason: 'requested_by_customer',
        });

        if (refund.status === 'failed') {
          res.status(422).json({ error: 'Stripe-återbetalningen misslyckades' });
          return;
        }

        try {
          await restoreOrderStock(db, orderId);
        } catch (stockErr) {
          console.error('restoreOrderStock on refund failed:', orderId, stockErr.message);
        }

        const mailersend = mailerSendConfig();
        let refundEmailSent = false;
        let refundEmailError = null;

        try {
          await sendRefundEmail(order, orderId, refundAmountKr, mailersend);
          refundEmailSent = true;
        } catch (emailErr) {
          refundEmailError = emailErr.message;
          console.error('Refund email failed:', orderId, emailErr.message);
        }

        await orderRef.update({
          status: 'refunded',
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundId: refund.id,
          refundAmount: refundAmountKr,
          ...(refundEmailSent
            ? {
              refundEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
              refundEmailError: admin.firestore.FieldValue.delete(),
            }
            : {
              refundEmailError: refundEmailError || 'Unknown email error',
            }),
        });

        res.json({
          ok: true,
          refundId: refund.id,
          refundAmount: refundAmountKr,
          emailSent: refundEmailSent,
          emailError: refundEmailError,
        });
      } catch (err) {
        console.error('adminRefundOrder failed:', err);
        res.status(500).json({ error: err.message || 'Refund failed' });
      }
    });
  },
);

exports.adminResendOrderEmails = onRequest(
  { secrets: [mailerSendApiKey, stripeSecret], invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const auth = req.headers.authorization || '';
    const expected = `Bearer ${mailerSendApiKey.value()}`;
    if (!mailerSendApiKey.value() || auth !== expected) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const mailersend = mailerSendConfig();
      const stripe = new Stripe(stripeSecret.value().trim());
      const [paidSnap, pendingSnap] = await Promise.all([
        db.collection('orders').where('status', '==', 'paid').get(),
        db.collection('orders').where('status', '==', 'pending').get(),
      ]);
      const seen = new Set();
      const docs = [...paidSnap.docs, ...pendingSnap.docs].filter((doc) => {
        if (seen.has(doc.id)) return false;
        seen.add(doc.id);
        return true;
      });
      const results = [];

      for (const doc of docs) {
        let order = doc.data();
        if (order.emailSentAt && order.adminEmailSentAt) continue;

        if (order.status === 'pending' && order.paymentIntentId) {
          const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
          if (paymentIntent.status === 'succeeded') {
            const handled = await handlePaidOrder(doc.id, paymentIntent, stripe);
            results.push({
              orderId: doc.id,
              email: order.customer?.email || null,
              status: 'paid',
              emails: handled.emails,
            });
            continue;
          }
        }

        if (order.status !== 'paid') continue;

        const pickupStore = order.pickupStore === 'fittja'
          ? 'Fittja'
          : order.pickupStore === 'marsta'
            ? 'Märsta'
            : order.pickupStore || '';

        const emailResult = await sendOrderEmailsIfNeeded(order, doc.id, mailersend, {
          paymentMethod: order.paymentMethod || 'Kort',
          pickupStore,
        });

        const updates = {};
        if (emailResult.customerSent && !order.emailSentAt) {
          updates.emailSentAt = admin.firestore.FieldValue.serverTimestamp();
          updates.emailError = admin.firestore.FieldValue.delete();
        } else if (emailResult.errors.customer) {
          updates.emailError = emailResult.errors.customer;
        }

        if (emailResult.adminSent && !order.adminEmailSentAt) {
          updates.adminEmailSentAt = admin.firestore.FieldValue.serverTimestamp();
          updates.adminEmailError = admin.firestore.FieldValue.delete();
        } else if (emailResult.errors.admin) {
          updates.adminEmailError = emailResult.errors.admin;
        }

        if (Object.keys(updates).length) {
          await doc.ref.update(updates);
        }

        results.push({
          orderId: doc.id,
          email: order.customer?.email || null,
          emails: emailResult,
        });
      }

      res.json({ ok: true, processed: results.length, results });
    } catch (err) {
      console.error('adminResendOrderEmails failed:', err);
      res.status(500).json({ error: err.message || 'Resend failed' });
    }
  },
);

exports.stripeWebhook = onRequest(
  {
    secrets: [stripeSecret, stripeWebhookSecret, mailerSendApiKey],
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const stripe = new Stripe(stripeSecret.value().trim());
    const signature = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        stripeWebhookSecret.value(),
      );
    } catch (err) {
      console.error('Stripe webhook signature failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const orderId = await resolveOrderIdFromPaymentIntent(paymentIntent);

        if (orderId) {
          try {
            await handlePaidOrder(orderId, paymentIntent, stripe);
          } catch (orderErr) {
            console.error('handlePaidOrder failed for', orderId, orderErr.message);
          }
        } else {
          console.warn('payment_intent.succeeded without matching order', paymentIntent.id);
        }
      }

      if (
        event.type === 'payment_intent.payment_failed'
        || event.type === 'payment_intent.canceled'
      ) {
        const paymentIntent = event.data.object;
        const orderId = await resolveOrderIdFromPaymentIntent(paymentIntent);
        if (orderId) {
          try {
            await releaseOrderStock(db, orderId);
          } catch (releaseErr) {
            console.error('releaseOrderStock failed for', orderId, releaseErr.message);
          }
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook handler failed:', err);
      res.status(500).send('Webhook handler failed');
    }
  },
);
