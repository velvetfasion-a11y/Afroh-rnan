const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const CUSTOMER_TEMPLATE_PATH = path.join(__dirname, 'templates', 'order-confirmation.html');
const ADMIN_TEMPLATE_PATH = path.join(__dirname, 'templates', 'afrohörnan_admin_order_notification.html');

const templateCache = new Map();

function loadTemplate(templatePath) {
  if (!templateCache.has(templatePath)) {
    templateCache.set(templatePath, fs.readFileSync(templatePath, 'utf8'));
  }
  return templateCache.get(templatePath);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(amount) {
  return Number(amount || 0).toLocaleString('sv-SE');
}

function resolveOrderDate(order) {
  return order.createdAt?.toDate?.() || order.paidAt?.toDate?.() || new Date();
}

function formatOrderDate(date) {
  const value = date instanceof Date ? date : new Date(date || Date.now());
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value);
}

function formatOrderDateTime(date) {
  const value = date instanceof Date ? date : new Date(date || Date.now());
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatOrderNumber(orderId) {
  if (!orderId) return 'AFH-UNKNOWN';
  return `AFH-${String(orderId).slice(0, 8).toUpperCase()}`;
}

function orderTotal(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const shipping = Number.isFinite(Number(order.shipping)) ? Number(order.shipping) : 0;
  if (Number.isFinite(Number(order.total))) return Number(order.total);
  return items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0) + shipping;
}

function buildCustomerProductRows(items) {
  return (items || []).map((item) => {
    const name = escapeHtml(item.name || 'Produkt');
    const qty = escapeHtml(item.qty || 1);
    const lineTotal = formatPrice((Number(item.price) || 0) * (Number(item.qty) || 1));
    return `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e8dcc8;">
        <div>
          <p style="color: #2b1810; font-size: 14px; margin: 0; font-weight: 500;">${name}</p>
          <p style="color: #8a6a3e; font-size: 12px; margin: 2px 0 0;">Antal: ${qty}</p>
        </div>
        <p style="color: #2b1810; font-size: 14px; margin: 0; font-weight: 500;">${lineTotal} kr</p>
      </div>`;
  }).join('\n');
}

function buildAdminProductRows(items) {
  return (items || []).map((item, index) => {
    const name = escapeHtml(item.name || 'Produkt');
    const sku = escapeHtml(item.slug || item.sku || '—');
    const qty = escapeHtml(item.qty || 1);
    const lineTotal = formatPrice((Number(item.price) || 0) * (Number(item.qty) || 1));
    const rowNumber = index + 1;
    return `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #e8dcc8;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 22px; height: 22px; background: #2b1810; border-radius: 50%; text-align: center; line-height: 22px;">
            <span style="color: #c9a84c; font-size: 11px; font-weight: 600;">${rowNumber}</span>
          </div>
          <div>
            <p style="color: #2b1810; font-size: 14px; margin: 0; font-weight: 500;">${name}</p>
            <p style="color: #8a6a3e; font-size: 11px; margin: 2px 0 0;">SKU: ${sku} &nbsp;|&nbsp; Antal: ${qty}</p>
          </div>
        </div>
        <p style="color: #2b1810; font-size: 13px; margin: 0; white-space: nowrap; padding-top: 2px;">${lineTotal} kr</p>
      </div>`;
  }).join('\n');
}

function applyReplacements(template, replacements) {
  let html = template;
  Object.entries(replacements).forEach(([key, value]) => {
    html = html.replaceAll(`{{${key}}}`, value);
  });
  return html;
}

