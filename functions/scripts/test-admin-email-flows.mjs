/**
 * Verifierar leverans- och återbetalningsmejl (mockad MailerSend + mallkontroll).
 * Kör: node functions/scripts/test-admin-email-flows.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = join(__dirname, '..', '..');

const sentRequests = [];
const originalFetch = global.fetch;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEnvValue(key) {
  for (const file of [join(root, 'functions', '.env.afrohornan'), join(root, '.env')]) {
    if (!existsSync(file)) continue;
    const match = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (match) return match[1].trim();
  }
  return '';
}

async function mockMailerSendTests() {
  global.fetch = async (url, options) => {
    sentRequests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, text: async () => '' };
  };

  const { sendDeliveryCustomerEmail, sendRefundEmail } = require('../order-email');

  const sampleOrder = {
    orderNumber: 'AH-377X',
    customer: {
      name: 'Julia Rensé',
      email: 'test@example.com',
      address: 'Strömsö',
      postal: '18130',
      city: 'Stockholm',
    },
    items: [
      { name: 'Test Product', price: 5, qty: 1 },
      { name: 'Second Product', price: 10, qty: 2, colorName: 'Röd' },
    ],
    shippingMethod: 'postnord',
    total: 25,
  };

  const mailersend = {
    apiKey: 'test-key',
    from: 'Afrohörnan <info@afrohornan.com>',
    deliveryTemplateId: 'jy7zpl9r0o3l5vx6',
    refundTemplateId: '3vz9dley0o74kj50',
  };

  sentRequests.length = 0;
  await sendDeliveryCustomerEmail(sampleOrder, 'order123', mailersend, { trackingNumber: 'PN12345' });

  assert(sentRequests.length === 1, 'Leveransmejl ska göra exakt ett API-anrop');
  const delivery = sentRequests[0].body;
  assert(delivery.template_id === 'jy7zpl9r0o3l5vx6', `Fel leveransmall: ${delivery.template_id}`);
  assert(delivery.subject === 'Din Leverans är på Väg', `Fel leveransämne: ${delivery.subject}`);
  assert(delivery.to[0].email === 'test@example.com', 'Fel mottagare för leverans');

  const deliveryData = delivery.personalization[0].data;
  const deliveryKeys = [
    'customer_name', 'tracking_number', 'tracking_url', 'carrier_name', 'order_number',
    'shipped_date', 'estimated_delivery', 'shipping_method',
    'product_1_name', 'product_1_qty', 'product_1_price',
    'product_2_name', 'product_2_qty', 'product_2_price',
    'customer_address', 'customer_postal', 'customer_city',
  ];
  for (const key of deliveryKeys) {
    assert(key in deliveryData, `Leveransmall saknar variabel: ${key}`);
  }
  assert(deliveryData.customer_name === 'Julia Rensé', 'Fel customer_name');
  assert(deliveryData.order_number === 'AH-377X', 'Fel order_number');
  assert(deliveryData.tracking_number === 'PN12345', 'Fel tracking_number');
  assert(deliveryData.tracking_url.includes('PN12345'), 'Fel tracking_url');
  assert(deliveryData.product_1_name === 'Test Product', 'Fel product_1_name');
  assert(deliveryData.product_2_name.includes('Second Product'), 'Fel product_2_name');
  assert(deliveryData.customer_city === 'Stockholm', 'Fel customer_city');

  sentRequests.length = 0;
  await sendRefundEmail(sampleOrder, 'order123', 25, mailersend);

  assert(sentRequests.length === 1, 'Återbetalningsmejl ska göra exakt ett API-anrop');
  const refund = sentRequests[0].body;
  assert(refund.template_id === '3vz9dley0o74kj50', `Fel återbetalningsmall: ${refund.template_id}`);
  assert(refund.subject === 'Återbetalning Bekräftad', `Fel återbetalningsämne: ${refund.subject}`);

  const refundData = refund.personalization[0].data;
  for (const key of ['customer_name', 'product_name', 'order_number', 'product_price', 'refund_total']) {
    assert(key in refundData, `Återbetalningsmall saknar variabel: ${key}`);
  }
  assert(refundData.refund_total === '25', `Fel refund_total: ${refundData.refund_total}`);

  console.log('✓ Mockade MailerSend-anrop (leverans + återbetalning)');
}

function checkEnvConfig() {
  const deliveryId = loadEnvValue('MAILERSEND_DELIVERY_TEMPLATE_ID');
  const refundId = loadEnvValue('MAILERSEND_REFUND_TEMPLATE_ID');

  assert(deliveryId === 'jy7zpl9r0o3l5vx6', `Fel MAILERSEND_DELIVERY_TEMPLATE_ID: ${deliveryId}`);
  assert(refundId === '3vz9dley0o74kj50', `Fel MAILERSEND_REFUND_TEMPLATE_ID: ${refundId}`);

  console.log('✓ Mall-ID i functions/.env.afrohornan');
}

async function validateMailerSendTemplates() {
  const apiKey = loadEnvValue('MAILERSEND_API_KEY');
  if (!apiKey || apiKey.includes('your_api')) {
    console.log('⊘ Hoppar över live MailerSend-kontroll (ingen API-nyckel)');
    return;
  }

  global.fetch = originalFetch;
  const templates = [
    { label: 'leverans', id: 'jy7zpl9r0o3l5vx6' },
    { label: 'återbetalning', id: '3vz9dley0o74kj50' },
  ];

  for (const template of templates) {
    const response = await fetch(`https://api.mailersend.com/v1/templates/${template.id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    assert(response.ok, `MailerSend-mall för ${template.label} (${template.id}) hittades inte: HTTP ${response.status}`);
  }

  console.log('✓ MailerSend-mallar finns och API-nyckeln fungerar');
}

async function checkDeployedEndpoints() {
  global.fetch = originalFetch;
  const endpoints = [
    'https://europe-west1-afrohornan.cloudfunctions.net/adminSendOrderEmail',
    'https://europe-west1-afrohornan.cloudfunctions.net/adminRefundOrder',
  ];

  for (const url of endpoints) {
    const response = await fetch(url, { method: 'OPTIONS' });
    assert(response.status === 204 || response.ok, `Endpoint svarar inte: ${url} (${response.status})`);
  }

  console.log('✓ Cloud Functions-endpoints svarar (OPTIONS)');
}

async function main() {
  checkEnvConfig();
  await mockMailerSendTests();
  await validateMailerSendTemplates();
  await checkDeployedEndpoints();
  console.log('\nAlla tester godkända.');
}

main().catch((err) => {
  console.error('\nTest misslyckades:', err.message);
  process.exit(1);
});
