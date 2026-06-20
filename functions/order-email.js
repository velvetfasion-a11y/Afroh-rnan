const fs = require('fs');
const path = require('path');
const { sendTemplateEmail, sendHtmlEmail, parseFromAddress } = require('./mailersend');
const { resolveOrderNumber } = require('./order-number');

const CUSTOMER_TEMPLATE_PATH = path.join(__dirname, 'templates', 'order-confirmation.html');
const ADMIN_TEMPLATE_PATH = path.join(__dirname, 'templates', 'afrohörnan_admin_order_notification.html');
const REFUND_TEMPLATE_PATH = path.join(__dirname, 'templates', 'refund-email.html');

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

function formatOrderNumber(order, orderId) {
  return resolveOrderNumber(order, orderId);
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

function formatPickupStore(order) {
  if (order.pickupStore === 'fittja') return 'Fittja';
  if (order.pickupStore === 'marsta') return 'Märsta';
  return order.pickupStore || '';
}

function siteOrigin() {
  return process.env.SITE_URL || 'https://afrohornan.com';
}

function isCourseItem(item) {
  return item?.productType === 'course' || item?.isCourse === true;
}

function isCourseOrder(order) {
  return (Array.isArray(order?.items) ? order.items : []).some(isCourseItem);
}

function getCourseItems(order) {
  return (Array.isArray(order?.items) ? order.items : []).filter(isCourseItem);
}

function getCourseName(order) {
  const courses = getCourseItems(order);
  if (!courses.length) return 'Kurs';
  if (courses.length === 1) return courses[0].name || 'Kurs';
  return courses.map((item) => item.name).filter(Boolean).join(', ');
}

function buildCourseTemplateData(order, orderId, options = {}) {
  const customer = order.customer || {};
  const orderDate = resolveOrderDate(order);
  const portalUrl = options.coursePortalUrl || `${siteOrigin()}/profile.html`;

  return {
    customer_name: customer.name || 'Kund',
    course_name: getCourseName(order),
    order_number: formatOrderNumber(order, orderId),
    order_datetime: formatOrderDateTime(orderDate),
    order_date: formatOrderDate(orderDate),
    total_price: formatPrice(orderTotal(order)),
    customer_email: customer.email || '',
    customer_phone: customer.phone || '',
    course_login_link: portalUrl,
    account_link: portalUrl,
  };
}

function buildShippingSection(order) {
  if (order.fulfillment === 'pickup') return '';
  const shipping = Number.isFinite(Number(order.shipping)) ? Number(order.shipping) : 0;
  const method = order.shippingMethod === 'postnord' || !order.shippingMethod
    ? 'PostNord - Spårbart Ombud'
    : 'Frakt';
  return `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e8dcc8;">
        <div>
          <p style="color: #2b1810; font-size: 14px; margin: 0; font-weight: 500;">Frakt</p>
          <p style="color: #8a6a3e; font-size: 12px; margin: 2px 0 0;">${escapeHtml(method)}</p>
        </div>
        <p style="color: #2b1810; font-size: 14px; margin: 0;">${shipping === 0 ? 'Gratis' : `${escapeHtml(formatPrice(shipping))} kr`}</p>
      </div>`;
}

function buildDeliverySection(order) {
  const customer = order.customer || {};
  if (order.fulfillment === 'pickup') {
    const store = formatPickupStore(order);
    return `
    <div style="margin: 1rem 2rem 1.5rem; background: #2b1810; border-left: 3px solid #c9a84c; border-radius: 0 8px 8px 0; padding: 0.85rem 1rem;">
      <p style="color: #c9a84c; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 4px;">Hämtning i butik</p>
      <p style="color: #f9f3eb; font-size: 13px; line-height: 1.6; margin: 0;">Vi förbereder din order till hämtning i <strong>${escapeHtml(store)}</strong>. Vi hör av oss när den är redo.</p>
    </div>`;
  }

  return `
    <div style="margin: 1rem 2rem 1.5rem; background: #2b1810; border-left: 3px solid #c9a84c; border-radius: 0 8px 8px 0; padding: 0.85rem 1rem;">
      <p style="color: #c9a84c; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 4px;">Leveransstatus</p>
      <p style="color: #f9f3eb; font-size: 13px; line-height: 1.6; margin: 0;">Vi packar din order och skickar den med PostNord. Du får besked när den är på väg.</p>
    </div>
    <div style="padding: 0 2rem 1.5rem;">
      <p style="color: #8a6a3e; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 6px; border-bottom: 1px solid #d4b483; padding-bottom: 6px;">Leveransadress</p>
      <p style="color: #2b1810; font-size: 13px; line-height: 1.7; margin: 0;">${escapeHtml(customer.name || 'Kund')}<br>${escapeHtml(customer.address || '')}<br>${escapeHtml(customer.postal || '')} ${escapeHtml(customer.city || '')}</p>
    </div>`;
}

function buildCustomerEmailCopy(order) {
  const isPickup = order.fulfillment === 'pickup';
  const store = formatPickupStore(order);
  const accountLink = `${siteOrigin()}/profile.html`;

  if (isPickup) {
    return {
      payment_confirmation: `Din betalning har gått igenom och din order till hämtning i ${store} är nu bekräftad. Vi är så glada över att ha dig som kund!`,
      next_steps_title: 'Hur du hämtar din order',
      next_steps_body: 'Du kan följa din order och se dina uppgifter på ditt konto. Vi kontaktar dig när ordern är redo att hämtas i butiken.',
      account_link: accountLink,
      account_link_label: 'Gå till mitt konto',
    };
  }

  return {
    payment_confirmation: 'Din betalning har gått igenom och din beställning är nu bekräftad. Vi är så glada över att ha dig som kund!',
    next_steps_title: 'Vad händer nu?',
    next_steps_body: 'Vi packar din order och skickar den med PostNord till adressen du angav vid köpet. Du kan följa din order och se dina uppgifter på ditt konto.',
    account_link: accountLink,
    account_link_label: 'Gå till mitt konto',
  };
}

function renderOrderConfirmationEmail(order, orderId) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const orderDate = resolveOrderDate(order);
  const copy = buildCustomerEmailCopy(order);

  return applyReplacements(loadTemplate(CUSTOMER_TEMPLATE_PATH), {
    customer_name: escapeHtml(customer.name || 'Kund'),
    order_number: escapeHtml(formatOrderNumber(order, orderId)),
    order_date: escapeHtml(formatOrderDate(orderDate)),
    order_datetime: escapeHtml(formatOrderDateTime(orderDate)),
    product_rows: buildCustomerProductRows(items),
    shipping_section: buildShippingSection(order),
    delivery_section: buildDeliverySection(order),
    total_price: escapeHtml(formatPrice(orderTotal(order))),
    payment_confirmation: escapeHtml(copy.payment_confirmation),
    next_steps_title: escapeHtml(copy.next_steps_title),
    next_steps_body: escapeHtml(copy.next_steps_body),
    account_link: copy.account_link,
    account_link_label: escapeHtml(copy.account_link_label),
  });
}

