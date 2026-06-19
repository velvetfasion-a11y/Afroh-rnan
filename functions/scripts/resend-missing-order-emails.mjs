/**
 * Skickar om MailerSend-mejl för betalda ordrar där emailSentAt/adminEmailSentAt saknas.
 * Kör: node functions/scripts/resend-missing-order-emails.mjs
 * Kräver: .env med MAILERSEND_API_KEY + inloggad Firebase/gcloud CLI.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const { sendOrderEmailsIfNeeded } = require('../order-email.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(root, '.env');

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const apiKey = process.env.MAILERSEND_API_KEY;
if (!apiKey) throw new Error('MAILERSEND_API_KEY saknas i .env');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'afrohornan' });
}

const db = admin.firestore();
const mailersend = {
  apiKey,
  from: process.env.SMTP_FROM || 'Afrohörnan <info@afrohornan.com>',
  adminTo: process.env.ADMIN_ORDER_EMAIL || 'info@afrohornan.com',
  courseCustomerTemplateId: process.env.MAILERSEND_COURSE_CUSTOMER_TEMPLATE_ID || '',
  courseAdminTemplateId: process.env.MAILERSEND_COURSE_ADMIN_TEMPLATE_ID || '',
  coursePortalUrl: process.env.MAILERSEND_COURSE_PORTAL_URL || 'https://afrohornan.com/profile.html',
};

function pickupLabel(store) {
  if (store === 'fittja') return 'Fittja';
  if (store === 'marsta') return 'Märsta';
  return store || '';
}

async function main() {
  const snap = await db.collection('orders').where('status', '==', 'paid').get();
  let resent = 0;

  for (const doc of snap.docs) {
    const order = doc.data();
    if (order.emailSentAt && order.adminEmailSentAt) continue;

    console.log('Resending emails for order', doc.id, order.customer?.email || '(no email)');

    const result = await sendOrderEmailsIfNeeded(order, doc.id, mailersend, {
      paymentMethod: order.paymentMethod || 'Kort',
      pickupStore: pickupLabel(order.pickupStore),
    });

    const updates = {};
    if (result.customerSent && !order.emailSentAt) {
      updates.emailSentAt = admin.firestore.FieldValue.serverTimestamp();
      updates.emailError = admin.firestore.FieldValue.delete();
    } else if (result.errors.customer) {
      updates.emailError = result.errors.customer;
    }

    if (result.adminSent && !order.adminEmailSentAt) {
      updates.adminEmailSentAt = admin.firestore.FieldValue.serverTimestamp();
      updates.adminEmailError = admin.firestore.FieldValue.delete();
    } else if (result.errors.admin) {
      updates.adminEmailError = result.errors.admin;
    }

    if (Object.keys(updates).length) {
      await doc.ref.update(updates);
    }

    console.log('  →', result);
    resent += 1;
  }

  console.log(resent ? `Klar – behandlade ${resent} order(er).` : 'Inga ordrar saknade mejl.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
