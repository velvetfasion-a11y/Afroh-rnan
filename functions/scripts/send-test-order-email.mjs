import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(root, '.env');

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const {
  sendOrderConfirmationEmail,
  sendAdminOrderNotificationEmail,
} = require('../order-email.js');

const apiKey = process.env.MAILERSEND_API_KEY;
if (!apiKey) throw new Error('MAILERSEND_API_KEY saknas i .env');

const mailersend = {
  apiKey,
  from: process.env.SMTP_FROM || 'Afrohörnan <info@afrohornan.com>',
  adminTo: process.env.ADMIN_ORDER_EMAIL || 'info@afrohornan.com',
};

const orderId = `test-${Date.now()}`;
const order = {
  orderNumber: 'AH-TEST',
  fulfillment: 'delivery',
  customer: {
    name: 'Julia',
    email: 'juliar3nse@gmail.com',
    phone: '0701234567',
    address: 'Testgatan 12',
    postal: '123 45',
    city: 'Stockholm',
    country: 'Sverige',
  },
  items: [
    {
      name: 'Oraffinerad Shea Butter 200 g',
      qty: 1,
      price: 129,
      slug: 'shea-butter',
      productType: 'product',
    },
    {
      name: 'Berbere kryddblandning',
      qty: 1,
      price: 89,
      slug: 'berbere',
      productType: 'product',
    },
  ],
  shipping: 0,
  total: 218,
  status: 'paid',
  createdAt: new Date(),
  paidAt: new Date(),
};

async function main() {
  await sendOrderConfirmationEmail(order, orderId, mailersend);
  console.log('Kundmejl skickat via MailerSend API till', order.customer.email);

  await sendAdminOrderNotificationEmail(order, orderId, {
    paymentMethod: 'Kort (test)',
  }, mailersend);
  console.log('Adminmejl skickat till', mailersend.adminTo);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