function buildOrderSummary(items) {
  const names = (items || []).map((item) => String(item.name || 'Produkt').trim()).filter(Boolean);
  if (!names.length) return 'Produkter';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} + ${names.length - 1} till`;
}

function orderItemsSubtotal(items) {
  return (items || []).reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
    0,
  );
}

function buildPostNordTrackingLink(trackingNumber) {
  const value = String(trackingNumber || '').trim();
  if (!value || value === '—') return 'https://www.postnord.se/track';
  return `https://www.postnord.se/track#/step1?shipmentId=${encodeURIComponent(value)}`;
}

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return result;
}

function formatDeliveryDate(date) {
  const value = date instanceof Date ? date : new Date(date || Date.now());
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(value);
}

function buildDeliveryProductLine(item) {
  if (!item) {
    return { name: '—', qty: '—', price: '—' };
  }
  const name = item.name || 'Produkt';
  const displayName = item.colorName ? `${name} (${item.colorName})` : name;
  const qty = Number(item.qty) || 1;
  return {
    name: displayName,
    qty: String(qty),
    price: formatPrice((Number(item.price) || 0) * qty),
  };
}

function buildDeliveryTemplateData(order, orderId, options = {}) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const orderNumber = formatOrderNumber(order, orderId);
  const rawTracking = String(options.trackingNumber || order.trackingNumber || '').trim();
  const trackingNumber = rawTracking || '—';
  const shippedDate = new Date();
  const estimatedDelivery = addBusinessDays(shippedDate, 3);
  const shippingMethod = order.shippingMethod === 'postnord' || !order.shippingMethod
    ? 'PostNord - Spårbart Ombud'
    : 'Frakt';
  const product1 = buildDeliveryProductLine(items[0]);
  const product2 = buildDeliveryProductLine(items[1]);

  return {
    customer_name: customer.name || 'Kund',
    tracking_number: trackingNumber,
    tracking_url: buildPostNordTrackingLink(rawTracking),
    carrier_name: 'PostNord',
    order_number: orderNumber,
    shipped_date: formatDeliveryDate(shippedDate),
    estimated_delivery: formatDeliveryDate(estimatedDelivery),
    shipping_method: shippingMethod,
    product_1_name: product1.name,
    product_1_qty: product1.qty,
    product_1_price: product1.price,
    product_2_name: product2.name,
    product_2_qty: product2.qty,
    product_2_price: product2.price,
    customer_address: customer.address || '',
    customer_postal: customer.postal || '',
    customer_city: customer.city || '',
  };
}