function renderOrderConfirmationEmail(order, orderId) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const shipping = Number.isFinite(Number(order.shipping)) ? Number(order.shipping) : 0;
  const orderDate = resolveOrderDate(order);

  return applyReplacements(loadTemplate(CUSTOMER_TEMPLATE_PATH), {
    customer_name: escapeHtml(customer.name || 'Kund'),
    order_number: escapeHtml(formatOrderNumber(orderId)),
    order_date: escapeHtml(formatOrderDate(orderDate)),
    product_rows: buildCustomerProductRows(items),
    shipping_price: escapeHtml(formatPrice(shipping)),
    total_price: escapeHtml(formatPrice(orderTotal(order))),
    customer_address: escapeHtml(customer.address || ''),
    customer_postal: escapeHtml(customer.postal || ''),
    customer_city: escapeHtml(customer.city || ''),
  });
}

function renderAdminOrderNotificationEmail(order, orderId, paymentMethod) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const orderDate = resolveOrderDate(order);

  return applyReplacements(loadTemplate(ADMIN_TEMPLATE_PATH), {
    order_number: escapeHtml(formatOrderNumber(orderId)),
    order_datetime: escapeHtml(formatOrderDateTime(orderDate)),
    customer_name: escapeHtml(customer.name || 'Kund'),
    customer_email: escapeHtml(customer.email || ''),
    customer_phone: escapeHtml(customer.phone || ''),
    customer_address: escapeHtml(customer.address || ''),
    customer_postal: escapeHtml(customer.postal || ''),
    customer_city: escapeHtml(customer.city || ''),
    customer_country: escapeHtml(customer.country || 'Sverige'),
    product_rows: buildAdminProductRows(items),
    total_price: escapeHtml(formatPrice(orderTotal(order))),
    payment_method: escapeHtml(paymentMethod || 'Kort'),
  });
}

function createMailTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });
}

async function sendOrderConfirmationEmail(order, orderId, smtp) {
  const customer = order.customer || {};
  if (!customer.email) {
    throw new Error('Order is missing customer email');
  }

  const html = renderOrderConfirmationEmail(order, orderId);
  const transport = createMailTransport(smtp);
  const from = smtp.from || 'Afrohörnan <info@afrohornan.com>';
  const orderNumber = formatOrderNumber(orderId);

  await transport.sendMail({
    from,
    to: customer.email,
    subject: `Tack för din beställning – ${orderNumber}`,
    html,
    text: [
      `Hej ${customer.name || 'Kund'},`,
      '',
      'Tack för din beställning hos Afrohörnan!',
      `Ordernummer: ${orderNumber}`,
      '',
      'Vi meddelar dig när ordern har skickats.',
      '',
      'Frågor? Kontakta oss på info@afrohornan.com',
    ].join('\n'),
  });
}

async function sendAdminOrderNotificationEmail(order, orderId, smtp, options = {}) {
  const adminTo = smtp.adminTo || 'info@afrohörnan.se';
  const html = renderAdminOrderNotificationEmail(order, orderId, options.paymentMethod);
  const transport = createMailTransport(smtp);
  const from = smtp.from || 'Afrohörnan <info@afrohornan.com>';
  const orderNumber = formatOrderNumber(orderId);
  const customer = order.customer || {};

  await transport.sendMail({
    from,
    to: adminTo,
    subject: `Ny beställning ${orderNumber} – ${customer.name || 'Kund'}`,
    html,
    text: [
      'Ny beställning inkom',
      '',
      `Ordernummer: ${orderNumber}`,
      `Datum: ${formatOrderDateTime(resolveOrderDate(order))}`,
      '',
      `Kund: ${customer.name || 'Kund'}`,
      `E-post: ${customer.email || ''}`,
      `Telefon: ${customer.phone || ''}`,
      `Adress: ${customer.address || ''}, ${customer.postal || ''} ${customer.city || ''}`,
      '',
      `Betalningsmetod: ${options.paymentMethod || 'Kort'}`,
      `Totalt: ${formatPrice(orderTotal(order))} kr`,
    ].join('\n'),
  });
}

module.exports = {
  renderOrderConfirmationEmail,
  renderAdminOrderNotificationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotificationEmail,
  formatOrderNumber,
};
