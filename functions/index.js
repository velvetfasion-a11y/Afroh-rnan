const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { sendOrderConfirmationEmail, sendAdminOrderNotificationEmail } = require('./order-email');

setGlobalOptions({ region: 'europe-west1' });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const stripeSecret = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const smtpFrom = defineString('SMTP_FROM', { default: 'Afrohörnan <info@afrohornan.com>' });
const adminOrderEmail = defineString('ADMIN_ORDER_EMAIL', { default: 'info@afrohörnan.se' });
const smtpHost = defineString('SMTP_HOST', { default: 'smtp.mailersend.net' });
const smtpPort = defineString('SMTP_PORT', { default: '587' });

function orderSubtotal(items) {
  return items.reduce(
    (sum, item) => sum + Math.round(Number(item.price) || 0) * (Number(item.qty) || 1),
    0,
  );
}

function smtpConfig() {
  return {
    host: smtpHost.value() || 'smtp.mailersend.net',
    port: smtpPort.value() || '587',
    user: smtpUser.value(),
    pass: smtpPass.value(),
    from: smtpFrom.value() || 'Afrohörnan <info@afrohornan.com>',
    adminTo: adminOrderEmail.value() || 'info@afrohörnan.se',
  };
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
  { secrets: [stripeSecret] },
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
        const stripe = new Stripe(stripeSecret.value());
        const { items, customer, amount } = req.body || {};

        if (!Array.isArray(items) || !items.length) {
          res.status(400).json({ error: 'Cart is empty' });
          return;
        }

        const subtotal = orderSubtotal(items);
        const shipping = 0;
        const total = Number.isFinite(Number(amount)) ? Number(amount) : subtotal + shipping;

        if (!total || total < 1) {
          res.status(400).json({ error: 'Invalid order amount' });
          return;
        }

        if (!customer?.email || !customer?.phone || !customer?.address || !customer?.postal || !customer?.city) {
          res.status(400).json({ error: 'Missing customer details' });
          return;
        }

        const orderRef = await db.collection('orders').add({
          customer: {
            name: customer.name || '',
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
            postal: customer.postal,
            city: customer.city,
            country: customer.country || 'Sverige',
          },
          items: items.map((item) => ({
            slug: item.slug || '',
            name: item.name || 'Produkt',
            brand: item.brand || '',
            price: Number(item.price) || 0,
            qty: Number(item.qty) || 1,
            image: item.image || '',
            url: item.url || '',
          })),
          subtotal,
          shipping,
          total,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const intent = await stripe.paymentIntents.create({
          amount: total * 100,
          currency: 'sek',
          automatic_payment_methods: { enabled: true },
          receipt_email: customer.email,
          metadata: {
            order_id: orderRef.id,
            customer_name: customer.name || '',
            customer_email: customer.email,
            customer_phone: customer.phone,
            customer_address: customer.address,
            customer_postal: customer.postal,
            customer_city: customer.city,
          },
          shipping: {
            name: customer.name || 'Kund',
            phone: customer.phone,
            address: {
              line1: customer.address,
              postal_code: customer.postal,
              city: customer.city,
              country: 'SE',
            },
          },
        });

        await orderRef.update({ paymentIntentId: intent.id });

        res.json({ clientSecret: intent.client_secret, orderId: orderRef.id });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || 'Payment setup failed' });
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
  const smtp = smtpConfig();

  if (order.emailSentAt && order.adminEmailSentAt) {
    return { skipped: true, reason: 'already_sent' };
  }

  await orderRef.update({
    status: 'paid',
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    paymentMethod,
  });

  if (!order.emailSentAt) {
    await sendOrderConfirmationEmail(order, orderId, smtp);
    await orderRef.update({
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  if (!order.adminEmailSentAt) {
    await sendAdminOrderNotificationEmail(order, orderId, smtp, { paymentMethod });
    await orderRef.update({
      adminEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { skipped: false };
}

exports.stripeWebhook = onRequest(
  {
    secrets: [stripeSecret, stripeWebhookSecret, smtpUser, smtpPass],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const stripe = new Stripe(stripeSecret.value());
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
        const orderId = paymentIntent.metadata?.order_id;

        if (orderId) {
          await handlePaidOrder(orderId, paymentIntent, stripe);
        } else {
          console.warn('payment_intent.succeeded without order_id metadata', paymentIntent.id);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe webhook handler failed:', err);
      res.status(500).send('Webhook handler failed');
    }
  },
);