async function sendDeliveryCustomerEmail(order, orderId, mailersend, options = {}) {
  const customer = order.customer || {};
  const toEmail = String(customer.email || '').trim();
  if (!toEmail || !toEmail.includes('@')) {
    throw new Error('Order saknar kundens e-postadress');
  }

  if (!mailersend?.apiKey) {
    throw new Error('MailerSend API key is not configured');
  }

  const templateId = mailersend.deliveryTemplateId;
  if (!templateId) {
    throw new Error('MailerSend leveransmall saknas (MAILERSEND_DELIVERY_TEMPLATE_ID)');
  }

  const from = parseFromAddress(mailersend.from);
  const data = buildDeliveryTemplateData(order, orderId, options);

  await sendTemplateEmail({
    apiKey: mailersend.apiKey,
    templateId,
    toEmail,
    toName: customer.name || toEmail,
    fromEmail: from.email,
    fromName: from.name,
    subject: 'Din Leverans är på Väg',
    data,
  });
}

function buildRefundEmailData(order, orderId, refundAmount) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const orderNumber = formatOrderNumber(order, orderId);
  const refundTotal = Number(refundAmount) || 0;
  const itemsSubtotal = Number.isFinite(Number(order.subtotal))
    ? Number(order.subtotal)
    : orderItemsSubtotal(items);

  let productName = buildOrderSummary(items);
  let productPrice = itemsSubtotal;

  if (items.length === 1) {
    const item = items[0];
    productName = item.name || 'Produkt';
    if (item.colorName) productName += ` (${item.colorName})`;
    productPrice = (Number(item.price) || 0) * (Number(item.qty) || 1);
  }

  return {
    customer_name: customer.name || 'Kund',
    product_name: productName,
    order_number: orderNumber,
    product_price: formatPrice(productPrice),
    refund_total: formatPrice(refundTotal),
  };
}

function renderRefundEmail(order, orderId, refundAmount) {
  const data = buildRefundEmailData(order, orderId, refundAmount);
  return applyReplacements(loadTemplate(REFUND_TEMPLATE_PATH), {
    customer_name: escapeHtml(data.customer_name),
    product_name: escapeHtml(data.product_name),
    order_number: escapeHtml(data.order_number),
    product_price: escapeHtml(data.product_price),
    refund_total: escapeHtml(data.refund_total),
  });
}

