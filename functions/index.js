const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { sendPaidOrderEmails, sendAdminOrderNotificationEmail, sendOrderConfirmationEmail, sendCourseCustomerEmail, sendCourseAdminEmail, isCourseOrder, sendOrderEmailsIfNeeded } = require('./order-email');
const { resolveOrGenerateOrderNumber } = require('./order-number');
const { deductOrderStock, validateOrderStock } = require('./inventory');

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
const courseCustomerTemplateId = defineString('MAILERSEND_COURSE_CUSTOMER_TEMPLATE_ID', { default: '' });
const courseAdminTemplateId = defineString('MAILERSEND_COURSE_ADMIN_TEMPLATE_ID', { default: '' });
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

function mailerSendConfig() {
  return {
    apiKey: mailerSendApiKey.value() || '',
    courseCustomerTemplateId: courseCustomerTemplateId.value() || '',
    courseAdminTemplateId: courseAdminTemplateId.value() || '',
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
        const { items, customer, amount, fulfillment, pickupStore, customerUid: bodyUid } = req.body || {};
        const isPickup = fulfillment === 'pickup';
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
        const shipping = 0;
        const total = Number.isFinite(Number(amount)) ? Number(amount) : subtotal + shipping;

        if (!total || total < 1) {
          res.status(400).json({ error: 'Invalid order amount' });
          return;
        }

        const storeLabel = isPickup ? STORE_LABELS[pickupStore] : '';

        const orderRef = await db.collection('orders').add({
          fulfillment: isPickup ? 'pickup' : 'delivery',
          pickupStore: isPickup ? pickupStore : null,
          ...(customerUid ? { customerUid } : {}),
          customer: {
            name: customer.name || (isPickup ? `Hämtning ${storeLabel}` : ''),
            email: normalizeEmail(customer.email),
            phone: customer.phone,
            address: isPickup ? `Hämtning i butik – ${storeLabel}` : customer.address,
            postal: customer.postal || '',
            city: customer.city || (isPickup ? storeLabel : ''),
            country: customer.country || 'Sverige',
          },
          items: enrichedItems.map(mapOrderItem),
          subtotal,
          shipping,
          total,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const intentMetadata = {
          order_id: orderRef.id,
          fulfillment: isPickup ? 'pickup' : 'delivery',
          customer_name: customer.name || '',
          customer_email: customer.email || '',
          customer_phone: customer.phone,
        };

        if (isPickup) {
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

  if (order.status !== 'paid') {
    try {
      await deductOrderStock(db, orderId);
    } catch (stockErr) {
      console.error('Stock deduction failed for paid order', orderId, stockErr.message);
      await orderRef.update({
        stockIssue: true,
        stockIssueMessage: stockErr.message,
      });
    }

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
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Inloggning krävs' });
          return;
        }

        const { orderId } = req.body || {};
        if (!orderId || typeof orderId !== 'string') {
          res.status(400).json({ error: 'Missing orderId' });
          return;
        }

        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7).trim());
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
          res.status(404).json({ error: 'Order not found' });
          return;
        }

        const order = orderSnap.data();
        if (!(await verifyOrderAccess(decoded, order))) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }

        if (order.status === 'paid') {
          const stripe = new Stripe(stripeSecret.value().trim());
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
          res.json({
            ok: true,
            status: 'paid',
            orderNumber: updated.data()?.orderNumber || null,
            emails: result.emails,
          });
          return;
        }

        if (!order.paymentIntentId) {
          res.status(400).json({ error: 'Order has no payment intent' });
          return;
        }

        const stripe = new Stripe(stripeSecret.value().trim());
        const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
          res.json({ ok: true, status: paymentIntent.status });
          return;
        }

        await handlePaidOrder(orderId, paymentIntent, stripe);
        const updated = await orderRef.get();
        res.json({
          ok: true,
          status: 'paid',
          orderNumber: updated.data()?.orderNumber || null,
        });
      } catch (err) {
        console.error('syncOrderPayment failed:', err);
        res.status(500).json({ error: err.message || 'Sync failed' });
      }
    });
  },
);

exports.adminResendOrderEmails = onRequest(
  { secrets: [mailerSendApiKey], invoker: 'public' },
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
      const snap = await db.collection('orders').where('status', '==', 'paid').get();
      const results = [];

      for (const doc of snap.docs) {
        const order = doc.data();
        if (order.emailSentAt && order.adminEmailSentAt) continue;

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

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook handler failed:', err);
      res.status(500).send('Webhook handler failed');
    }
  },
);