async function sendRefundEmail(order, orderId, refundAmount, mailersend) {
  const customer = order.customer || {};
  const toEmail = String(customer.email || '').trim();
  if (!toEmail || !toEmail.includes('@')) {
    throw new Error('Order saknar kundens e-postadress');
  }

  const data = buildRefundEmailData(order, orderId, refundAmount);

  if (mailersend?.apiKey && mailersend?.refundTemplateId) {
    const from = parseFromAddress(mailersend.from);
    await sendTemplateEmail({
      apiKey: mailersend.apiKey,
      templateId: mailersend.refundTemplateId,
      toEmail,
      toName: customer.name || toEmail,
      fromEmail: from.email,
      fromName: from.name,
      subject: 'Återbetalning Bekräftad',
      data,
    });
    return;
  }

  const html = renderRefundEmail(order, orderId, refundAmount);

  await deliverEmail({
    mailersend,
    toEmail,
    toName: customer.name || toEmail,
    subject: `Återbetalning bekräftad | Order ${data.order_number}`,
    html,
    text: [
      `Hej ${data.customer_name},`,
      '',
      'Din återbetalning har behandlats och är på väg tillbaka till dig. Pengarna bör synas inom 3–5 bankdagar.',
      '',
      'Återbetalningsdetaljer',
      `Produkt: ${data.product_name}`,
      `Order: ${data.order_number}`,
      `Belopp: ${data.refund_total} kr`,
      '',
      'Frågor? Kontakta oss på info@afrohornan.com',
      'https://afrohornan.com',
    ].join('\n'),
  });
}

function buildAdminAddressSection(order, pickupStore) {
  const customer = order.customer || {};
  if (pickupStore) {
    return `
    <div style="padding:1rem 2rem 0;">
      <p style="color:#8a6a3e;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;border-bottom:1px solid #d4b483;padding-bottom:5px;">Hämtning</p>
      <p style="color:#2b1810;font-size:13px;line-height:1.7;margin:0;">Butik: <strong>${escapeHtml(pickupStore)}</strong></p>
    </div>`;
  }

  return `
    <div style="padding:1rem 2rem 0;">
      <p style="color:#8a6a3e;font-size:10px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;border-bottom:1px solid #d4b483;padding-bottom:5px;">Leveransadress</p>
      <p style="color:#2b1810;font-size:13px;line-height:1.7;margin:0;">
        ${escapeHtml(customer.address || '')}<br>
        ${escapeHtml(customer.postal || '')} ${escapeHtml(customer.city || '')}<br>
        ${escapeHtml(customer.country || 'Sverige')}
      </p>
    </div>`;
}

function buildAdminFulfillmentRow(pickupStore) {
  if (!pickupStore) {
    return `
        <tr>
          <td style="color:#8a6a3e;padding:5px 0;">Leverans</td>
          <td style="color:#2b1810;padding:5px 0;">Till brevlåda</td>
        </tr>`;
  }

  return `
        <tr>
          <td style="color:#8a6a3e;padding:5px 0;">Hämtning</td>
          <td style="color:#2b1810;padding:5px 0;">${escapeHtml(pickupStore)}</td>
        </tr>`;
}

function buildAdminNextSteps(pickupStore) {
  if (pickupStore) {
    return `Förbered ordern till hämtning i ${pickupStore} → kontakta kunden när den är redo → markera ordern som klar i systemet.`;
  }
  return 'Plocka och packa produkterna → märk paketet med leveransadressen → skicka ordern → markera som skickad i systemet.';
}

function renderAdminOrderNotificationEmail(order, orderId, paymentMethod, options = {}) {
  const customer = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const orderDate = resolveOrderDate(order);
  const pickupStore = options.pickupStore || (
    order.pickupStore === 'fittja' ? 'Fittja' : order.pickupStore === 'marsta' ? 'Märsta' : order.pickupStore || ''
  );
  const orderSummary = buildOrderSummary(items);

  return applyReplacements(loadTemplate(ADMIN_TEMPLATE_PATH), {
    order_number: escapeHtml(formatOrderNumber(order, orderId)),
    order_datetime: escapeHtml(formatOrderDateTime(orderDate)),
    order_summary: escapeHtml(orderSummary),
    customer_name: escapeHtml(customer.name || (pickupStore ? 'Hämtning i butik' : 'Kund')),
    customer_email: escapeHtml(customer.email || '—'),
    customer_phone: escapeHtml(customer.phone || '—'),
    address_section: buildAdminAddressSection(order, pickupStore),
    fulfillment_row: buildAdminFulfillmentRow(pickupStore),
    product_rows: buildAdminProductRows(items),
    total_price: escapeHtml(formatPrice(orderTotal(order))),
    payment_method: escapeHtml(paymentMethod || (pickupStore ? `Hämtning i butik – ${pickupStore}` : 'Kort')),
    next_steps: escapeHtml(buildAdminNextSteps(pickupStore)),
  });
}

async function deliverEmail({ mailersend, toEmail, toName, subject, html, text }) {
  const fromString = mailersend?.from || 'Afrohörnan <info@afrohornan.com>';
  const from = parseFromAddress(fromString);
  const apiKey = mailersend?.apiKey || '';

  if (!apiKey) {
    throw new Error('MailerSend API key is not configured');
  }

  await sendHtmlEmail({
    apiKey,
    toEmail,
    toName,
    fromEmail: from.email,
    fromName: from.name,
    subject,
    html,
    text,
  });
}

async function sendOrderConfirmationEmail(order, orderId, mailersend) {
  const customer = order.customer || {};
  if (!customer.email) {
    throw new Error('Order is missing customer email');
  }

  const html = renderOrderConfirmationEmail(order, orderId);
  const orderNumber = formatOrderNumber(order, orderId);
  const orderDate = resolveOrderDate(order);
  const copy = buildCustomerEmailCopy(order);

  await deliverEmail({
    mailersend,
    toEmail: customer.email,
    toName: customer.name || customer.email,
    subject: `Tack för ditt köp! 🎉 | Orderbekräftelse ${orderNumber}`,
    html,
    text: [
      `Hej ${customer.name || 'Kund'}, tack för ditt köp! 🎉`,
      '',
      copy.payment_confirmation,
      '',
      copy.next_steps_title,
      copy.next_steps_body,
      copy.account_link,
      '',
      'Dina orderdetaljer:',
      `Ordernummer: ${orderNumber}`,
      `Datum & tid: ${formatOrderDateTime(orderDate)}`,
      `Pris: ${formatPrice(orderTotal(order))} kr`,
      '',
      'Frågor? Kontakta oss på info@afrohornan.com',
    ].join('\n'),
  });
}

async function sendCourseCustomerEmail(order, orderId, mailersend) {
  const customer = order.customer || {};
  if (!customer.email) {
    throw new Error('Order is missing customer email');
  }

  const from = parseFromAddress(mailersend.from);
  const data = buildCourseTemplateData(order, orderId, mailersend);

  await sendTemplateEmail({
    apiKey: mailersend.apiKey,
    templateId: mailersend.courseCustomerTemplateId,
    toEmail: customer.email,
    toName: customer.name || customer.email,
    fromEmail: from.email,
    fromName: from.name,
    data,
  });
}

async function sendCourseAdminEmail(order, orderId, mailersend) {
  const adminTo = mailersend.adminTo || 'info@afrohornan.com';
  const from = parseFromAddress(mailersend.from);
  const data = buildCourseTemplateData(order, orderId, mailersend);

  await sendTemplateEmail({
    apiKey: mailersend.apiKey,
    templateId: mailersend.courseAdminTemplateId,
    toEmail: adminTo,
    toName: 'Afrohörnan',
    fromEmail: from.email,
    fromName: from.name,
    data,
  });
}

async function sendPaidOrderEmails(order, orderId, mailersend, adminOptions = {}) {
  const useCourseTemplates = isCourseOrder(order)
    && mailersend?.apiKey
    && mailersend?.courseCustomerTemplateId
    && mailersend?.courseAdminTemplateId;

  if (useCourseTemplates) {
    await sendCourseCustomerEmail(order, orderId, mailersend);
    await sendCourseAdminEmail(order, orderId, mailersend);
    return;
  }

  await sendOrderConfirmationEmail(order, orderId, mailersend);
  await sendAdminOrderNotificationEmail(order, orderId, adminOptions, mailersend);
}

/**
 * Skickar kund- och adminmejl om de inte redan skickats.
 * Kastar inte – returnerar fel så att betalningsflödet kan slutföras ändå.
 */
async function sendOrderEmailsIfNeeded(order, orderId, mailersend, adminOptions = {}) {
  const result = {
    customerSent: Boolean(order.emailSentAt),
    adminSent: Boolean(order.adminEmailSentAt),
    errors: {},
  };

  if (!mailersend?.apiKey) {
    const message = 'MailerSend API key is not configured';
    result.errors.config = message;
    return result;
  }

  const courseTemplatesReady = isCourseOrder(order)
    && mailersend.apiKey
    && mailersend.courseCustomerTemplateId
    && mailersend.courseAdminTemplateId;

  if (!order.emailSentAt) {
    try {
      if (courseTemplatesReady) {
        await sendCourseCustomerEmail(order, orderId, mailersend);
      } else {
        await sendOrderConfirmationEmail(order, orderId, mailersend);
      }
      result.customerSent = true;
    } catch (err) {
      console.error('Customer order email failed:', orderId, err.message);
      result.errors.customer = err.message;
    }
  }

  if (!order.adminEmailSentAt) {
    try {
      if (courseTemplatesReady) {
        await sendCourseAdminEmail(order, orderId, mailersend);
      } else {
        await sendAdminOrderNotificationEmail(order, orderId, adminOptions, mailersend);
      }
      result.adminSent = true;
    } catch (err) {
      console.error('Admin order email failed:', orderId, err.message);
      result.errors.admin = err.message;
    }
  }

  return result;
}

async function sendAdminOrderNotificationEmail(order, orderId, options = {}, mailersend = {}) {
  const adminTo = mailersend.adminTo || 'info@afrohornan.com';
  const html = renderAdminOrderNotificationEmail(order, orderId, options.paymentMethod, options);
  const orderNumber = formatOrderNumber(order, orderId);
  const customer = order.customer || {};
  const pickupStore = options.pickupStore || '';
  const items = Array.isArray(order.items) ? order.items : [];
  const orderSummary = buildOrderSummary(items);
  const customerName = customer.name || (pickupStore ? 'Hämtning i butik' : 'Kund');
  const orderDate = resolveOrderDate(order);

  const subject = pickupStore
    ? `🔔 Ny hämtningsorder! | ${customerName} – ${pickupStore}`
    : `🔔 Ny beställning! | ${customerName} har köpt ${orderSummary}`;

  await deliverEmail({
    mailersend,
    toEmail: adminTo,
    toName: 'Afrohörnan',
    subject,
    html,
    text: [
      pickupStore ? 'En ny hämtningsorder har lagts!' : 'En ny kund har lagt en order!',
      '',
      'KUNDINFORMATION',
      `Namn: ${customerName}`,
      `E-postadress: ${customer.email || '—'}`,
      `Telefonnummer: ${customer.phone || '—'}`,
      '',
      'ORDERDETALJER',
      `Produkter: ${orderSummary}`,
      `Ordernummer: ${orderNumber}`,
      `Datum & tid: ${formatOrderDateTime(orderDate)}`,
      `Summa betald: ${formatPrice(orderTotal(order))} kr`,
      pickupStore ? `Hämtning: ${pickupStore}` : `Leverans: ${customer.address || ''}, ${customer.postal || ''} ${customer.city || ''}`,
      '',
      `Betalningsmetod: ${options.paymentMethod || (pickupStore ? `Hämtning i butik – ${pickupStore}` : 'Kort')}`,
    ].filter(Boolean).join('\n'),
  });
}

module.exports = {
  renderOrderConfirmationEmail,
  renderAdminOrderNotificationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotificationEmail,
  sendCourseCustomerEmail,
  sendCourseAdminEmail,
  sendPaidOrderEmails,
  sendOrderEmailsIfNeeded,
  sendDeliveryCustomerEmail,
  sendRefundEmail,
  isCourseOrder,
  formatOrderNumber,
};
